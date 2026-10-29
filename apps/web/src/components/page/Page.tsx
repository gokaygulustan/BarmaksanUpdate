'use client';

// Liste ekranlarının ortak parçaları (Tedarikçi talepleri, Tedarikçi listesi, Cari geçmiş, Analiz
// raporları, Mail günlüğü, Kullanıcılar). Dil, Tedarik Paneli (dashboard) ile aynı: 22 px köşeli
// kutular, satırda altın dolgu + soldan altın çizgi + kayan ok, durumlarda hareketli StatusGlyph.
// Düğmeler üzerine gelince altın dolar. Büyük harf ve geniş harf aralığı yok.

import Link from 'next/link';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronDown, Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { CountUp } from '@/components/CountUp';
import { SmokeT, T } from '@/components/edit/EditMode';
import { StatusGlyph, statusTone } from '@/components/StatusGlyph';
import { cn } from '@/lib/utils';
import { SkeletonCards, SkeletonForm, SkeletonRows } from './Skeleton';

/** Arama, seçim ve metin alanlarının ortak kutusu. */
export const fieldClass =
  'h-11 rounded-[12px] border border-white/[0.08] bg-white/[0.03] text-[14px] text-white outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-brand/50 focus:border-brand/70 focus:bg-white/[0.05] focus:ring-4 focus:ring-brand/15';

/** SearchableCombobox'ı (controlClassName) aynı kutuya getirir. */
export const comboControlClass =
  'h-11 rounded-[12px] border-white/[0.08] bg-white/[0.03] px-3 text-[14px] transition-colors duration-200 hover:border-brand/50';

/** Satır eylemleri: üzerine gelince görünür; klavye odağında ve dokunmatikte hep görünür. */
export const revealClass =
  'opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100';

/** Dashboard satırı: üzerine gelince altın dolgu. RowBar ve RowArrow ile birlikte kullanılır. */
export const rowClass = 'gold-fade gold-fade-x group/row relative';

/** Satırın sol kenarında, üzerine gelince ortadan açılan altın çizgi. */
export function RowBar({ active }: { active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute inset-y-3 left-0 w-[2px] origin-center rounded-r-full bg-brand transition-transform duration-300 ease-out group-hover/row:scale-y-100',
        active ? 'scale-y-100' : 'scale-y-0',
      )}
    />
  );
}

/** Satırın sonundaki ok: üzerine gelince kayar ve altına döner. */
export function RowArrow({ className }: { className?: string }) {
  return (
    <ArrowRight
      aria-hidden
      className={cn(
        'size-4 shrink-0 text-white/25 transition-[transform,color] duration-300 ease-out group-hover/row:translate-x-1 group-hover/row:text-brand',
        className,
      )}
    />
  );
}

/** Sayfa başlığı: kutusuz, büyük ve sıkı; altında tek satırlık açıklama, sağda eylemler. */
export function PageHeader({
  title,
  description,
  actions,
  tour,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  tour?: string;
}) {
  return (
    <header data-tour={tour} className="flex flex-col gap-5 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* Ekrana girerken başlık harf harf netleşir, açıklama ardından bütün olarak yükselir. */}
        <h1 className="text-[30px] font-medium leading-[1.06] tracking-[-0.035em] text-white sm:text-[36px] lg:text-[40px]">
          <SmokeT>{title}</SmokeT>
        </h1>
        {description ? (
          <p key={title} className="fx-rise mt-2.5 max-w-[62ch] text-[14px] leading-relaxed text-white/50">
            {typeof description === 'string' ? <T>{description}</T> : description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode };

const primaryClass =
  'press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-brand px-4 text-[14px] font-medium text-primary-foreground outline-none transition-colors duration-200 hover:bg-[#e4c43c] focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50';

/** İkincil eylem: ince kenarlı; üzerine gelince altın dolar. */
export const secondaryClass =
  'press inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] border border-white/[0.1] bg-white/[0.03] px-4 text-[14px] font-medium text-white/85 outline-none transition-colors duration-200 hover:border-brand hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50';

/** Sayfadaki ana eylem: altın dolgu. */
export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function PrimaryButton(
  { icon, children, className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(primaryClass, className)} {...props}>
      {icon}
      {children}
    </button>
  );
});

export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function SecondaryButton(
  { icon, children, className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(secondaryClass, className)} {...props}>
      {icon}
      {children}
    </button>
  );
});

/** İkincil eylemin bağlantı hâli (sayfa değiştiren düğmeler). */
export function SecondaryLink({ href, icon, children, className }: { href: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(secondaryClass, className)}>
      {icon}
      {children}
    </Link>
  );
}

