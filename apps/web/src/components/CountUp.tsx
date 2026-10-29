'use client';

import { useEffect, useRef, useState } from 'react';

/** Sayı sıfırdan değerine akar (ease-out, ~0.9 sn). Değer değişince kaldığı yerden devam eder. */
export function CountUp({ value, duration = 900, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    if (reduce || from === value) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = Math.round(from + (value - from) * eased);
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = value;
    };
  }, [value, duration]);

  return <span className={className}>{shown}</span>;
}
