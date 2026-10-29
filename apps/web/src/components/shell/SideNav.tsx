'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SmokeText } from '@/components/SmokeText';
import { T, useSiteTexts } from '@/components/edit/EditMode';

export type SideNavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  tour?: string;
};

export type SideNavEntry =
  | (SideNavLink & { kind: 'link' })
  | (SideNavLink & { kind: 'group'; children: SideNavLink[] });

type Flyout = {
  key: string;
  top: number;
  left: number;
  label: string;
  links?: SideNavLink[];
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Satırın listeye göre dikey konumu. offsetTop kullanılmaz: alt satırlar konumlandırılmış grup
 * kutusunun içinde, offsetTop gruba göre ölçülür ve gösterge yukarı kaçar.
 */
function rowRect(list: HTMLElement, el: HTMLElement) {
  const l = list.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  // left/width: alt menü satırları dikey çizginin sağından başlar; yüzey çizginin üstüne taşmaz.
  return { top: r.top - l.top, height: r.height, left: r.left - l.left, width: r.width };
}

type RowRect = ReturnType<typeof rowRect>;

/** Üst ve alt kapağın yüksekliği: en küçük satır 36 px, iki kapak 32 px eder (arada dolgu hep kalır). */
const CAP = 16;

/**
 * Yüzey üç parçadır: yuvarlak köşeli üst kapak, alt kapak ve aradaki düz dolgu. Yalnızca transform
 * değişir: hareket kompozitörde akar, ağır bir sayfa (Cari geçmişi gibi) render olurken bile kasmaz.
 * (Eskiden top/height canlandırılıyordu: her kare ana iş parçacığında yerleşim, sayfa render'ı
 * uzun sürünce yüzey takılıyordu.) Kapaklar ölçeklenmez, köşe yarıçapı hiç bozulmaz.
 */
function surfaceTransforms(r: RowRect, baseW: number) {
  const sx = baseW > 0 ? r.width / baseW : 1;
  const h = Math.max(r.height, CAP * 2);
  return {
    top: `translate(${r.left}px, ${r.top}px) scaleX(${sx})`,
    bottom: `translate(${r.left}px, ${r.top + h - CAP}px) scaleX(${sx})`,
    // Dolgu 1 px fazla uzar: iki kapakla üst üste biner, dikişte ince çizgi kalmaz.
    fill: `translate(${r.left}px, ${r.top + CAP - 0.5}px) scale(${sx}, ${Math.max(h - CAP * 2 + 1, 1)})`,
  };
}

/** Uzama anında yüzey incelir (eski scaleX 0.84): dar hâli kendi ortasında hesaplanır. */
function squeezed(r: RowRect, k: number): RowRect {
  return { ...r, left: r.left + (r.width * (1 - k)) / 2, width: r.width * k };
}

function applySurface(blob: HTMLElement, r: RowRect, baseW: number) {
  const [top, bottom, fill] = Array.from(blob.children) as HTMLElement[];
  if (!top || !bottom || !fill) return;
  const t = surfaceTransforms(r, baseW);
  top.style.transform = t.top;
  bottom.style.transform = t.bottom;
  fill.style.transform = t.fill;
}

const railTransform = (top: number, height: number) => `translateY(${top}px) scaleY(${height})`;

/**
 * Eriyen gösterge: etkin satırın arkasındaki yüzey yeni satıra akar. Önce gidilen yöndeki kenar
 * hedefe uzanır (yüzey incelerek uzar), sonra arkadaki kenar yetişir ve yerine yayla oturur.
 * Yalnızca dikey ölçü (top/height) okunur; yatayda satırla aynı genişlikte durur.
 */
function useMeltIndicator(
  listRef: React.RefObject<HTMLDivElement | null>,
  blobRef: React.RefObject<HTMLSpanElement | null>,
  railRef: React.RefObject<HTMLSpanElement | null>,
  activeKey: string,
  collapsed: boolean,
) {
  const prev = useRef<RowRect | null>(null);
  const running = useRef<Animation[]>([]);
  const inkLoop = useRef(0);
  const firstCollapse = useRef(true);

  const measure = useCallback(() => {
    const list = listRef.current;
    const target = list?.querySelector<HTMLElement>('[data-melt="on"]');
    if (!list || !target) return null;
    return rowRect(list, target);
  }, [listRef]);

  // Yazı rengi sayfaya değil yüzeye bağlı: satırın ortası altının içindeyse koyu, dışındaysa açık.
  // Yüzey akarken bir satırı terk ettiği an o satırın yazısı açılır, yeni satıra vardığı an koyulaşır.
  const paintInk = useCallback(() => {
    const list = listRef.current;
    const blob = blobRef.current;
    if (!list || !blob) return;
    const shown = blob.style.opacity === '1';
    // Yüzeyin o anki üst ve alt kenarı: kapakların ekrandaki yeri (transform canlıyken de doğru okunur).
    const capTop = blob.children[0] as HTMLElement | undefined;
    const capBottom = blob.children[1] as HTMLElement | undefined;
    if (!capTop || !capBottom) return;
    const bTop = capTop.getBoundingClientRect().top;
    const bBottom = capBottom.getBoundingClientRect().bottom;
    list.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      setInk(el, shown && r.height > 0 && mid >= bTop && mid <= bBottom);
    });
  }, [listRef, blobRef]);

  const place = useCallback(
    (rect: RowRect | null) => {
      const blob = blobRef.current;
      const rail = railRef.current;
      if (!blob || !rail) return;
      const visible = rect ? '1' : '0';
      blob.style.opacity = visible;
      rail.style.opacity = visible;
      if (rect) {
        applySurface(blob, rect, listRef.current?.clientWidth || rect.width);
        rail.style.transform = railTransform(rect.top + 9, Math.max(rect.height - 18, 8));
      }
      paintInk();
    },
    [listRef, blobRef, railRef, paintInk],
  );

  // Yüzey akarken her karede yazı renklerini yüzeyin o anki yerine göre boyar.
  const followInk = useCallback(() => {
    cancelAnimationFrame(inkLoop.current);
    const tick = () => {
      paintInk();
      if (running.current.some((a) => a.playState === 'running')) inkLoop.current = requestAnimationFrame(tick);
    };
    tick();
  }, [paintInk]);

  // Sayfa değişince: eriyerek akar.
  useLayoutEffect(() => {
    const rect = measure();
    const from = prev.current;
    running.current.forEach((a) => a.cancel());
    running.current = [];
    cancelAnimationFrame(inkLoop.current);
    place(rect);
    prev.current = rect;
    const blob = blobRef.current;
    const rail = railRef.current;
    if (!rect || !from || !blob || !rail || from.top === rect.top || prefersReducedMotion()) return;

    const down = rect.top > from.top;
    const spanTop = Math.min(from.top, rect.top);
    const spanH = Math.max(from.top + from.height, rect.top + rect.height) - spanTop;
    const stretchEase = 'cubic-bezier(0.55, 0, 0.25, 1)';
    const settleEase = 'cubic-bezier(0.3, 1.45, 0.55, 1)';
    const baseW = listRef.current?.clientWidth || rect.width;
    // Uzama anındaki yüzey: iki satırı kaplar, yatayda ortalama genişlikte ve %16 incelmiş.
    const span = squeezed(
      {
        top: spanTop,
        height: spanH,
        left: (from.left + rect.left) / 2,
        width: (from.width + rect.width) / 2,
      },
      0.84,
    );
    const a = surfaceTransforms(from, baseW);
    const m = surfaceTransforms(span, baseW);
    const b = surfaceTransforms(rect, baseW);
    const piece = (el: Element | undefined, key: 'top' | 'bottom' | 'fill') =>
      el?.animate(
        [
          { transform: a[key], easing: stretchEase },
          { transform: m[key], offset: 0.46, easing: settleEase },
          { transform: b[key] },
        ],
        { duration: 520 },
      );
    const [capTop, capBottom, fill] = Array.from(blob.children);

    const surfaceAnims = [piece(capTop, 'top'), piece(capBottom, 'bottom'), piece(fill, 'fill')].filter(
      (x): x is Animation => Boolean(x),
    );
    running.current.push(
      ...surfaceAnims,
      rail.animate(
        [
          { transform: railTransform(from.top + 9, from.height - 18), easing: stretchEase },
          {
            transform: railTransform(down ? from.top + 9 : rect.top + 9, spanH - 18),
            offset: 0.5,
            easing: settleEase,
          },
          { transform: railTransform(rect.top + 9, rect.height - 18) },
        ],
        { duration: 580, delay: 25 },
      ),
    );
    // Aynı karede: yüzey henüz eski satırda, yazılar ona göre (yeni satır koyu kalmaz).
    followInk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // Yazı tipi yüklenince ya da liste değişince satırlar kayar: gösterge yeniden yerleşir.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sync = () => {
      if (running.current.some((a) => a.playState === 'running')) return;
      const rect = measure();
      place(rect);
      prev.current = rect;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(list);
    return () => ro.disconnect();
  }, [listRef, measure, place]);

  // Daralma/genişleme: yüzey sönmez (koyu yazı zeminsiz kalırdı); geçiş boyunca her karede etkin
  // satırı ölçüp ona yapışık durur.
  useEffect(() => {
    if (firstCollapse.current) {
      firstCollapse.current = false;
      return;
    }
    running.current.forEach((a) => a.cancel());
    running.current = [];
    cancelAnimationFrame(inkLoop.current);
    const start = performance.now();
    let raf = 0;
    let first = true;
    const follow = () => {
      const rect = measure();
      const last = prev.current;
      // Satır yerinden oynamadıkça yazmaz, satır renklerini de yeniden ölçmez (her karede bütün
      // satırların ölçülmesi daralma sırasında boşuna iş demekti).
      if (
        first ||
        !rect ||
        !last ||
        rect.top !== last.top ||
        rect.height !== last.height ||
        rect.left !== last.left ||
        rect.width !== last.width
      ) {
        place(rect);
        prev.current = rect;
      }
      first = false;
      if (performance.now() - start < 600) raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [collapsed, measure, place]);
}

/** Menünün açılıp kapanma süresi ve eğrisi; içerik sütunu da (dashboard layout) aynısıyla kayar. */
export const SIDE_MOTION = { duration: 480, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' } as const;

/**
 * Menü genişliği: CSS geçişi yerine Web Animations. CSS geçişinin saati stil değiştiği an başlar;
 * ağır bir sayfada ilk kare gecikince geçişin başı atlanıyor, menü "şırak" diye açılıyordu.
 * Animasyon ise ilk çizilen karede başlar ve içerikle birlikte yürür. Yarıda tersine basılırsa
 * bulunduğu genişlikten döner. Sayfa ilk açılırken (kayıtlı tercih) animasyon yok; hareket azaltma
 * ayarında da menü eskisi gibi kayar.
 */
function useSideWidth(asideRef: React.RefObject<HTMLElement | null>, collapsed: boolean) {
  const ready = useRef(false);
  const last = useRef(collapsed);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ready.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  useLayoutEffect(() => {
    const el = asideRef.current;
    const changed = last.current !== collapsed;
    last.current = collapsed;
    if (!el || !changed || !ready.current) return;
    const rail = window.matchMedia('(max-width: 767px)').matches ? 64 : 72;
    const running = el.getAnimations();
    const from = running.length ? el.getBoundingClientRect().width : collapsed ? 264 : rail;
    running.forEach((a) => a.cancel());
    el.animate([{ width: `${from}px` }, { width: `${collapsed ? rail : 264}px` }], SIDE_MOTION);
  }, [asideRef, collapsed]);
}

/** Satırın "altın üstünde" hâli. Renk anında döner: satırın renk geçişi burada gecikme olurdu. */
function setInk(el: HTMLElement, on: boolean) {
  if ((el.dataset.ink === 'on') === on) return;
  el.style.transition = 'none';
  if (on) el.dataset.ink = 'on';
  else delete el.dataset.ink;
  void getComputedStyle(el).color;
  requestAnimationFrame(() => {
    el.style.transition = '';
  });
}

export function SideNav({
  entries,
  activeKey,
  collapsed,
  mobileOpen,
  onRequestClose,
  logo,
  mark,
  footer,
}: {
  entries: SideNavEntry[];
  activeKey: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onRequestClose: () => void;
  logo: ReactNode;
  mark: ReactNode;
  footer: (state: { collapsed: boolean; showTip: (el: HTMLElement, key: string, label: string) => void; hideTip: () => void }) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLSpanElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const [flyoutPinned, setFlyoutPinned] = useState(false);
  const texts = useSiteTexts();
  /** Panel kapanırken bir an daha yerinde kalır: rail'e doğru büzülüp bulanıklaşarak söner (şak diye kaybolmaz). */
  const [flyoutLeaving, setFlyoutLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const closeFlyout = useCallback(() => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    setFlyoutLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      setFlyout(null);
      setFlyoutPinned(false);
      setFlyoutLeaving(false);
    }, 150);
  }, []);
  useEffect(() => () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  }, []);

  useMeltIndicator(listRef, blobRef, railRef, activeKey, collapsed);
  useSideWidth(asideRef, collapsed);

  // Hover gölgesi: imlecin üzerindeki satıra kayar, menüden çıkınca söner. Etkin satırda çıkmaz:
  // altın yüzeyin üstüne ikinci bir kutu binmesin.
  const moveHover = (el: HTMLElement | null) => {
    const ghost = hoverRef.current;
    const list = listRef.current;
    if (!ghost || !list) return;
    if (!el || el.dataset.melt === 'on') {
      ghost.style.opacity = '0';
      return;
    }
    const wasHidden = ghost.style.opacity !== '1';
    if (wasHidden) ghost.style.transition = 'opacity 120ms ease';
    const { top, height, left, width } = rowRect(list, el);
    ghost.style.transform = `translateY(${top}px)`;
    ghost.style.height = `${height}px`;
    ghost.style.left = `${left}px`;
    ghost.style.width = `${width}px`;
    ghost.style.opacity = '1';
    if (wasHidden) {
      requestAnimationFrame(() => {
        if (hoverRef.current) hoverRef.current.style.transition = '';
      });
    }
  };

  // Basıldığı an gölge geçişsiz kaybolur; altın yüzey yukarıdan uzayıp gelirken önünde durmasın.
  // İmleç başka satıra geçince moveHover onu yeniden (yalnızca solarak) getirir.
  const dropHover = () => {
    const ghost = hoverRef.current;
    if (!ghost) return;
    ghost.style.transition = 'none';
    ghost.style.opacity = '0';
  };

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(closeFlyout, 140);
  };

  const showTip = (el: HTMLElement, key: string, label: string, links?: SideNavLink[]) => {
    if (!collapsed && !links) return;
    cancelClose();
    // Kapanırken yeniden üzerine gelinirse kapanış iptal: panel olduğu yerden geri döner.
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setFlyoutLeaving(false);
    const r = el.getBoundingClientRect();
    // Rail genişliği sabit: daralma geçişi sürerken ölçülen anlık genişliğe göre konumlanmasın.
    const railW = window.matchMedia('(max-width: 767px)').matches ? 64 : 72;
    const asideLeft = asideRef.current?.getBoundingClientRect().left ?? 0;
    const top = links ? Math.min(r.top - 6, window.innerHeight - 56 - links.length * 36) : r.top + r.height / 2;
    setFlyout({ key, label, links, left: asideLeft + railW + 10, top: Math.max(8, top) });
  };

  useEffect(() => {
    if (!collapsed) {
      setFlyout(null);
      setFlyoutPinned(false);
    }
  }, [collapsed]);

  useEffect(() => {
    setFlyout(null);
    setFlyoutPinned(false);
  }, [activeKey]);

  useEffect(() => {
    if (!flyout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFlyout();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-side-flyout]') || t?.closest('[data-side-nav]')) return;
      closeFlyout();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [flyout, closeFlyout]);

  // data-ink: satır o an altın yüzeyin üstünde (useMeltIndicator boyar); renk sayfaya değil yüzeye bağlı.
  const rowBase =
    'group/row relative z-[1] flex h-10 w-full items-center gap-3 rounded-[11px] pl-3 pr-2 text-[13.5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/30 data-[ink=on]:text-primary-foreground!';

  return (
    <>
      {/* Mobilde açık menü içeriğin üstüne biner: arkası kararır. Bulanıklık ve büyük gölge yok:
       * Safari'de ağır sayfanın üstünde her karede yeniden işleniyor, açılış takılarak başlıyordu. */}
      <div
        aria-hidden
        onClick={onRequestClose}
        className={cn(
          'fixed inset-0 z-30 bg-black/60 transition-opacity duration-300 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        ref={asideRef}
        data-side-nav
        data-collapsed={collapsed || undefined}
        className={cn(
          // Genişlik geçişi CSS ile değil useSideWidth ile (içerikle aynı anda ve aynı eğriyle başlar).
          'side-nav absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-chrome',
          collapsed ? 'w-[72px] max-md:w-[64px]' : 'w-[264px]',
          mobileOpen && 'max-md:border-r max-md:border-white/[0.07]',
        )}
      >
        {/* Doku: gizlilik şeridindeki altın değirmen ikonları, üstte ve altta soluk, yavaşça kayar. */}
        <span aria-hidden className="side-texture" />
        <span aria-hidden className="side-texture side-texture-bottom" />

        {/* Marka: açıkken tam logo, rail'de yalnızca değirmen işareti. */}
        <div className="relative flex h-[76px] shrink-0 items-center px-[22px] max-md:px-[17px]">
          <div
            className={cn(
              'absolute left-[22px] top-1/2 -translate-y-1/2 transition-[opacity,transform] duration-300 ease-out max-md:left-[17px]',
              collapsed ? 'scale-100 opacity-100 delay-100' : 'pointer-events-none scale-75 opacity-0',
            )}
          >
            {mark}
          </div>
          <div
            className={cn(
              // -11px: logo, eskiden altındaki ürün adıyla birlikte ortalandığı yerde kalır.
              'flex min-w-0 -translate-y-[11px] flex-col items-start gap-1.5 transition-[opacity,transform] duration-300 ease-out',
              collapsed ? 'pointer-events-none -translate-x-2 opacity-0' : 'translate-x-0 opacity-100 delay-75',
            )}
          >
            {logo}
          </div>
          {/* Mobilde açık menünün kendi kapatma düğmesi (üst çubuktaki düğme menünün altında kalıyor). */}
          {mobileOpen ? (
            <button
              type="button"
              onClick={onRequestClose}
              aria-label="Menüyü kapat"
              title="Menüyü kapat"
              className="absolute right-3 top-1/2 -mt-[11px] flex size-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-white/60 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white active:scale-95 md:hidden"
            >
              <X className="size-[18px]" strokeWidth={1.8} />
            </button>
          ) : null}
        </div>

        <nav
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 pb-4 pt-2 max-md:px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerLeave={() => {
            moveHover(null);
            if (!flyoutPinned) scheduleClose();
          }}
        >
          <div ref={listRef} className="relative flex flex-col gap-0.5">
            {/* Eriyen yüzey + kenardaki altın çizgi + hover gölgesi */}
            <span
              ref={hoverRef}
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 h-10 w-full rounded-[11px] bg-white/[0.05] opacity-0 transition-[transform,height,left,width,opacity] duration-[150ms] ease-[cubic-bezier(0.2,0.9,0.3,1)]"
            />
            {/* Yüzey: üst kapak + alt kapak + dolgu (hepsi transform ile akar, bkz. surfaceTransforms). */}
            <span
              ref={blobRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200"
            >
              <span className="absolute left-0 top-0 h-4 w-full origin-top-left rounded-t-[11px] bg-brand will-change-transform" />
              <span className="absolute left-0 top-0 h-4 w-full origin-top-left rounded-b-[11px] bg-brand will-change-transform" />
              <span className="absolute left-0 top-0 h-px w-full origin-top-left bg-brand will-change-transform" />
            </span>
            <span
              ref={railRef}
              aria-hidden
              className="pointer-events-none absolute -left-3.5 top-0 h-px w-[3px] origin-top rounded-r-full bg-brand opacity-0 transition-opacity duration-200 will-change-transform max-md:-left-2.5"
            />

            {entries.map((entry) => {
              const Icon = entry.icon;
              if (entry.kind === 'link') {
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    data-tour={entry.tour}
                    data-melt={entry.active ? 'on' : undefined}
                    aria-current={entry.active ? 'page' : undefined}
                    aria-label={collapsed ? entry.label : undefined}
                    onPointerEnter={(e) => {
                      moveHover(e.currentTarget);
                      showTip(e.currentTarget, entry.href, entry.label);
                    }}
                    onFocus={(e) => showTip(e.currentTarget, entry.href, entry.label)}
                    onBlur={scheduleClose}
                    onPointerDown={dropHover}
                    onClick={onRequestClose}
                    data-row
                    className={cn(rowBase, 'text-white/60 hover:text-white')}
                  >
                    <Icon
                      className="size-[19px] shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/row:scale-110 group-active/row:scale-95"
                      strokeWidth={1.7}
                    />
                    <span
                      className={cn(
                        'min-w-0 truncate transition-opacity duration-200 group-data-[ink=on]/row:font-medium',
                        collapsed ? 'opacity-0' : 'opacity-100',
                      )}
                    >
                      <T>{entry.label}</T>
                    </span>
                  </Link>
                );
              }

              const open = flyout?.key === entry.href && Boolean(flyout.links);
              return (
                <div key={entry.href} className="relative mt-3 flex flex-col first:mt-0">
                  {/* Rail'de grup bir düğme (alt sayfalar yan panelde); açıkken sade bir başlık. */}
                  <button
                    type="button"
                    data-tour={entry.tour}
                    data-melt={collapsed && entry.active ? 'on' : undefined}
                    tabIndex={collapsed ? 0 : -1}
                    aria-haspopup={collapsed ? 'menu' : undefined}
                    aria-expanded={collapsed ? open : undefined}
                    aria-label={collapsed ? entry.label : undefined}
                    onPointerEnter={(e) => {
                      if (!collapsed) return;
                      moveHover(e.currentTarget);
                      showTip(e.currentTarget, entry.href, entry.label, entry.children);
                    }}
                    onClick={(e) => {
                      if (!collapsed) return;
                      if (open && flyoutPinned) {
                        setFlyout(null);
                        setFlyoutPinned(false);
                        return;
                      }
                      showTip(e.currentTarget, entry.href, entry.label, entry.children);
                      setFlyoutPinned(true);
                    }}
                    data-row
                    className={cn(
                      rowBase,
                      collapsed
                        ? 'text-white/60 hover:text-white'
                        : 'pointer-events-none h-8 text-[11.5px] font-medium tracking-[0.02em] text-white/38',
                    )}
                  >
                    <Icon
                      className={cn(
                        'shrink-0 transition-[transform,width,height] duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/row:scale-110',
                        collapsed ? 'size-[19px]' : 'size-[15px]',
                      )}
                      strokeWidth={1.7}
                    />
                    <span className={cn('min-w-0 truncate transition-opacity duration-200', collapsed ? 'opacity-0' : 'opacity-100')}>
                      <T>{entry.label}</T>
                    </span>
                    {collapsed && (
                      <span
                        aria-hidden
                        className="absolute bottom-[7px] right-[7px] size-[5px] rounded-[1.5px] border-b border-r border-current opacity-40"
                      />
                    )}
                  </button>
                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                      collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
                    )}
                  >
                    <div
                      className={cn(
                        'ml-[21px] flex min-h-0 flex-col gap-0.5 overflow-hidden border-l-2 border-primary pl-2.5',
                        collapsed && 'invisible',
                      )}
                    >
                      {entry.children.map((child) => {
                        const ChildIcon = child.icon;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            data-tour={child.tour}
                            data-melt={!collapsed && child.active ? 'on' : undefined}
                            aria-current={child.active ? 'page' : undefined}
                            tabIndex={collapsed ? -1 : 0}
                            onPointerEnter={(e) => moveHover(e.currentTarget)}
                            onPointerDown={dropHover}
                            onClick={onRequestClose}
                            data-row
                            className={cn(rowBase, 'h-9 text-[13.5px] text-white data-[ink=on]:font-medium')}
                          >
                            <ChildIcon
                              className="size-4 shrink-0 text-primary group-data-[ink=on]/row:text-primary-foreground!"
                              strokeWidth={1.8}
                            />
                            <span className="min-w-0 truncate"><T>{child.label}</T></span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="relative shrink-0 border-t border-hairline px-3.5 py-3 max-md:px-2.5">
          {footer({
            collapsed,
            showTip: (el, key, label) => showTip(el, key, label),
            hideTip: scheduleClose,
          })}
        </div>
      </aside>

      {/* Rail ipucu / grup paneli: tetikleyicinin hizasında, ondan doğar; satırlar arasında kayar. */}
      {flyout && (
        <div
          data-side-flyout
          role={flyout.links ? 'menu' : 'tooltip'}
          onPointerEnter={cancelClose}
          onPointerLeave={() => {
            if (!flyoutPinned) scheduleClose();
          }}
          className={cn(
            'side-flyout fixed z-[60] origin-left',
            flyout.links ? 'w-[248px]' : '-translate-y-1/2',
            flyoutLeaving && 'side-flyout-out',
          )}
          style={{ top: flyout.top, left: flyout.left }}
        >
          {flyout.links ? (
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-popover p-1.5 shadow-[var(--shadow-float)]">
              {/* Başlık ve satırlar ekran başlıklarıyla aynı yazı efektiyle gelir; grup değişince eski yazı dağılır. */}
              <p className="px-3 pb-1.5 pt-2 text-[11.5px] font-medium tracking-[0.02em] text-white/40">
                <SmokeText quick text={texts[flyout.label] ?? flyout.label} />
              </p>
              {flyout.links.map((link, i) => {
                const LinkIcon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    role="menuitem"
                    onClick={() => {
                      setFlyout(null);
                      setFlyoutPinned(false);
                      onRequestClose();
                    }}
                    style={{ animationDelay: `${i * 14}ms` }}
                    className={cn(
                      'side-flyout-item group/fl flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] transition-colors duration-150',
                      link.active ? 'bg-brand/[0.1] font-medium text-brand-ink' : 'text-white/65 hover:bg-white/[0.05] hover:text-white',
                    )}
                  >
                    <LinkIcon className="size-4 shrink-0 opacity-70 transition-transform duration-300 group-hover/fl:translate-x-0.5" strokeWidth={1.7} />
                    <span className="min-w-0 flex-1 whitespace-nowrap">
                      <SmokeText quick text={texts[link.label] ?? link.label} />
                    </span>
                    {link.active && <span aria-hidden className="h-3.5 w-[2px] rounded-full bg-brand" />}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="whitespace-nowrap rounded-[9px] border border-white/[0.08] bg-popover px-2.5 py-1.5 text-[12.5px] font-medium text-white shadow-[var(--shadow-float)]">
              <SmokeText quick text={texts[flyout.label] ?? flyout.label} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
