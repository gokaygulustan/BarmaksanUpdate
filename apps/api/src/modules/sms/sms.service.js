import { prisma } from '../../lib/prisma.js';
import { getFrontendBaseUrl } from '../../config/frontendUrl.js';
import { ensureQuoteShortCodeByToken } from '../../lib/quoteShortCode.js';

const NETGSM_URL = 'https://api.netgsm.com.tr/sms/send/get';

export const ensureSmsSettingsRow = async () => {
  await prisma.smsSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', isActive: false, updatedAt: new Date() },
    update: {},
  });
};

export const getSmsSettingsPublic = async () => {
  await ensureSmsSettingsRow();
  const row = await prisma.smsSettings.findUnique({ where: { id: 'default' } });
  return {
    usercode: row?.usercode || '',
    msgheader: row?.msgheader || '',
    isActive: Boolean(row?.isActive),
    hasPassword: Boolean(row?.password?.length),
  };
};

export const updateSmsSettings = async (data) => {
  await ensureSmsSettingsRow();
  const update = {};
  if (data.usercode !== undefined) update.usercode = data.usercode ? String(data.usercode).trim() : null;
  if (data.msgheader !== undefined) update.msgheader = data.msgheader ? String(data.msgheader).trim() : null;
  if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);
  if (data.password !== undefined && data.password !== '' && data.password !== null) {
    update.password = String(data.password);
  }
  return prisma.smsSettings.update({
    where: { id: 'default' },
    data: update,
  });
};

const digitsPhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  else if (d.length === 10) d = `90${d}`;
  else if (!d.startsWith('90') && d.length >= 10) d = `90${d.slice(-10)}`;
  return d;
};

const NETGSM_FAIL = {
  '20': 'Mesaj metni hatalı.',
  '30': 'Kullanıcı kodu veya şifre hatalı.',
  '40': 'Mesaj başlığı (originator) onaylı değil.',
  '50': 'IYS kontrollü gönderim: alıcı kaydı yok.',
  '51': 'IYS marka bilgisi hatalı.',
  '70': 'Parametre hatası. Kullanıcı kodu, şifre ve başlığı kontrol edin.',
  '80': 'Gönderim sınırına ulaşıldı veya hesap kapalı.',
  '85': 'Zaman damgası hatalı.',
};

const loadSmsCredentials = async () => {
  await ensureSmsSettingsRow();
  const row = await prisma.smsSettings.findUnique({ where: { id: 'default' } });
  return {
    row,
    usercode: row?.usercode || process.env.NETGSM_USERCODE || '',
    password: row?.password || process.env.NETGSM_PASSWORD || '',
    msgheader: row?.msgheader || process.env.NETGSM_MSGHEADER || '',
  };
};

