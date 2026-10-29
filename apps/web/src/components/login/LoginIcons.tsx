import { cn } from '@/lib/utils';

/**
 * Giriş ekranının kendi simgeleri. Tek çizgi kalınlığı (1.7), yuvarlak uçlar, 24'lük ızgara; her biri kendi
 * durumunda kısa bir hareket yapar: kart sallanır, binanın ışıkları yanar, göz kırpar, ok uzar, onay çizilir.
 * Hareketler globals.css'te (.li-*); hareket azaltılmışsa yalnızca son hal görünür.
 */
type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

/** Yetkili girişi: askılı kimlik kartı. Seçilince askıdan hafifçe sallanır, bilgi satırları yazılır. */
export function StaffBadgeIcon({ active, className }: IconProps & { active?: boolean }) {
  return (
    <svg {...base} className={cn('li-icon overflow-visible', active && 'li-on', className)}>
      <g className="li-swing">
        <path d="M10 5.5V4a2 2 0 0 1 4 0v1.5" />
        <rect x="4" y="5.5" width="16" height="14.5" rx="3.2" />
        <circle cx="9.3" cy="11.6" r="1.9" />
        <path d="M6.6 16.6c.5-1.4 1.5-2.1 2.7-2.1s2.2.7 2.7 2.1" />
        <path className="li-line" pathLength={1} d="M14.6 11h2.9" />
        <path className="li-line li-line-2" pathLength={1} d="M14.6 14.4h2" />
      </g>
    </svg>
  );
}

/** Birim girişi: iki kütleli ofis binası. Seçilince pencereler sırayla yanar. */
export function UnitBuildingIcon({ active, className }: IconProps & { active?: boolean }) {
  return (
    <svg {...base} className={cn('li-icon', active && 'li-on', className)}>
      <path d="M4.5 20V6.4c0-.8.6-1.4 1.4-1.4h6.7c.8 0 1.4.6 1.4 1.4V20" />
      <path d="M14 10.5h4.1c.8 0 1.4.6 1.4 1.4V20" />
      <path d="M3 20h18" />
      <path d="M8.2 20v-3.2h2.1V20" />
      <path className="li-window" d="M7.6 8.6h.01M10.9 8.6h.01" strokeWidth={2.4} />
      <path className="li-window li-window-2" d="M7.6 12.4h.01M10.9 12.4h.01" strokeWidth={2.4} />
      <path className="li-window li-window-3" d="M16.8 14h.01M16.8 17h.01" strokeWidth={2.4} />
    </svg>
  );
}

/** Şifre: açık göz şifre görünür, kapalı göz (kirpikli) gizli. Değişirken göz kapağı kırpılır. */
export function PeekEyeIcon({ open, className }: IconProps & { open: boolean }) {
  return (
    <svg {...base} className={cn('li-icon overflow-visible', className)}>
      <g className="li-lid" style={{ transform: open ? 'scaleY(1)' : 'scaleY(0.08)' }}>
        <path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12Z" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </g>
      <g className="li-lashes" style={{ opacity: open ? 0 : 1 }}>
        <path d="M3 11.6c2.5 3 5.5 4.6 9 4.6s6.5-1.6 9-4.6" />
        <path d="m6.4 14.9-1.1 1.9M12 16.4v2.2M17.6 14.9l1.1 1.9" />
      </g>
    </svg>
  );
}

/** İleri: gövde üzerine gelince uzar, uç öne kayar (düğmenin group/submit sınıfıyla). */
export function GoArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={cn('li-icon overflow-visible', className)}>
      <path className="li-shaft" d="M4.5 12h14" />
      <path className="li-head" d="m13.5 6.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

/** Geri: ileri okun aynası; üzerine gelince geriye kayar. */
export function BackArrowIcon({ className }: IconProps) {
  return (
    <svg {...base} className={cn('li-icon overflow-visible', className)}>
      <path d="M19.5 12h-14" />
      <path d="m10.5 6.5-5.5 5.5 5.5 5.5" />
    </svg>
  );
}

/** Bekleme: soluk halka üstünde dönen kısa bir yay. */
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={cn('li-spin', className)}>
      <circle cx="12" cy="12" r="8.5" strokeOpacity={0.2} />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
    </svg>
  );
}

/** Onay: kalın, yuvarlak uçlu tik; göründüğü an çizilir. */
export function CheckDrawIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2.6} className={cn('li-icon', className)}>
      <path className="li-check" pathLength={1} d="m5.5 12.6 4.2 4.1 8.8-9.4" />
    </svg>
  );
}
