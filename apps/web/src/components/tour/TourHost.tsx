'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  buildTour,
  isTourCompleted,
  markTourCompleted,
  tourIdForPath,
  tourPersona,
  type TourDef,
  type TourPageId,
} from '@/lib/tour';
import { ProductTour } from '@/components/tour/ProductTour';

export function TourHost({ locked }: { locked?: boolean }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const persona = tourPersona(user);
  const [active, setActive] = useState<TourDef | null>(null);
  const activeRef = useRef<TourDef | null>(null);
  const queueRef = useRef<TourPageId | null>(null);
  activeRef.current = active;

  const launch = useCallback(
    (pageId: TourPageId, force: boolean) => {
      if (locked || !user?.id || !persona) return;
      const def = buildTour(persona, pageId);
      if (!def) {
        if (force) toast.message('Bu sayfada rolünüze ait tur yok.');
        return;
      }
      if (!force && isTourCompleted(user.id, def.id)) return;
      if (activeRef.current && activeRef.current.id !== def.id) {
        queueRef.current = pageId;
        return;
      }
      setActive(def);
    },
    [locked, persona, user?.id]
  );

  const start = useCallback(
    (force: boolean) => {
      if (typeof document !== 'undefined' && document.querySelector('[data-tour="rfq-wiz-head"]')) {
        launch('procurement-new-send', force);
        return;
      }
      const pageId = tourIdForPath(pathname);
      if (!pageId) {
        if (force) toast.message('Bu sayfada tur yok.');
        return;
      }
      launch(pageId, force);
    },
    [launch, pathname]
  );

  useEffect(() => {
    setActive(null);
    queueRef.current = null;
    const t = window.setTimeout(() => start(false), 500);
    return () => clearTimeout(t);
  }, [start]);

  useEffect(() => {
    const onReplay = () => start(true);
    const onNamed = (event: Event) => {
      const pageId = (event as CustomEvent<{ pageId?: TourPageId }>).detail?.pageId;
      if (pageId) launch(pageId, false);
    };
    window.addEventListener('up-tour:start', onReplay);
    window.addEventListener('up-tour:start-named', onNamed);
    return () => {
      window.removeEventListener('up-tour:start', onReplay);
      window.removeEventListener('up-tour:start-named', onNamed);
    };
  }, [start, launch]);

  if (!active || !user?.id) return null;

  return (
    <ProductTour
      steps={active.steps}
      onClose={() => {
        markTourCompleted(user.id, active.id);
        setActive(null);
        const next = queueRef.current;
        queueRef.current = null;
        if (next) window.setTimeout(() => launch(next, false), 80);
      }}
    />
  );
}
