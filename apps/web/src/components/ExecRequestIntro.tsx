'use client';

import { useEffect, useMemo, useRef } from 'react';

export type ExecIntroRequest = {
  id: string;
  title: string;
  itemCount: number;
  kind?: 'OVER_LIMIT' | 'PRODUCTION_DECISION';
  moduleId?: string | null;
  createdByName?: string | null;
  requesterUnit?: string | null;
  neededBy?: string | null;
  escalatedByName?: string | null;
};

function isProduction(item: ExecIntroRequest) {
  if (item.kind === 'PRODUCTION_DECISION') return true;
  if (item.kind === 'OVER_LIMIT') return false;
  return (item.moduleId || '') === 'URETIM_PLANLAMA' || item.moduleId === 'YEDEK_PARCA';
}

function neededLabel(raw?: string | null) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ExecRequestIntro({
  item,
  position,
  total,
  onDone,
}: {
  item: ExecIntroRequest;
  position: number;
  total: number;
  onDone: () => void;
}) {
  const production = isProduction(item);
  const need = neededLabel(item.neededBy);
  const opener = item.createdByName?.trim() || null;
  const unit = item.requesterUnit?.trim() || null;
  const escalated = item.escalatedByName?.trim() || null;
  const showEscalated = Boolean(escalated && escalated !== opener);

  const facts = useMemo(() => {
    const rows: { k: string; v: string }[] = [];
    if (opener) rows.push({ k: 'Açan', v: opener });
    if (unit) rows.push({ k: 'Birim', v: unit });
    if (showEscalated && escalated) rows.push({ k: 'Yetkili', v: escalated });
    if (item.itemCount) rows.push({ k: 'Kalem', v: String(item.itemCount) });
    if (need) rows.push({ k: 'İhtiyaç', v: need });
    return rows;
  }, [opener, unit, showEscalated, escalated, item.itemCount, need]);

  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => doneRef.current(), reduce ? 700 : 2400);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doneRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [item.id]);

  return (
    <div
      className="exec-intro-root fixed inset-0 z-[80] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exec-intro-title"
      onClick={onDone}
    >
      <div className="exec-intro-glow" aria-hidden />

      <div className="relative z-[1] flex w-full max-w-lg flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Uğur Promilling"
          className="exec-intro-logo h-16 w-auto object-contain sm:h-[4.5rem]"
        />

        <p className="exec-intro-kicker mt-8 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
          {item.moduleId === 'YEDEK_PARCA' ? 'Yedek parça' : production ? 'Üretim planlama' : 'Satın alma'}
          <span className="mx-2 text-white/20">·</span>
          <span className="tabular-nums tracking-[0.2em] text-white/55">
            {position} / {total}
          </span>
        </p>

        <h2
          id="exec-intro-title"
          className="exec-intro-title mt-3 max-w-[22rem] text-[22px] font-semibold leading-snug tracking-tight text-white sm:max-w-md sm:text-[26px]"
        >
          {item.title}
        </h2>

        {facts.length > 0 ? (
          <ul className="exec-intro-facts mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-white/80">
            {facts.map((f, i) => (
              <li key={f.k} className="flex items-baseline gap-1.5">
                {i > 0 ? <span className="mr-1 hidden text-white/20 sm:inline" aria-hidden>·</span> : null}
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  {f.k}
                </span>
                <span className="font-medium text-white/90">{f.v}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
