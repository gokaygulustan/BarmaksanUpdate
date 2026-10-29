'use client';

import { Fragment, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Metni kelimelere, kelimeleri harflere böler; her harf sırasına göre biraz gecikir. */
function Letters({ text, mode, step }: { text: string; mode: 'in' | 'out'; step: number }) {
  let index = 0;
  return (
    <>
      {text.split(' ').map((word, wordIndex) => (
        <Fragment key={wordIndex}>
          {wordIndex > 0 && ' '}
          {/* Kelime bölünmez: satır sonu yalnızca kelime aralarında olur. */}
          <span className="fx-word">
            {[...word].map((character) => {
              const current = index++;
              return (
                <span
                  key={current}
                  className={`fx-letter ${mode}`}
                  style={{ '--index': current, '--step': `${step}ms` } as CSSProperties}
                >
                  {character}
                </span>
              );
            })}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/** Kısa metinde harf başına 28 ms, uzunda en az 8 ms: her metin yaklaşık aynı sürede tamamlanır. */
const stepFor = (value: string) => Math.max(8, Math.min(28, 420 / Math.max(1, [...value].length)));
/** Hızlı mod (hover panelleri): bütün metin ~240 ms'de dalgalanır, beklemez. */
const quickStepFor = (value: string) => Math.max(5, Math.min(20, 240 / Math.max(1, [...value].length)));

/**
 * Duman yazı: yeni metin harf harf aşağıdan, bulanıklıktan netleşerek gelir; metin değişince eskisi aynı
 * yerde yukarı doğru dağılarak söner. Kütüphane yok: harfler ayrı span, hareket CSS'te (globals.css .fx-*).
 * Ekran okuyucu gerçek metni gizli bir span'den okur; hareket azaltılmışsa harfler hiç oynamaz.
 */
export function SmokeText({
  text,
  center = false,
  quick = false,
  className,
}: {
  text: string;
  center?: boolean;
  /** Hover ile açılan küçük paneller için: kısa, bulanıklıksız; panelin kendi girişiyle çakışıp titremesin. */
  quick?: boolean;
  className?: string;
}) {
  const [state, setState] = useState({ current: text, previous: null as string | null, version: 0 });
  const step = quick ? quickStepFor : stepFor;

  // Metin değişince eskisi saklanır, yenisi geçerli olur (render sırasında türetilen durum).
  if (text !== state.current) {
    setState({ current: text, previous: state.current, version: state.version + 1 });
  }

  return (
    <span className={cn('fx-text', center && 'center', quick && 'quick', className)}>
      <span className="fx-screen-reader">{text}</span>
      <span className="fx-visual" aria-hidden="true">
        {state.previous !== null ? (
          // key her değişimde yenilenir; aynı DOM yeniden kullanılırsa animasyon ikinci kez başlamaz.
          <span key={`old-${state.version}`} className="fx-old">
            <Letters text={state.previous} mode="out" step={step(state.previous)} />
          </span>
        ) : null}
        <span key={`new-${state.version}`}>
          <Letters text={state.current} mode="in" step={step(state.current)} />
        </span>
      </span>
    </span>
  );
}
