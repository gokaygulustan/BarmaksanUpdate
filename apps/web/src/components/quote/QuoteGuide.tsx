'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, CircleHelp } from 'lucide-react';

const SEEN_KEY = 'up-quote-guide-seen';
const VIDEO_KEY = 'up-quote-guide-video';
const VIDEO_SRC = '/guides/UGUR_PROMILLING_Teklif_Rehberi_YENI.mp4';

const STEPS = [
  {
    target: 'guide-people',
    title: 'İlgili kişiler',
    body: 'Üstteki isim, telefon ve e-posta sizin muhatabınız. Satın alma yetkilisi de yanında durur.',
  },
  {
    target: 'guide-deadline',
    title: 'Son gün',
    body: 'Teklif tarihi ve son gün burada. Teklifi bu tarihe kadar göndermeniz gerekir.',
  },
  {
    target: 'guide-video',
    title: 'Rehber videosu',
    body: 'İlk açılışta kendiliğinden oynar ve bitince başa sarar. Başlığa basınca kapanır, tekrar basınca açılır.',
  },
  {
    target: 'guide-files',
    title: 'Fotoğraf ve belgeler',
    body: 'Satın alma dosyaları ile sizin ekleriniz ayrı listelenir. PDF, Excel, görsel, ZIP ve çizim ekleyebilirsiniz. Kaleme özel dosya kalemin altındadır.',
  },
  {
    target: 'guide-spec',
    title: 'Şartname',
    body: 'Marka, teslim yeri ve süre bu metindedir. Fiyatı buna göre verin. Başlığa basınca açılır kapanır.',
  },
  {
    target: 'guide-excel',
    title: 'Excel',
    body: 'Excel indir ile sarı hücrelere fiyat, para birimi, iskonto, KDV ve koşulları yazarsınız. Gri hücreler kilitlidir. Excel yükle forma işler. Yine Gönder’e basılır.',
  },
  {
    target: 'guide-group',
    title: 'Gruplar',
    body: 'Kalemler gruba ayrılır. Başlığa basınca grup açılır kapanır.',
  },
  {
    target: 'guide-qty',
    title: 'Miktar',
    body: 'Miktar ve birim kilitlidir, değiştirilmez. Her kalemde aynı düzen vardır.',
  },
  {
    target: 'guide-price',
    title: 'Birim fiyat',
    body: 'KDV hariç birim fiyatı buraya yazın. Her kalemin fiyatı ayrıdır.',
  },
  {
    target: 'guide-currency',
    title: 'Para birimi',
    body: 'TRY, dolar, euro veya frank. Kalem kalem seçilir.',
  },
  {
    target: 'guide-note',
    title: 'Kalem notu',
    body: 'Teslim süresi, marka veya alternatif bu nota yazılır. Şartnamede istenen bilgi buraya gelir.',
  },
  {
    target: 'guide-vat',
    title: 'KDV',
    body: '%1, %10 veya %20. Satır toplamına eklenir.',
  },
  {
    target: 'guide-discount',
    title: 'İskonto',
    body: 'Yüzde olarak yazılır. Boş bırakırsanız iskonto yok sayılır.',
  },
  {
    target: 'guide-line-total',
    title: 'Satır toplamı',
    body: 'Miktar çarpı birim fiyat, iskonto düşülür, KDV eklenir. Elle yazılmaz.',
  },
  {
    target: 'guide-ship',
    title: 'Nakliye',
    body: 'Fiyata nakliye dahilse EVET, ayrıca faturalanacaksa HAYIR.',
  },
  {
    target: 'guide-fx',
    title: 'Döviz kuru',
    body: 'Kur sabitse EVET deyip kuru yazın. Soru işareti açıklamayı açar. Tüm kalemler TL ise kur kutusu çıkmaz.',
  },
  {
    target: 'guide-maturity',
    title: 'Vade',
    body: 'Peşinse HAYIR. Vadeliyse EVET ve gün sayısını yazın.',
  },
  {
    target: 'guide-quote-note',
    title: 'Genel teklif notu',
    body: 'Tüm teklif için ortak not. Nakliye ve marka gibi bilgiler buraya yazılabilir.',
  },
  {
    target: 'guide-totals',
    title: 'Toplamlar',
    body: 'Ara toplam satır iskontolarından sonradır. Teklif toplamı onun altındadır. Sabit kur yanında yazar.',
  },
  {
    target: 'guide-send',
    title: 'Gönder',
    body: 'TEKLİFİ GÖNDER kaydı iletir. Düzeltmek için aynı bağlantıya tekrar girilir.',
  },
] as const;

/** Strict Mode yeniden kurulumunda turu kaybetmemek için. Sayfa yenilenince sıfırlanır. */
let tourHeldOpen = false;
const replayListeners = new Set<() => void>();

function readVideoOpen() {
  if (typeof window === 'undefined') return false;
  const pref = localStorage.getItem(VIDEO_KEY);
  if (pref === '1') return true;
  if (pref === '0') return false;
  return localStorage.getItem(SEEN_KEY) !== '1';
}

