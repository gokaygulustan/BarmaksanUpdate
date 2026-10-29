'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { GenieSession, attachGeniePopup, prefersReducedMotion, rectOf } from '@/lib/genie';

/**
 * Açılır panel için genie: `open` değişince panel düğmeden akarak açılır, kapanırken aynı yoldan
 * düğmeye geri döner. Dönen `present`, kapanış bitene kadar paneli DOM'da tutmak için kullanılır.
 * Panel öğesi `getTarget`, kaynak düğme `getSource` ile verilir. Yolda tersine çevrilebilir.
 */
export function useGenie({
  open,
  getTarget,
  getSource,
}: {
  open: boolean;
  getTarget: () => HTMLElement | null | undefined;
  getSource: () => Element | null | undefined;
}) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  const session = useRef<GenieSession | null>(null);

  // Kapanış ilk render'dan itibaren sürsün: panel bir kare bile DOM'dan düşmesin.
  if (open !== prevOpen) {
    setPrevOpen(open);
    setClosing(!open);
  }

  const present = open || closing;

  useLayoutEffect(
    () => () => {
      session.current?.destroy(true, true);
      session.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    if (!present) return;
    const target = getTarget();
    const source = getSource();
    if (!target || !source || prefersReducedMotion()) {
      if (!open) setClosing(false);
      return;
    }
    let s = session.current?.alive ? session.current : null;
    if (!s) s = session.current = new GenieSession(target, rectOf(source), open ? 0 : 1);
    const animation = s;
    // Hızlı kapat/açta aynı oturumu tersine çevir; eski bir bitiş geri çağrısı yeni paneli kapatmasın.
    animation.to(open ? 1 : 0, () => {
      if (session.current !== animation) return;
      animation.destroy(open);
      session.current = null;
      setClosing(false);
    });
    // getTarget/getSource kararlı değil; yalnızca açık/kapalı değişimine tepki ver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present]);

  return present;
}

/** Base UI popup'larına (Dialog.Popup) ref olarak verilir: tıklanan düğmeden genie ile açılır. */
export function useGeniePopupRef() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (el) cleanup.current = attachGeniePopup(el);
  }, []);
}