const sendNetgsm = async ({ gsmno, message }) => {
  const { usercode, password, msgheader } = await loadSmsCredentials();
  if (!usercode || !password || !msgheader) {
    const err = new Error('NetGSM kullanıcı kodu, şifre ve mesaj başlığı kayıtlı olmalı.');
    err.statusCode = 400;
    throw err;
  }

  const body = new URLSearchParams({
    usercode,
    password,
    gsmno,
    msgheader,
    message,
    dil: 'TR',
    encoding: 'TR',
  });

  // POST: teklif URL’li mesajlar GET query limitine takılmasın
  const res = await fetch(NETGSM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = (await res.text()).trim();
  const code = text.split(' ')[0];
  if (code === '00' || code === '01' || code === '02') {
    return { ok: true, code, raw: text };
  }
  const err = new Error(NETGSM_FAIL[code] || `NetGSM yanıtı: ${text || 'bilinmeyen hata'}`);
  err.statusCode = 502;
  throw err;
};

/**
 * Tedarikçiye kısa SMS (NetGSM).
 * force=true: ayarlardaki “aktif” kapısını atlar (elle gönder / admin).
 * SMS’te /q/:kısaKod kullanılır (uzun quoteToken e-postada kalır).
 */
export const sendVendorSms = async ({
  vendor,
  request,
  quoteToken,
  quoteShortCode = null,
  phoneOverride = null,
  force = false,
}) => {
  const { row } = await loadSmsCredentials();
  if (!force && !row?.isActive) {
    return { ok: false, phone: null, reason: 'SMS bildirimleri kapalı. Ayarlar → SMS üzerinden açın.' };
  }

  // Elle numara verildiyse yalnızca ona, verilmediyse tedarikçinin tüm yetkili numaralarına
  const targets = phoneOverride
    ? [digitsPhone(phoneOverride)].filter(Boolean)
    : [
        ...new Set(
          [
            vendor?.contactPhone,
            ...(vendor?.contacts || []).map((contact) => contact?.phone),
            ...(vendor?.extraContactPhones || []),
          ]
            .map((value) => digitsPhone(value))
            .filter(Boolean),
        ),
      ];
  if (!targets.length) return { ok: false, phone: null, reason: 'Geçerli telefon numarası yok.' };

  const portalUrl = getFrontendBaseUrl();
  let shortCode = quoteShortCode || null;
  if (!shortCode && quoteToken) {
    try {
      shortCode = await ensureQuoteShortCodeByToken(quoteToken);
    } catch (err) {
      console.error('SMS kısa kod üretilemedi:', err.message);
    }
  }
  const quoteUrl = shortCode
    ? `${portalUrl}/q/${shortCode}`
    : quoteToken
      ? `${portalUrl}/quote/${quoteToken}`
      : portalUrl;
  const title = String(request?.title || 'Satın alma talebi')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const until = request?.deadline
    ? (() => {
        const d = new Date(request.deadline);
        if (Number.isNaN(d.getTime())) return '';
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
      })()
    : '';
  // dil=TR: Türkçe karakter (çğıöşü) korunur. \w ile silmek "Askı"yı "Ask" yapıyordu.
  const message = until
    ? `Uğur Promilling fiyat talebi: ${title}. Son gün: ${until}. Bağlantı: ${quoteUrl}`
    : `Uğur Promilling fiyat talebi: ${title}. Bağlantı: ${quoteUrl}`;

  const display = (gsmno) =>
    gsmno.length === 12 && gsmno.startsWith('90')
      ? `0${gsmno.slice(2, 5)} ${gsmno.slice(5, 8)} ${gsmno.slice(8, 10)} ${gsmno.slice(10)}`
      : gsmno;

  const sentPhones = [];
  const failures = [];
  for (const gsmno of targets) {
    try {
      await sendNetgsm({ gsmno, message });
      console.log(`SMS NetGSM OK → ${gsmno} (${vendor?.name}) short=${shortCode || 'fallback'}`);
      sentPhones.push(display(gsmno));
    } catch (err) {
      console.error(`SMS NetGSM gönderilemedi (${vendor?.name} / ${gsmno}):`, err.message);
      failures.push(`${display(gsmno)}: ${err.message || 'NetGSM gönderimi başarısız.'}`);
    }
  }

  if (!sentPhones.length) {
    return {
      ok: false,
      phone: targets.map(display).join(', '),
      reason: failures.join(' | ') || 'NetGSM gönderimi başarısız.',
    };
  }

  return {
    ok: true,
    phone: sentPhones.join(', '),
    // Bir numaraya gidip diğerine gitmediyse kullanıcıya sebebini göster
    reason: failures.length ? `Gönderilemeyen: ${failures.join(' | ')}` : null,
  };
};

const vendorTargets = (vendor) => [
  ...new Set(
    [vendor?.contactPhone, ...(vendor?.contacts || []).map((c) => c?.phone), ...(vendor?.extraContactPhones || [])]
      .map((value) => digitsPhone(value))
      .filter(Boolean),
  ),
];

/** Onay SMS'i: bağlantı ve fiyat yok, yalnız bilgilendirme. */
export const buildVendorApprovedSmsText = ({ title, itemCount }) => {
  const t = String(title || 'Fiyat teklifi').replace(/\s+/g, ' ').trim().slice(0, 80);
  const count = Number(itemCount) > 0 ? ` (${Number(itemCount)} kalem)` : '';
  return `Uğur Promilling: "${t}" fiyat teklifiniz${count} onaylanmıştır. Sipariş detayları için satın alma birimimiz sizinle iletişime geçecektir.`;
};

export const sendVendorApprovedSms = async ({ vendor, request, itemCount }) => {
  const { row } = await loadSmsCredentials();
  if (!row?.isActive) return { ok: false, reason: 'SMS bildirimleri kapalı.' };
  const targets = vendorTargets(vendor);
  if (!targets.length) return { ok: false, reason: 'Geçerli telefon numarası yok.' };
  const message = buildVendorApprovedSmsText({ title: request?.title, itemCount });
  let sent = 0;
  for (const gsmno of targets) {
    try {
      await sendNetgsm({ gsmno, message });
      sent += 1;
    } catch (err) {
      console.error(`Onay SMS'i gönderilemedi (${vendor?.name} / ${gsmno}):`, err.message);
    }
  }
  return { ok: sent > 0, sent };
};

/** SMTP testindeki gibi kapıdan bağımsız. Kayıtlı hesabı doğrular. */
export const sendTestSms = async (to) => {
  const gsmno = digitsPhone(to);
  if (!gsmno) {
    const err = new Error('Geçerli bir cep numarası girin.');
    err.statusCode = 400;
    throw err;
  }
  await sendNetgsm({
    gsmno,
    message: 'Ugur Promilling SMS testi. NetGSM hesabiniz calisiyor.',
  });
  return { ok: true, to: gsmno };
};