/** Satır içi simge düğmesi: üzerine gelince altın; silmede kırmızı dolar. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' }
>(function IconButton({ label, tone = 'default', className, type = 'button', children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'press flex size-8 shrink-0 items-center justify-center rounded-[9px] text-white/45 outline-none transition-[color,background-color,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-40',
        tone === 'danger'
          ? 'hover:bg-destructive hover:text-white'
          : 'hover:bg-brand hover:text-primary-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/** Arama kutusu: büyüteç, temizle düğmesi, Esc ile temizleme. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(fieldClass, 'w-full pl-10 pr-10 placeholder:text-white/30')}
      />
      {value ? (
        <button
          type="button"
          aria-label="Aramayı temizle"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition-colors duration-150 hover:bg-brand hover:text-primary-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export type MenuOption = { value: string; label: string; group?: string; hint?: string };

const foldText = (s: string) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');

/**
 * Açılır seçim (HIG "pop-up button"): düğmede seçili değer; liste düğmeden büyüyerek açılır,
 * seçilide ✓ durur, üzerindeki / klavyeyle seçili satır altın dolar. 10'dan uzun listede arama
 * kutusu çıkar. Liste body'ye taşınır (kutuların overflow'u kesmesin); diyalog içinde `inline`.
 * `name` verilirse gizli input ile formda gönderilir; `defaultValue` ile kontrolsüz de çalışır.
 */
export function SelectMenu({
  value,
  defaultValue,
  onChange,
  options,
  label,
  placeholder = 'Seçin',
  active,
  size = 'md',
  variant = 'field',
  searchable,
  name,
  inline,
  align = 'start',
  menuWidth,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: MenuOption[];
  label: string;
  placeholder?: string;
  active?: boolean;
  size?: 'sm' | 'md';
  variant?: 'field' | 'ghost';
  searchable?: boolean;
  name?: string;
  inline?: boolean;
  align?: 'start' | 'end';
  menuWidth?: number;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const canSearch = searchable ?? options.length > 10;
  const selected = options.find((o) => o.value === current);

  const filtered = useMemo(() => {
    const q = foldText(query.trim());
    return q ? options.filter((o) => foldText(`${o.label} ${o.group || ''}`).includes(q)) : options;
  }, [options, query]);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect(r);
  }, []);

  const openMenu = () => {
    place();
    setQuery('');
    setHi(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    if (canSearch) searchRef.current?.focus();
    else listRef.current?.focus();
  }, [open, canSearch]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHi(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHi(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[hi];
      if (o) pick(o.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  // Yer: altta yer yoksa ve üstte varsa yukarı açılır; ekran kenarına taşmaz.
  const width = Math.max(rect?.width ?? 0, menuWidth ?? 220);
  const below = rect ? window.innerHeight - rect.bottom : 0;
  const up = rect ? below < 300 && rect.top > below : false;
  const left = rect
    ? Math.min(Math.max(8, align === 'end' ? rect.right - width : rect.left), window.innerWidth - width - 8)
    : 0;
  const floating: CSSProperties = rect
    ? {
        position: 'fixed',
        left,
        width,
        ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
        transformOrigin: up ? 'bottom' : 'top',
      }
    : {};

  let lastGroup: string | undefined;
  const menu = open ? (
    <div
      ref={menuRef}
      style={inline ? { width, transformOrigin: 'top' } : floating}
      className={cn(
        'menu-pop z-[200] overflow-hidden rounded-[16px] border border-white/[0.1] bg-[#1e1e21] p-1.5 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.4)]',
        inline && cn('absolute top-full mt-1.5', align === 'end' ? 'right-0' : 'left-0'),
      )}
    >
      {canSearch ? (
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/35" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
            }}
            onKeyDown={onKey}
            placeholder="Ara"
            aria-label={`${label} içinde ara`}
            aria-controls={`${id}-list`}
            aria-activedescendant={filtered[hi] ? `${id}-o-${hi}` : undefined}
            className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-brand/60"
          />
        </div>
      ) : null}
      <div
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        tabIndex={-1}
        aria-label={label}
        aria-activedescendant={filtered[hi] ? `${id}-o-${hi}` : undefined}
        onKeyDown={onKey}
        className="max-h-[300px] overflow-y-auto outline-none [scrollbar-width:thin]"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-white/40">Sonuç yok</p>
        ) : (
          filtered.map((o, i) => {
            const on = o.value === current;
            const lit = i === hi;
            const header = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.value}>
                {header ? (
                  <p className="mt-1.5 border-t border-white/[0.06] px-3 pb-1 pt-2.5 text-[11.5px] font-medium text-white/40 first:mt-0 first:border-t-0 first:pt-1">
                    {header}
                  </p>
                ) : null}
                <div
                  id={`${id}-o-${i}`}
                  role="option"
                  aria-selected={on}
                  data-i={i}
                  onPointerMove={() => {
                    if (!lit) setHi(i);
                  }}
                  onClick={() => pick(o.value)}
                  className={cn(
                    'flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14px] leading-snug transition-colors duration-100',
                    lit ? 'bg-brand text-primary-foreground' : 'text-white/85',
                  )}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      on ? (lit ? 'text-primary-foreground' : 'text-brand') : 'opacity-0',
                    )}
                    strokeWidth={2.2}
                  />
                  <span className={cn('min-w-0 flex-1 truncate', on && 'font-medium')}>{o.label}</span>
                  {o.hint ? (
                    <span className={cn('shrink-0 text-[12px] tabular-nums', lit ? 'text-primary-foreground/60' : 'text-white/35')}>
                      {o.hint}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={cn('relative min-w-0', className)}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          fieldClass,
          'flex w-full cursor-pointer items-center gap-2 pl-3.5 pr-3 text-left',
          size === 'sm' && 'h-9 rounded-[10px] pl-3 pr-2.5 text-[13px]',
          variant === 'ghost' && 'border-transparent bg-transparent text-white/60 hover:border-white/[0.12] hover:text-white',
          active && 'border-brand/60 bg-brand/[0.07]',
          open && 'border-brand/70 ring-4 ring-brand/15',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-white/40')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-white/40 transition-transform duration-200', open && 'rotate-180 text-brand')}
        />
      </button>
      {menu && (inline ? menu : createPortal(menu, document.body))}
    </div>
  );
}

