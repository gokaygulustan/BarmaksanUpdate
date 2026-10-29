import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/** TCMB erişilemediğinde kullanılan 2026 projeksiyonu (1 birim döviz kaç TL). */
export const FALLBACK_RATES_TO_TRY = { TRY: 1, USD: 52.5, EUR: 57.2, CHF: 59 };

const RATE_CACHE_TTL_MS = 60 * 60 * 1000; // canlı kur 1 saat boyunca yeniden kullanılır
const RATE_RETRY_TTL_MS = 5 * 60 * 1000; // TCMB erişilemezse 5 dk sonra tekrar denenir

/** @type {{ rates: Record<string, number>, source: string, fetchedAt: number, isLive: boolean } | null} */
let ratesCache = null;

/**
 * Onay limiti gibi tek para birimli karşılaştırmalar için TL'ye çevirme kurları.
 * Canlı kur alınamazsa önce son başarılı değer, o da yoksa projeksiyon kullanılır;
 * hangi kaynağın kullanıldığı `source` ile birlikte döner (onay geçmişine yazılır).
 *
 * @returns {Promise<{ rates: Record<string, number>, source: string, fetchedAt: Date, isLive: boolean }>}
 */
export async function getRatesToTRY({ force = false } = {}) {
  const now = Date.now();
  const ttl = ratesCache?.isLive ? RATE_CACHE_TTL_MS : RATE_RETRY_TTL_MS;
  if (!force && ratesCache && now - ratesCache.fetchedAt < ttl) {
    return { ...ratesCache, fetchedAt: new Date(ratesCache.fetchedAt) };
  }

  const live = await getTCMBRates();
  if (live && live.USD > 0 && live.EUR > 0) {
    const chf = Number(live.CHF);
    ratesCache = {
      rates: {
        TRY: 1,
        USD: live.USD,
        EUR: live.EUR,
        CHF: Number.isFinite(chf) && chf > 0 ? chf : FALLBACK_RATES_TO_TRY.CHF,
      },
      source: 'TCMB_LIVE',
      fetchedAt: now,
      isLive: true,
    };
  } else if (ratesCache) {
    // Canlı kur alınamadı: son başarılı değerle devam et, kaynağı bayat olarak işaretle.
    ratesCache = {
      rates: ratesCache.rates,
      source: ratesCache.source.endsWith('_STALE') ? ratesCache.source : `${ratesCache.source}_STALE`,
      fetchedAt: now,
      isLive: false,
    };
  } else {
    ratesCache = {
      rates: { ...FALLBACK_RATES_TO_TRY },
      source: 'FALLBACK_PROJECTION_2026',
      fetchedAt: now,
      isLive: false,
    };
  }

  return { ...ratesCache, fetchedAt: new Date(ratesCache.fetchedAt) };
}

/**
 * Verilen tutarı kur tablosuna göre TL'ye çevirir; bilinmeyen para birimi 1:1.
 * fxOverride: { USD, EUR, CHF } veya (eski) sayı = yalnızca USD.
 */
export function convertToTRY(amount, currency, rates = FALLBACK_RATES_TO_TRY, fxOverride = null) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  const code = currency || 'TRY';
  if (code === 'TRY') return value;

  let locked = null;
  if (fxOverride != null && typeof fxOverride === 'object' && !Array.isArray(fxOverride)) {
    locked = Number(fxOverride[code]);
  } else if (code === 'USD' && Number(fxOverride) > 0) {
    locked = Number(fxOverride);
  }
  if (Number.isFinite(locked) && locked > 0) return value * locked;

  const rate = Number(rates?.[code]);
  return value * (Number.isFinite(rate) && rate > 0 ? rate : 1);
}

/** fxRatesJson / canlı payload → güvenli { TRY, USD, EUR, CHF }. */
export function normalizeRatesToTRY(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const usd = Number(src.USD);
  const eur = Number(src.EUR);
  const chf = Number(src.CHF);
  return {
    TRY: 1,
    USD: Number.isFinite(usd) && usd > 0 ? usd : FALLBACK_RATES_TO_TRY.USD,
    EUR: Number.isFinite(eur) && eur > 0 ? eur : FALLBACK_RATES_TO_TRY.EUR,
    CHF: Number.isFinite(chf) && chf > 0 ? chf : FALLBACK_RATES_TO_TRY.CHF,
  };
}

/**
 * Talep durumuna göre kur seçer.
 * COMPLETED + fx snapshot → kilitli; eski COMPLETED (fx yok) → canlı + legacyUnlocked.
 */
