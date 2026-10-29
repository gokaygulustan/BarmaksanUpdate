// Tedarik süreci durum ikonları: her durum kendi işini yapan çok parçalı, hareketli bir çizim.
// Taslakta satırlar yazılır, iletilende kâğıt uçak süzülür, teklif gelende belge kutuya düşer,
// onay bekleyende kum akar ve saat döner, üst yönetimde mühür basılır, iadede ok geri döner,
// satın almada sepetin içine tik atılır, teminde dişliler döner, tamamlananda halka ve tik
// çizilir, ret/iptalde çarpı çizilir, sorunluda uyarı titrer. Hareketler status-glyph.css'te;
// hareket azaltılınca durur. Bilerek "lucide" sınıfı yok: genel ikon katmanı karışmaz.
import { cn } from '@/lib/utils';

type GlyphKind =
  | 'draft'
  | 'send'
  | 'quote'
  | 'approved'
  | 'hourglass'
  | 'stamp'
  | 'return'
  | 'cart'
  | 'gears'
  | 'done'
  | 'cancel'
  | 'alert';

const STATUS_META: Record<string, { kind: GlyphKind; color: string }> = {
  DRAFT: { kind: 'draft', color: '#9a9aa1' },
  SENT_TO_VENDOR: { kind: 'send', color: '#7aa7ff' },
  VENDOR_QUOTED: { kind: 'quote', color: '#e3c13b' },
  PENDING_MANAGER_APPROVAL: { kind: 'hourglass', color: '#f2a93b' },
  PENDING_ADMIN_APPROVAL: { kind: 'stamp', color: '#f08a4b' },
  RETURNED_TO_MANAGER: { kind: 'return', color: '#f2705e' },
  APPROVED_FOR_PURCHASE: { kind: 'cart', color: '#5cc98f' },
  VENDOR_APPROVED: { kind: 'approved', color: '#5cc98f' },
  IN_PRODUCTION: { kind: 'gears', color: '#4fc3c9' },
  COMPLETED: { kind: 'done', color: '#3fbf7f' },
  REJECTED: { kind: 'cancel', color: '#ef5a50' },
  CANCELLED: { kind: 'cancel', color: '#d9655d' },
  HAS_ISSUES: { kind: 'alert', color: '#ef5a50' },
  // Tedarik dışı durumlar aynı çizimleri paylaşır: mail günlüğü, teklif kabulü, hesap durumu.
  MAIL_SENT: { kind: 'send', color: '#5cc98f' },
  MAIL_SKIPPED: { kind: 'return', color: '#f2a93b' },
  MAIL_FAILED: { kind: 'alert', color: '#ef5a50' },
  MAIL_PREVIEW: { kind: 'draft', color: '#9a9aa1' },
  OFFER_PICKED: { kind: 'done', color: '#3fbf7f' },
  OFFER_NOT_PICKED: { kind: 'cancel', color: '#ef5a50' },
  USER_ACTIVE: { kind: 'done', color: '#3fbf7f' },
  USER_INACTIVE: { kind: 'cancel', color: '#8a8a91' },
};

const FALLBACK = { kind: 'draft' as GlyphKind, color: '#9a9aa1' };

/** Durumun anlamına göre rengi: tamam yeşil, ret/sorun kırmızı, bekleyen amber, yolda mavi. */
export function statusTone(status: string) {
  return (STATUS_META[status] ?? FALLBACK).color;
}

const DOC = (
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </>
);