/** Bölümlü seçici: seçili seçenek altın dolu; diğerleri üzerine gelince altın yazı. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex h-11 max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-1 [scrollbar-width:none]',
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'press flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40',
              on ? 'bg-brand text-primary-foreground' : 'text-white/55 hover:text-brand-ink',
            )}
          >
            {o.label}
            {o.count != null ? (
              <span className={cn('tabular-nums', on ? 'text-primary-foreground/55' : 'text-white/35')}>
                {o.count.toLocaleString('tr-TR')}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Dashboard kutusu. */
export function Tile({ className, children, tour }: { className?: string; children: ReactNode; tour?: string }) {
  return (
    <section
      data-tour={tour}
      className={cn('bento-tile relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-card', className)}
    >
      {children}
    </section>
  );
}

/** Kutu başlığı: solda ad, sağda sayı veya küçük denetim; altı saç çizgisiyle ayrılır. */
export function TileHeader({ title, aside, className }: { title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[60px] items-center justify-between gap-3 border-b border-hairline px-6 py-3.5', className)}>
      {/* Yazı efektli başlık kesilmez (truncate taşanı keser, harfler bir duvarın altından çıkıyor gibi görünürdü). */}
      <h3
        className={cn(
          'min-w-0 text-[15px] font-medium tracking-[-0.012em] text-white',
          typeof title === 'string' ? 'whitespace-nowrap' : 'truncate',
        )}
      >
        {typeof title === 'string' ? <SmokeT>{title}</SmokeT> : title}
      </h3>
      {aside ? <div className="flex shrink-0 items-center gap-2 text-[12px] tabular-nums text-white/35">{aside}</div> : null}
    </div>
  );
}

/** Durum: hareketli StatusGlyph yuvarlak içinde, yanında durum rengiyle etiket (dashboard'daki gibi). */
export function StatusChip({
  status,
  label,
  size = 'md',
  className,
}: {
  status: string;
  label?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center font-medium',
        size === 'sm' ? 'gap-2 text-[12px]' : 'gap-2.5 text-[12.5px]',
        className,
      )}
      style={{ color: tone }}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/row:scale-110 group-hover/card:scale-110',
          size === 'sm' ? 'size-6' : 'size-8',
        )}
        style={{ background: `${tone}17`, boxShadow: `inset 0 0 0 1px ${tone}33` }}
      >
        <StatusGlyph status={status} className={size === 'sm' ? 'size-[14px]' : 'size-[18px]'} />
      </span>
      {label != null ? <span className="truncate">{label}</span> : null}
    </span>
  );
}

