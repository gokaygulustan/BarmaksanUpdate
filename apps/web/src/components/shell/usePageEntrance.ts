'use client';

import { useLayoutEffect, type RefObject } from 'react';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const LATE_WINDOW_MS = 2600;

/**
 * Sayfa girişi: sayfanın üst düzey bölümleri sırayla (45 ms arayla) aşağıdan yükselir. Sayfalara
 * dokunmadan, yalnızca transform + opacity ile ve fill: backwards — bitince hiçbir stil kalmaz.
 * Yükleme bitip sonradan gelen bölümler (iskelet → içerik) de aynı girişle belirir.
 */
export function usePageEntrance(rootRef: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animateEls = (els: Element[], baseDelay = 0) => {
      els.slice(0, 10).forEach((el, i) => {
        if (!(el instanceof HTMLElement) || typeof el.animate !== 'function') return;
        el.animate(
          reduce
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'translateY(16px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
          { duration: reduce ? 200 : 620, delay: baseDelay + i * 45, easing: EASE, fill: 'backwards' },
        );
      });
    };

    const pickContainer = () => {
      let c = root.firstElementChild as HTMLElement | null;
      if (c && c.children.length === 1 && c.firstElementChild) c = c.firstElementChild as HTMLElement;
      return c;
    };

    const container = pickContainer();
    if (container && container.children.length > 1) animateEls(Array.from(container.children));
    else if (container) animateEls([container]);

    const target = container ?? root;
    const started = performance.now();
    const mo = new MutationObserver((records) => {
      if (performance.now() - started > LATE_WINDOW_MS) {
        mo.disconnect();
        return;
      }
      const added = records.flatMap((r) => Array.from(r.addedNodes)).filter((n): n is Element => n.nodeType === 1);
      if (added.length) animateEls(added);
    });
    mo.observe(target, { childList: true });
    const stop = window.setTimeout(() => mo.disconnect(), LATE_WINDOW_MS);
    return () => {
      mo.disconnect();
      window.clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