function firstStep() {
  for (let i = 0; i < STEPS.length; i++) {
    if (document.querySelector(`[data-quote-tour="${STEPS[i].target}"]`)) return i;
  }
  return null;
}

function nextStep(from: number) {
  for (let i = from + 1; i < STEPS.length; i++) {
    if (document.querySelector(`[data-quote-tour="${STEPS[i].target}"]`)) return i;
  }
  return null;
}

function isIntroVisit() {
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

export function replayQuoteGuide() {
  replayListeners.forEach((fn) => fn());
}

export function QuoteGuideVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  useLayoutEffect(() => {
    const intro = isIntroVisit();
    setAutoPlay(intro);
    setOpen(intro || readVideoOpen());
  }, []);

  useEffect(() => {
    const forceOpen = () => setOpen(true);
    window.addEventListener('up-quote-guide-open-video', forceOpen);
    return () => window.removeEventListener('up-quote-guide-open-video', forceOpen);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!open) {
      el.pause();
      return;
    }
    if (!autoPlay) return;
    let cancelled = false;
    const start = async () => {
      el.loop = true;
      try {
        el.muted = false;
        await el.play();
      } catch {
        if (cancelled) return;
        el.muted = true;
        try {
          await el.play();
        } catch {
          // tarayıcı otomatik oynatmayı engelledi
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [open, autoPlay]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VIDEO_KEY, next ? '1' : '0');
      } catch {
        // gizli mod
      }
      return next;
    });
  };

  return (
    <div className="border-b border-white/10 bg-black/40">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          data-quote-tour="guide-video"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-[#D9B625]">
              Teklif rehberi
            </span>
            <span className="mt-0.5 block text-[11px] text-white/45">
              Nasıl teklif verilir. İzlemek zorunlu değil.
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={() => replayQuoteGuide()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/55 hover:bg-white/10 hover:text-white"
        >
          <CircleHelp className="h-3.5 w-3.5" />
          Nasıl kullanılır
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4">
          <video
            ref={videoRef}
            controls
            loop
            playsInline
            autoPlay={autoPlay}
            preload={autoPlay ? 'auto' : 'metadata'}
            className="aspect-video w-full rounded-lg bg-black"
            src={VIDEO_SRC}
          />
        </div>
      )}
    </div>
  );
}

export function QuoteGuideTour({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const replay = () => {
      const first = firstStep();
      if (first == null) return;
      if (STEPS[first].target === 'guide-video') {
        window.dispatchEvent(new Event('up-quote-guide-open-video'));
      }
      setStep(first);
    };
    replayListeners.add(replay);
    return () => {
      replayListeners.delete(replay);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (tourHeldOpen) {
      const first = firstStep();
      if (first != null) setStep(first);
      return;
    }
    try {
      if (localStorage.getItem(SEEN_KEY) === '1') return;
    } catch {
      return;
    }
    const first = firstStep();
    if (first == null) return;
    tourHeldOpen = true;
    setStep(first);
  }, [enabled]);

  useEffect(() => {
    if (step == null) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        // gizli mod
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [step]);

  useLayoutEffect(() => {
    if (step == null) {
      setRect(null);
      return;
    }
    const target = STEPS[step].target;
    const el = document.querySelector(`[data-quote-tour="${target}"]`);
    if (!el) {
      const following = nextStep(step);
      setStep(following);
      return;
    }
    if (target === 'guide-video') {
      window.dispatchEvent(new Event('up-quote-guide-open-video'));
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const timer = window.setTimeout(update, 380);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  const dismiss = () => {
    tourHeldOpen = false;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // gizli mod
    }
    setStep(null);
  };

  if (step == null || rect == null || typeof document === 'undefined') return null;

  const current = STEPS[step];
  const cardWidth = Math.min(380, window.innerWidth - 24);
  const cardHeight = 248;
  const targetInLowerHalf = rect.top > window.innerHeight * 0.45;
  const top = targetInLowerHalf ? 16 : window.innerHeight - cardHeight - 16;
  const left = Math.max(12, (window.innerWidth - cardWidth) / 2);

  const pad = 6;
  const isLast = nextStep(step) == null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[69]" />
      <div
        className="pointer-events-none fixed z-[70] rounded-lg ring-2 ring-[#D9B625]"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
        }}
      />
      <div
        className="fixed z-[80] rounded-xl border border-[#D9B625]/80 bg-[#1a1a1a] p-3.5 shadow-2xl"
        style={{ top, left, width: cardWidth }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
          {step + 1} / {STEPS.length}
        </p>
        <p className="mt-1 text-sm font-bold text-[#D9B625]">{current.title}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/80">{current.body}</p>
        <p className="mt-2 text-[11px] text-white/35">Bir kez gösterilir.</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="text-[12px] text-white/50 hover:text-white"
          >
            Atla
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) dismiss();
              else setStep(nextStep(step));
            }}
            className="rounded-md bg-[#D9B625] px-3 py-1.5 text-[12px] font-bold text-[#1a1a1a] hover:brightness-110"
          >
            {isLast ? 'Tamam' : 'Sonraki'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