/**
 * Dashboard sayı kutusu: üstte simge (bağlantıysa sağda dönen ok), ortada ince ve büyük sayı,
 * altta etiket ve açıklama. Üzerine gelince altın dolgu, sayı hafif kalkar, alt çizgi soldan dolar.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  prefix,
  suffix,
  sub,
  tone = 'var(--brand)',
  href,
  onClick,
  active,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  /** Rakamdan önce küçük işaret (Türkçede yüzde: "%12"). */
  prefix?: string;
  suffix?: string;
  sub?: ReactNode;
  tone?: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-6 bottom-0 h-[2px] origin-left rounded-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/stat:scale-x-100',
          active ? 'scale-x-100' : 'scale-x-0',
        )}
        style={{ background: tone }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <Icon className="size-[18px] shrink-0" style={{ color: tone }} strokeWidth={1.8} />
        {href || onClick ? (
          <ArrowRight className="size-4 shrink-0 -translate-x-1.5 -rotate-45 text-brand opacity-0 transition-[opacity,transform] duration-300 group-hover/stat:translate-x-0 group-hover/stat:opacity-100" />
        ) : null}
      </div>
      <div className="relative mt-5 flex h-[46px] items-baseline gap-1 transition-transform duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover/stat:-translate-y-1">
        {prefix && value != null ? <span className="text-[24px] font-[300] tracking-[-0.02em] text-white/70">{prefix}</span> : null}
        {value == null ? (
          <span className="text-[46px] font-[200] leading-[0.85] tracking-[-0.05em] text-white/30">—</span>
        ) : (
          <CountUp value={value} className="block text-[46px] font-[200] leading-[0.85] tracking-[-0.05em] text-white tabular-nums" />
        )}
        {suffix && value != null ? <span className="text-[24px] font-[300] tracking-[-0.02em] text-white/70">{suffix}</span> : null}
      </div>
      <div className="relative mt-auto pt-4">
        <p className="truncate text-[13px] font-medium leading-snug text-white/75 transition-colors duration-200 group-hover/stat:text-white">
          {label}
        </p>
        {sub ? <p className="mt-0.5 truncate text-[12px] text-white/38">{sub}</p> : null}
      </div>
    </>
  );
  const cls = cn(
    'bento-tile gold-fade group/stat relative flex min-h-[164px] flex-col overflow-hidden rounded-[22px] border border-white/[0.07] bg-card p-5 text-left outline-none focus-visible:border-brand/60 sm:p-6',
    active && 'border-brand/40',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Bilgi satırındaki ayırıcı: dashboard'daki küçük yuvarlak. */
export function Dot() {
  return <span aria-hidden className="size-[3px] shrink-0 rounded-full bg-white/25" />;
}

/** Ad baş harfi dairesi (firma, kişi). */
export function Initial({ name, className }: { name?: string | null; className?: string }) {
  const letter = String(name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return (
    <span
      title={name || undefined}
      className={cn(
        'inline-flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-[#26262a] text-[11px] font-medium text-white/75 ring-2 ring-card',
        className,
      )}
    >
      {letter}
    </span>
  );
}

/** Firma baş harfi kutusu: üzerine gelince alttan altın dolar (dashboard kısayolları gibi). */
export function InitialTile({ name, className, groupClass = 'group-hover/row:scale-y-100' }: { name?: string | null; className?: string; groupClass?: string }) {
  const letter = String(name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.03] text-[14px] font-medium text-brand',
        className,
      )}
    >
      <span
        className={cn(
          'absolute inset-0 origin-bottom scale-y-0 bg-brand transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          groupClass,
        )}
      />
      <span className="relative transition-colors duration-300 group-hover/row:text-[#141416] group-hover/card:text-[#141416]">{letter}</span>
    </span>
  );
}

/** Yükleme durumu: ekranın düzenine benzeyen iskelet (spinner yok). Etiket yalnızca ekran okuyucuya. */
export function LoadingState({
  label = 'Yükleniyor',
  className,
  variant = 'rows',
  count,
}: {
  label?: string;
  className?: string;
  variant?: 'rows' | 'cards' | 'form';
  count?: number;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {variant === 'cards' ? (
        <SkeletonCards count={count ?? 6} />
      ) : variant === 'form' ? (
        <SkeletonForm fields={count ?? 4} />
      ) : (
        <SkeletonRows rows={count ?? 6} />
      )}
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonHeader, SkeletonRows, SkeletonCards, SkeletonForm, SkeletonPanel, DetailSkeleton, PageSkeleton, Swap } from './Skeleton';

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center', className)}>
      {icon ? (
        <span className="mb-4 flex size-12 items-center justify-center rounded-full border border-white/10 text-white/35 [&>svg]:size-5">
          {icon}
        </span>
      ) : null}
      <p className="text-[15px] font-medium text-white">
        <T>{title}</T>
      </p>
      {body ? (
        <p className="mt-1 max-w-[44ch] text-[13.5px] leading-relaxed text-white/45">
          {typeof body === 'string' ? <T>{body}</T> : body}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-[14px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive',
        className,
      )}
    >
      {children}
    </p>
  );
}