export async function resolveRatesForRequest(request, { force = false } = {}) {
  const status = request?.status;
  const frozenAt = request?.fxFrozenAt ? new Date(request.fxFrozenAt) : null;
  const hasFreeze = Boolean(frozenAt && !Number.isNaN(frozenAt.getTime()) && request?.fxRatesJson);

  if (status === 'COMPLETED' && hasFreeze) {
    const rates = normalizeRatesToTRY(request.fxRatesJson);
    const fetchedAt = request.fxFetchedAt ? new Date(request.fxFetchedAt) : frozenAt;
    return {
      rates,
      source: request.fxSource || 'FROZEN',
      fetchedAt,
      isLive: false,
      isFrozen: true,
      legacyUnlocked: false,
      frozenAt,
    };
  }

  const live = await getRatesToTRY({ force });
  if (status === 'COMPLETED' && !hasFreeze) {
    return {
      ...live,
      isFrozen: false,
      legacyUnlocked: true,
      frozenAt: null,
    };
  }

  return {
    ...live,
    isFrozen: false,
    legacyUnlocked: false,
    frozenAt: null,
  };
}


/**
 * TCMB'den belirtilen tarih için döviz kurlarını çeker
 * Format: https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml
 * @param {Date} date
 * @returns {Promise<Object>} { USD, EUR, CHF, TRY }
 */
export async function getTCMBRates(date = new Date()) {
  const kurlar = { USD: 0, EUR: 0, CHF: 0, TRY: 1 };

  try {
    // Cumartesi (6) ve Pazar (0) için Cuma gününü bul
    let kurTarihi = new Date(date);
    const day = kurTarihi.getDay();

    if (day === 6) {
      // Cumartesi
      kurTarihi.setDate(kurTarihi.getDate() - 1);
    } else if (day === 0) {
      // Pazar
      kurTarihi.setDate(kurTarihi.getDate() - 2);
    }

    // Bugün mü kontrolü
    const today = new Date();
    const isToday = kurTarihi.toDateString() === today.toDateString();

    let url;
    if (isToday) {
      // Bugünün kurları (15:30 kuralı TCMB tarafında today.xml içinde yönetilir)
      url = 'https://www.tcmb.gov.tr/kurlar/today.xml';
    } else {
      const year = kurTarihi.getFullYear();
      const month = String(kurTarihi.getMonth() + 1).padStart(2, '0');
      const dayStr = String(kurTarihi.getDate()).padStart(2, '0');
      url = `https://www.tcmb.gov.tr/kurlar/${year}${month}/${dayStr}${month}${year}.xml`;
    }

    console.log(`📡 TCMB Kur çekiliyor: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000, // Timeout artırıldı (10s)
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*'
      },
      validateStatus: (status) => status < 500 // 404 gibi durumları da catch bloğuna düşürmeden yakalarız
    });

    if (response.status !== 200) {
      console.warn(`⚠ TCMB Yanıt vermedi (Status: ${response.status})`);
      return null;
    }

    // Gelen veri XML mi kontrol et (Bazen HTML hata sayfası dönebiliyor)
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('xml') && !response.data.trim().startsWith('<?xml')) {
      console.warn('⚠ TCMB Geçersiz XML yanıtı döndü.');
      return null;
    }

    const result = await parseStringPromise(response.data);
    
    // Güvenli anahtar erişimi
    if (!result?.Tarih_Date?.Currency) {
      console.warn('⚠ TCMB XML formatı beklenen yapıda değil.');
      return null;
    }

    const currencies = result.Tarih_Date.Currency;

    // USD
    const usd = currencies.find((c) => c.$.CurrencyCode === 'USD');
    if (usd && usd.BanknoteSelling && usd.BanknoteSelling[0]) {
      kurlar.USD = parseFloat(usd.BanknoteSelling[0].replace(',', '.'));
    }

    // EUR
    const eur = currencies.find((c) => c.$.CurrencyCode === 'EUR');
    if (eur && eur.BanknoteSelling && eur.BanknoteSelling[0]) {
      kurlar.EUR = parseFloat(eur.BanknoteSelling[0].replace(',', '.'));
    }

    const chf = currencies.find((c) => c.$.CurrencyCode === 'CHF');
    if (chf && chf.BanknoteSelling && chf.BanknoteSelling[0]) {
      kurlar.CHF = parseFloat(chf.BanknoteSelling[0].replace(',', '.'));
    }

    console.log(`✅ TCMB Kurları başarıyla işlendi: USD:${kurlar.USD}, EUR:${kurlar.EUR}, CHF:${kurlar.CHF}`);
    return kurlar;
  } catch (error) {
    console.error('❌ TCMB Kur çekme kritik hatası:', error.message);
    // Hata durumunda null döneriz, router fallback tetikleyecektir
    return null;
  }
}
