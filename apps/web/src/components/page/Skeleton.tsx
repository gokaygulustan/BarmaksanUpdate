'use client';

// Yükleme iskeletleri. Her ekranda veri gelene kadar o ekranın düzenine benzeyen sönük bloklar durur
// (parlama yok: yalnızca yavaş bir ışık süpürmesi), veri gelince iskelet silinirken içerik belirir.
// Hareket transform/opacity ile; "hareketi azalt" ayarında süpürme durur, geçiş kısa solmaya düşer.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const wave = (i: number) => ({ '--i': i }) as CSSProperties;

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn('skel block', className)} style={style} />;
}

/** Çizgi/yazı bloğu: satır sayısı kadar, son satır kısa. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3 rounded-full"
          style={{ ...wave(i), width: i === lines - 1 && lines > 1 ? '58%' : '100%' }}
        />
      ))}
    </div>
  );
}

/** Ekran başlığı: büyük başlık + açıklama satırı. */
export function SkeletonHeader({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-3.5 pb-2', className)}>
      <Skeleton className="h-9 w-[min(360px,70%)] rounded-[12px]" />
      <Skeleton className="h-3.5 w-[min(520px,90%)] rounded-full" style={wave(1)} />
    </div>
  );
}

/** Liste satırları (kutunun içinde): solda iki satır yazı, sağda bir hap. */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('divide-y divide-white/[0.05]', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 px-6 py-4">
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-3.5 rounded-full" style={{ ...wave(i), width: `${48 - (i % 3) * 9}%` }} />
            <Skeleton className="h-3 w-1/4 rounded-full opacity-70" style={wave(i + 1)} />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" style={wave(i + 2)} />
        </div>
      ))}
    </div>
  );
}

/** Kart ızgarası: simge dairesi, iki satır yazı ve alt satır. */
export function SkeletonCards({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[22px] border border-white/[0.07] bg-card p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" style={wave(i)} />
            <Skeleton className="h-3 w-24 rounded-full" style={wave(i + 1)} />
          </div>
          <Skeleton className="mt-5 h-4 w-3/5 rounded-full" style={wave(i + 1)} />
          <Skeleton className="mt-3 h-3 w-2/5 rounded-full opacity-70" style={wave(i + 2)} />
          <div className="mt-6 flex items-center justify-between">
            <div className="flex -space-x-1.5">
              <Skeleton className="size-7 rounded-full" style={wave(i + 2)} />
              <Skeleton className="size-7 rounded-full" style={wave(i + 3)} />
            </div>
            <Skeleton className="h-3 w-20 rounded-full" style={wave(i + 3)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Form / ayar alanları: etiket + giriş kutusu. */
export function SkeletonForm({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-5', className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="h-3 w-28 rounded-full" style={wave(i)} />
          <Skeleton className="h-11 w-full rounded-[12px]" style={wave(i + 1)} />
        </div>
      ))}
    </div>
  );
}

/** Kutu (22 px köşeli kart) içinde iskelet: ayar sayfalarında tek parça. */
export function SkeletonPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn('rounded-[22px] border border-white/[0.07] bg-card p-6', className)}>
      {children}
    </div>
  );
}

/** Detay ekranı: geri bağlantısı, başlık + durum, solda geniş içerik kutusu, sağda dar özet kutusu. */
export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="Yükleniyor" className={cn('mx-auto w-full max-w-[1400px] space-y-6', className)}>
      <div aria-hidden className="space-y-4">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-9 w-[min(480px,75%)] rounded-[12px]" style={wave(1)} />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-28 rounded-full" style={wave(2)} />
          <Skeleton className="h-7 w-24 rounded-full" style={wave(3)} />
          <Skeleton className="h-7 w-32 rounded-full" style={wave(4)} />
        </div>
      </div>
      <div aria-hidden className="grid items-start gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-[22px] border border-white/[0.07] bg-card p-6">
            <SkeletonText lines={3} />
          </div>
          <div className="rounded-[22px] border border-white/[0.07] bg-card">
            <SkeletonRows rows={5} />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-[22px] border border-white/[0.07] bg-card p-6">
            <SkeletonForm fields={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bütün sayfa: başlık, araç çubuğu ve liste kutusu. Rota geçişinde ve sayfa kodu gelirken görünür. */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" aria-label="Yükleniyor" role="status" className={cn('space-y-6', className)}>
      <SkeletonHeader />
      <div aria-hidden className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-11 w-56 rounded-[14px]" style={wave(1)} />
        <Skeleton className="h-11 min-w-[200px] flex-1 rounded-[14px]" style={wave(2)} />
        <Skeleton className="h-11 w-36 rounded-[14px]" style={wave(3)} />
      </div>
      <div className="rounded-[22px] border border-white/[0.07] bg-card">
        <SkeletonRows rows={7} />
      </div>
    </div>
  );
}

/**
 * İskeletten veriye geçiş: yükleme sürerken iskelet; veri gelince içerik solarak belirir, iskelet de
 * üstte kısa süre kalıp solar (ikisi aynı anda çapraz geçer). Önceden yüklenmiş (önbellekteki) veride
 * hiç iskelet yok ve içerik animasyonsuz açılır. İçerikte yalnızca opacity: transform, içindeki
 * sabit konumlu öğeleri (position: fixed) kaydırırdı.
 */
export function Swap({
  loading,
  skeleton,
  children,
  className,
  innerClassName,
  hold = 280,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
  /** İçeriği saran katmanın sınıfı (örn. çocuklar arası boşluk için space-y-6). */
  innerClassName?: string;
  /** İskeletin solarak kalma süresi (ms). */
  hold?: number;
}) {
  const sawLoading = useRef(loading);
  const [leaving, setLeaving] = useState(false);
  const prev = useRef(loading);

  if (loading) sawLoading.current = true;

  useEffect(() => {
    if (prev.current && !loading) {
      setLeaving(true);
      const t = window.setTimeout(() => setLeaving(false), hold);
      prev.current = loading;
      return () => window.clearTimeout(t);
    }
    prev.current = loading;
  }, [loading, hold]);

  if (loading) {
    return (
      <div aria-busy="true" className={className}>
        {skeleton}
      </div>
    );
  }
  return (
    <div className={cn('relative', className)}>
      <div className={cn(sawLoading.current && 'skel-in', innerClassName)}>{children}</div>
      {leaving ? (
        <div aria-hidden className="skel-out pointer-events-none absolute inset-x-0 top-0 z-[1]">
          {skeleton}
        </div>
      ) : null}
    </div>
  );
}