const SHAPES: Record<GlyphKind, React.ReactNode> = {
  draft: (
    <>
      {DOC}
      <path className="sg-w1" d="M8.5 12.5h7" />
      <path className="sg-w2" d="M8.5 16h4.5" />
    </>
  ),
  send: (
    <>
      <g className="sg-plane">
        <path d="m21.5 2.5-6.8 19-3.7-8.2-8.2-3.7z" />
        <path d="M21.5 2.5 11 13" />
      </g>
      <path className="sg-trail sg-t1" d="M2.5 21.5 6 18" />
      <path className="sg-trail sg-t2" d="M7.5 22.2 9 20.7" />
    </>
  ),
  // Teklif geldi: fiyat etiketi deliğinden sallanır; boş köşede "yeni" kıvılcımı parlar.
  // Etiketin geniş ucu ve deliği sol üstte: alanın ağırlık merkezi kutunun ortasından sol üstte
  // kalıyordu. Şekil ölçülen fark kadar sağ alta kaydırıldı — ağırlık merkezi 12,12'de.
  quote: (
    <>
      <g className="sg-tag">
        <path d="M13.15 4.03a1.6 1.6 0 0 0-1.1-.5H5.45a1.8 1.8 0 0 0-1.8 1.8v6.6c0 .4.2.8.5 1.1l8.4 8.4a2 2 0 0 0 2.8 0l5.9-5.9a2 2 0 0 0 0-2.8z" />
        <circle cx="8.25" cy="8.13" r="1.15" />
      </g>
      <path className="sg-spark" d="M19 2.4v3M17.5 3.9h3" />
    </>
  ),
  approved: (
    <>
      {DOC}
      <path className="sg-tick" d="m8.8 14.2 2.2 2.2 4.2-4.6" />
    </>
  ),
  // Kum saati: gövde 12,12'ye göre birebir simetrik; üst kum ve alt yığın aynı ağırlıkta, aynı
  // uzaklıkta — dururken de dönerken de tam ortada.
  hourglass: (
    <g className="sg-glass">
      <path d="M5.5 2.5h13M5.5 21.5h13" />
      <path d="M7 2.5v3.7a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2.5" />
      <path d="M7 21.5v-3.7a2 2 0 0 1 .6-1.4L12 12l4.4 4.4a2 2 0 0 1 .6 1.4v3.7" />
      <path className="sg-sand-top" d="M8.6 5.6h6.8L12 9z" fill="currentColor" stroke="none" />
      <path className="sg-sand-bot" d="M8.6 18.4h6.8L12 15z" fill="currentColor" stroke="none" />
      <path className="sg-stream" d="M12 10v5" />
    </g>
  ),
  stamp: (
    <>
      <g className="sg-stamp-head">
        <path d="M10 3.5h4v3.2c0 .8.6 1.3 1.3 1.6l.9.4c.9.4 1.3 1 1.3 1.9V12h-11v-1.4c0-.9.4-1.5 1.3-1.9l.9-.4c.7-.3 1.3-.8 1.3-1.6z" />
        <path d="M6.5 14.5h11" />
      </g>
      <path d="M4.5 20.5h15" />
      <path className="sg-ink" d="M8.5 17.6h7" />
    </>
  ),
  return: (
    <>
      <path className="sg-ret-path" d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      <path className="sg-ret-head" d="M9 14 4 9l5-5" />
    </>
  ),
  cart: (
    <>
      <g className="sg-cart">
        <path d="M2.5 3.5h2.2l2.3 10.6a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.1L20.5 7H5.6" />
        <circle cx="9" cy="19.5" r="1.3" />
        <circle cx="17" cy="19.5" r="1.3" />
      </g>
      <path className="sg-tick" d="m9.8 10.6 1.9 1.9 3.6-3.7" />
    </>
  ),
  gears: (
    <>
      <g className="sg-gear-a">
        <circle cx="9.5" cy="10" r="5.6" strokeWidth="2.6" strokeDasharray="1.9 2.5" strokeLinecap="butt" />
        <circle cx="9.5" cy="10" r="3.6" />
        <circle cx="9.5" cy="10" r="1.1" />
      </g>
      <g className="sg-gear-b">
        <circle cx="17" cy="16.5" r="3.6" strokeWidth="2.4" strokeDasharray="1.6 2.17" strokeLinecap="butt" />
        <circle cx="17" cy="16.5" r="2" />
      </g>
    </>
  ),
  done: (
    <>
      <circle className="sg-ring" cx="12" cy="12" r="9" />
      <path className="sg-done-tick" d="m8 12.3 2.7 2.7 5.3-5.6" />
    </>
  ),
  cancel: (
    <>
      <circle className="sg-ring-static" cx="12" cy="12" r="9" />
      <path className="sg-x1" d="m9 9 6 6" />
      <path className="sg-x2" d="m15 9-6 6" />
    </>
  ),
  alert: (
    <>
      <path className="sg-tri" d="M10.3 3.9 2.6 17.3a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path className="sg-bang" d="M12 9.5v4" />
      <path className="sg-bang" d="M12 17h.01" />
    </>
  ),
};

export function StatusGlyph({
  status,
  className,
  color,
}: {
  status: string;
  className?: string;
  /** Durumun kendi rengi yerine (ör. sakin bir başlıkta gri). */
  color?: string;
}) {
  const meta = STATUS_META[status] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('status-glyph shrink-0 overflow-visible', `sg-${meta.kind}`, className)}
      style={{ color: color ?? meta.color }}
    >
      {SHAPES[meta.kind]}
    </svg>
  );
}
