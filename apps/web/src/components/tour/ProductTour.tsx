'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { prepareTourChrome, type TourStep } from '@/lib/tour';
import { SmokeText } from '@/components/SmokeText';

/** Vurgulanan alan: kenar boşluğuyla birlikte ekran koordinatları ve köşe yuvarlaklığı. */
type Hole = { t: number; l: number; w: number; h: number; r: number };

const PAD = 8;
const CARD_W = 340;
const GAP = 14;

function queryTourEl(selector: string) {
  // Aynı adım ekran genişliğine göre farklı yerde olabilir (ör. eylemler: geniş ekranda yan
  // kartta, dar ekranda altta): görünen öğe seçilir.
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`));
  return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
}

function readHole(el: HTMLElement): Hole {
  const rect = el.getBoundingClientRect();
  const t = Math.max(8, rect.top - PAD);
  const l = Math.max(8, rect.left - PAD);
  const r = Math.min(window.innerWidth - 8, rect.right + PAD);
  const b = Math.min(window.innerHeight - 8, rect.bottom + PAD);
  // Çerçeve öğenin kendi köşesini izler: düğmede kapsül, kartta yumuşak köşe. Adımlar arasında bu da akar.
  const own = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
  return { t, l, w: r - l, h: b - t, r: Math.min(own + PAD, 30) };
}

/** Kartı alanın altına, sığmazsa üstüne koyar; alan yoksa ekranın ortasına. */
function placeCard(hole: Hole | null, cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - 24);
  if (!hole) return { top: Math.max(16, (vh - cardH) / 2), left: Math.max(12, (vw - width) / 2), width };
  const below = hole.t + hole.h + GAP;
  const above = hole.t - GAP - cardH;
  let top: number;
  if (below + cardH <= vh - 12) top = below;
  else if (above >= 12) top = above;
  else top = Math.max(12, Math.min(hole.t, vh - cardH - 12));
  const left = Math.min(Math.max(12, hole.l), vw - width - 12);
  return { top, left, width };
}

/**
 * Ürün turu. Tek bir vurgu çerçevesi adımdan adıma şekil değiştirerek akar (konum, boyut, köşe); ekranın geri
 * kalanı onunla birlikte kararır. Kart da yeni yerine süzülür; yüksekliği içeriğe göre yumuşakça değişir, metin
 * ilerlerken sağdan, geri giderken soldan netleşerek gelir. Hiçbir şey zıplamaz: her şey bir öncekinden doğar.
 */
export function ProductTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [liveSteps, setLiveSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [hole, setHole] = useState<Hole | null>(null);
  const [cardH, setCardH] = useState(200);
  const [content, setContent] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const needsNav = steps.some((s) => s.selector?.startsWith('nav-'));
    prepareTourChrome(needsNav);
    const t = window.setTimeout(() => {
      const visible = steps.filter((s) => !s.selector || s.reveal || queryTourEl(s.selector));
      setLiveSteps(visible.length ? visible : steps.filter((s) => !s.selector).slice(0, 1));
      setIndex(0);
    }, 500);
    return () => clearTimeout(t);
  }, [steps]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Kartın yüksekliği içerikten ölçülür; kart bu yüksekliğe akar ve yerleşimi buna göre hesaplanır.
  useEffect(() => {
    if (!content) return;
    const ro = new ResizeObserver(() => setCardH(content.offsetHeight));
    ro.observe(content);
    return () => ro.disconnect();
  }, [content]);

  const measure = useCallback((step: TourStep) => {
    if (!step.selector) {
      setHole(null);
      return;
    }
    const el = queryTourEl(step.selector);
    if (!el) {
      setHole(null);
      return;
    }
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    window.setTimeout(() => {
      const live = queryTourEl(step.selector!);
      setHole(live ? readHole(live) : null);
    }, 280);
  }, []);

  useEffect(() => {
    const step = liveSteps?.[index];
    if (!step) return;
    prepareTourChrome(Boolean(step.selector?.startsWith('nav-')));
    if (step.reveal) {
      window.dispatchEvent(new CustomEvent('up-tour:reveal', { detail: { reveal: step.reveal } }));
    }
    const delay = step.reveal ? 480 : step.selector?.startsWith('nav-') ? 420 : 80;
    const t = window.setTimeout(() => {
      if (step.selector && !queryTourEl(step.selector)) {
        if (index < (liveSteps?.length ?? 0) - 1) setIndex((i) => i + 1);
        else setHole(null);
        return;
      }
      measure(step);
    }, delay);
    return () => clearTimeout(t);
  }, [index, liveSteps, measure]);

  useEffect(() => {
    const step = liveSteps?.[index];
    if (!step) return;
    const onWin = () => {
      if (!step.selector) {
        setHole(null);
        return;
      }
      const el = queryTourEl(step.selector);
      setHole(el ? readHole(el) : null);
    };
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [index, liveSteps]);

  const total = liveSteps?.length ?? 0;
  const go = (next: number) => {
    if (next < 0) return;
    if (next >= total) {
      onClose();
      return;
    }
    setDir(next > index ? 'next' : 'prev');
    setIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        go(index + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const step = liveSteps?.[index];
  if (!liveSteps || !step) return null;

  const pos = placeCard(hole, cardH);
  const last = index === total - 1;
  // Alan yokken çerçeve ekranın ortasında bir noktaya büzülür; karartma tam ekran kalır.
  const spot = hole ?? {
    t: window.innerHeight / 2,
    l: window.innerWidth / 2,
    w: 0,
    h: 0,
    r: 999,
  };

  return (
    <div className="tour-fade fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="up-tour-title">
      {/* Sayfayla etkileşimi keser; tıklamak turu kapatmaz (yanlışlıkla kaybolmasın). */}
      <div className="absolute inset-0" />

      <div
        aria-hidden
        className="tour-morph pointer-events-none fixed"
        style={{
          top: spot.t,
          left: spot.l,
          width: spot.w,
          height: spot.h,
          borderRadius: spot.r,
          boxShadow:
            '0 0 0 200vmax rgba(8, 8, 10, 0.68), 0 0 0 1.5px rgba(217, 182, 37, 0.9), 0 0 40px 6px rgba(217, 182, 37, 0.16)',
        }}
      />

      <div
        className="tour-morph fixed overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#19191c]/95 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        style={{ top: pos.top, left: pos.left, width: pos.width, height: cardH }}
      >
        <div ref={setContent} className="p-5">
          <div className="flex items-center justify-between gap-3">
            {/* İlerleme: geçerli adımın noktası kapsüle uzar, öncekiler altın kalır. */}
            <div className="flex items-center gap-1.5" aria-label={`${index + 1}. adım, toplam ${total}`}>
              {liveSteps.map((s, i) => (
                <span
                  key={`${s.title}-${i}`}
                  className={cn(
                    'h-1.5 rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    i === index ? 'w-5 bg-brand' : i < index ? 'w-1.5 bg-brand/45' : 'w-1.5 bg-white/15'
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Turu kapat"
              className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-white/45 outline-none transition-colors duration-150 hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Başlık harf harf değişir (eski yukarı dağılır, yeni aşağıdan netleşir); açıklama yönüne göre kayar. */}
          <h2 id="up-tour-title" className="mt-4 text-[17px] font-medium leading-snug tracking-[-0.012em] text-white">
            <SmokeText text={step.title} />
          </h2>
          <p key={index} className={cn('mt-1.5 text-[14px] leading-relaxed text-white/55', dir === 'next' ? 'tour-step-next' : 'tour-step-prev')}>
            {step.body}
          </p>

          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="-ml-2.5 h-8 rounded-full px-2.5 text-[13px] text-white/40 outline-none transition-colors duration-150 hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Atla
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => go(index - 1)}
                aria-label="Önceki adım"
                className="flex size-10 items-center justify-center rounded-full border border-white/[0.08] text-white/70 outline-none transition-[background-color,border-color,color,opacity] duration-150 hover:border-brand hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-0"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                className="group/next flex h-10 items-center gap-1.5 rounded-full bg-brand pl-4 pr-3.5 text-[14px] font-medium text-primary-foreground outline-none transition-colors duration-150 hover:bg-[#e6c53b] focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98]"
              >
                {last ? 'Bitir' : 'İleri'}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/next:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
