import { getFrontendBaseUrl } from '../../config/frontendUrl.js';
import { prisma } from '../../lib/prisma.js';
import { resolveQuoteLetterhead } from '../../lib/quoteLetterhead.js';
import {
  buildPortalEmailHTML,
  buildOtpEmailHTML,
  buildPasswordResetEmailHTML,
  escapeHtml,
  htmlToPlainText,
  mailFooterHtml,
  mailSayinBeyGreeting,
  mailSayinGreeting,
  mailStrong,
  mailSubject,
} from './mail-layout.js';
import { MAIL_LOGO_SRC } from './mail-logo.js';
import {
  MAIL_CHANNEL,
  buildDepartmentRequestMail,
  buildInternalRequestAssignedMail,
  buildRequesterStatusMail,
} from './mail-settings.service.js';

const dispatchMail = async (options, opts) => {
  const { dispatchMail: send } = await import('./mail-settings.service.js');
  return send(options, opts);
};

const lookupUserNameByEmail = async (email) => {
  const e = String(email || '')
    .trim()
    .toLowerCase();
  if (!e) return null;
  const u = await prisma.user.findFirst({
    where: { email: { equals: e, mode: 'insensitive' } },
    select: { name: true },
  });
  return u?.name ? String(u.name).trim() : null;
};

/** Ekip CC'si yalnız SATIN_ALMA taleplerinde; Üretim akışı etkilenmez. */
const isSatinAlmaRequest = async (request) => {
  if (!request) return false;
  if (request.moduleId) return request.moduleId === 'SATIN_ALMA';
  if (!request.id) return false;
  const row = await prisma.procurementRequest.findUnique({
    where: { id: request.id },
    select: { moduleId: true },
  });
  return row?.moduleId === 'SATIN_ALMA';
};

const formatTrDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const quoteInviteExtraHtml = (_request) => '';

/** Mail gövdesinde kişi/müdür ve iç liste adı yok; hitap + tarih/son gün. */
const quoteLetterheadHtml = (vendorName, letterhead) => {
  const quoteDate = formatTrDate(letterhead?.quoteDate);
  const quoteDeadline = formatTrDate(letterhead?.quoteDeadline);
  const dateBits = [];
  if (quoteDate) dateBits.push(`Teklif tarihi: <strong style="color:#1e293b;">${quoteDate}</strong>`);
  if (quoteDeadline) dateBits.push(`Son gün: <strong style="color:#1e293b;">${quoteDeadline}</strong>`);
  const metaRight = dateBits.join(' · ');
  const quoteTitle =
    letterhead?.showQuoteTitle && String(letterhead?.quoteRef || '').trim()
      ? escapeHtml(String(letterhead.quoteRef).trim())
      : '';
  const titleRow = quoteTitle
    ? `<tr>
        <td colspan="2" style="font-size:16px;font-weight:700;color:#1e293b;line-height:1.35;padding-bottom:10px;">${quoteTitle}</td>
      </tr>`
    : '';

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${titleRow}
      <tr>
        <td valign="bottom" style="font-size:18px;font-weight:700;color:#1e293b;line-height:1.4;padding-right:12px;">Sayın ${vendorName} yetkilisi</td>
        <td valign="bottom" style="font-size:12px;color:#64748b;line-height:1.5;text-align:right;white-space:nowrap;">${metaRight}</td>
      </tr>
    </table>`;
};

/**
 * Tedarikçi davet e-postası — quote sayfası ile uyumlu kurumsal düzen.
 * Üretim taleplerinde liste adı (quoteRef) hitabın üstünde gösterilir.
 */
const buildProcurementEmailHTML = ({ vendor, request, items, portalUrl, quoteToken, letterhead }) => {
  const itemCount = Array.isArray(items) ? items.length : 0;
  const vendorName = escapeHtml(vendor.name);
  const rawSpec = request.description ? String(request.description) : '';
  const plainSpec = htmlToPlainText(rawSpec);
  const spec = plainSpec ? escapeHtml(plainSpec) : '';
  const year = new Date().getFullYear();
  const quoteUrl = quoteToken ? `${portalUrl}/quote/${quoteToken}` : `${portalUrl}/login`;
  const quoteUrlText = escapeHtml(quoteUrl);
  const extra = quoteInviteExtraHtml(request);
  const letterheadBlock = quoteLetterheadHtml(vendorName, letterhead);

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tedarikçi teklif bildirimi</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#ebebeb;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="border-top:3px solid #D9B625;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:20px 24px 16px;vertical-align:middle;width:42%;">
              <img src="${MAIL_LOGO_SRC}" alt="Uğur Promilling" style="max-height:72px;width:auto;max-width:100%;display:block;" />
            </td>
            <td style="padding:20px 24px 16px;vertical-align:middle;text-align:right;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#D9B625;">Tedarikçi teklif formu</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:28px 16px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <tr>
            <td style="padding:28px 28px 20px;border-bottom:1px solid #f1f5f9;">
              ${letterheadBlock}
              <p style="margin:0;font-size:15px;color:#475569;line-height:1.75;">
                Bu bildirim, tedarik ekibimizin hazırladığı talep listesindeki ürün ve miktar kalemleri için fiyat teklifinizi almak amacıyla gönderilmiştir.
                Aşağıdaki güvenli bağlantıyı kullanarak teklif formuna girdiğinizde kalemler ürün adı ve talep miktarlarıyla birlikte listelenir; her satır için birim fiyat, para birimi ve gerektiğinde iskonto ile teknik/ticari notlarınızı girebilirsiniz.
              </p>
              ${
                itemCount > 0
                  ? `<p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">Bu talepte toplam <strong>${itemCount}</strong> ürün kalemi bulunmaktadır.</p>`
                  : ''
              }
              ${extra}
              <p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">
                Kaydettiğiniz teklif değerlendirme sürecine aktarılır. Bu ileti bilgilendirme amaçlıdır; süreç veya liste içeriğiyle ilgili sorularınız için tedarik ekibimizle iletişime geçebilirsiniz.
              </p>
            </td>
          </tr>

          ${
            spec
              ? `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Şartname / teknik notlar</div>
              <div style="font-size:13px;color:#334155;margin-top:8px;line-height:1.65;white-space:pre-wrap;">${spec}</div>
            </td>
          </tr>`
              : ''
          }

          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#252b31;border-radius:10px;border:1px solid #1e293b;border-left:4px solid #D9B625;">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <div style="font-size:14px;font-weight:700;color:#D9B625;margin-bottom:6px;">Teklif formuna erişim</div>
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;line-height:1.5;">Bağlantı yalnızca bu e-postanın alıcısı için geçerlidir. Bazı posta sistemleri düğmeyi engelleyebilir; sorun yaşarsanız aşağıdaki adresi tarayıcıya kopyalayın.</div>
                    <a href="${quoteUrl}"
                      style="display:inline-block;background:#D9B625;color:#1e293b;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:8px;">
                      Teklif formunu aç
                    </a>
                    <div style="margin-top:22px;padding:12px 14px;background:#1a1f24;border-radius:6px;text-align:left;word-break:break-all;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Bağlantı (kopyala-yapıştır)</div>
                      <span style="font-size:12px;color:#D9B625;font-family:Consolas,'Courier New',monospace;">${quoteUrlText}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${mailFooterHtml(year)}

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
};

/**
 * Ana adres + yetkili kişilerin adresleri (+ eski ek adres alanı);
 * boşluk atılır, büyük/küçük harfte tekrarlar gider.
 * Tedarikçiyle ilgili her e-posta bu listenin tamamına gider.
 */
export function resolveVendorNotificationEmails(vendor) {
  if (!vendor) return [];
  const raw = [
    vendor.contactEmail,
    ...(vendor.contacts || []).map((contact) => contact?.email),
    ...(vendor.extraContactEmails || []),
  ]
    .filter(Boolean)
    .map((e) => String(e).trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const seen = new Set();
  const out = [];
  for (const e of raw) {
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

const MAILBOX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractMailAddress(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const angle = s.match(/<([^>]+)>/);
  return (angle ? angle[1] : s).trim().toLowerCase();
}

export function formatNamedMailbox(name, email) {
  const e = String(email || '')
    .trim()
    .replace(/^mailto:/i, '');
  if (!MAILBOX_RE.test(e)) return null;
  const n = String(name || '')
    .trim()
    .replace(/["<>\r\n]/g, '');
  return n ? `"${n}" <${e}>` : e;
}

/** Üst yönetim (Barlık) Yanıtla deyince Satın Alma yetkilisi (Çorlu) düşsün. */
export async function resolveSatinAlmaManagerReplyTo() {
  const manager = await prisma.user.findFirst({
    where: {
      isActive: true,
      moduleId: 'SATIN_ALMA',
      subRole: 'MANAGER',
      role: { in: ['PURCHASING', 'ADMIN'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { name: true, email: true },
  });
  return formatNamedMailbox(manager?.name, manager?.email);
}

const replyToIfDistinct = (replyTo, recipientEmail) => {
  if (!replyTo) return {};
  const to = String(recipientEmail || '')
    .trim()
    .toLowerCase();
  const boxed = String(replyTo).toLowerCase();
  if (to && boxed.includes(to)) return {};
  return { replyTo };
};

/** Tedarikçi Yanıtla deyince düşecek kişi: gönderen personel, yoksa atanan / oluşturan. */
export function resolveVendorQuoteReplyTo({ actor, request } = {}) {
  const candidates = [actor, request?.assignedTo, request?.createdBy];
  for (const user of candidates) {
    const boxed = formatNamedMailbox(user?.name, user?.email);
    if (boxed) return boxed;
  }
  return null;
}

/**
 * CC listesi: geçersiz atılır, To ile çakışan ve tekrarlar elenir.
 */
export function resolveCcForVendorEmail(vendor, ccInput) {
  const toSet = new Set(resolveVendorNotificationEmails(vendor).map((e) => e.toLowerCase()));
  const raw = Array.isArray(ccInput) ? ccInput : [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    const e = String(x ?? '')
      .trim()
      .replace(/^mailto:/i, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
    const k = e.toLowerCase();
    if (toSet.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/**
 * Send a procurement request notification email to a vendor.
 * The email contains a read-only order list + a link to login and submit quote on the portal.
 * From adresi dijital@ kalır; Reply-To gönderen personel (SATIN_ALMA ve ÜRETİM).
 */
export const sendProcurementEmail = async ({ vendor, request, items, quoteToken, cc, actor = null }) => {
  const portalUrl = getFrontendBaseUrl();
  const letterhead = await resolveQuoteLetterhead(request);

  const html = buildProcurementEmailHTML({ vendor, request, items, portalUrl, quoteToken, letterhead });

  const recipients = resolveVendorNotificationEmails(vendor);
  if (!recipients.length) {
    console.warn(`⚠️  No notification emails for vendor ${vendor?.name || vendor?.id}`);
    return false;
  }

  const ccMerged = [...(Array.isArray(cc) ? cc : [])];
  const ccList = resolveCcForVendorEmail(vendor, ccMerged);
  const replyTo = resolveVendorQuoteReplyTo({ actor, request });

  try {
    const result = await dispatchMail(
      {
      to: recipients,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
        ...(replyTo ? { replyTo } : {}),
        subject: mailSubject('Fiyat teklif talebi', request?.title),
      html,
      },
      { channel: MAIL_CHANNEL.VENDOR_QUOTE, meta: replyTo ? { replyTo } : undefined },
    );
    if (result.skipped) {
      console.log(`✉️  Email atlandı (kanal kapalı) → ${vendor.name}`);
      return false;
    }
    const ccNote = ccList.length ? ` | cc: ${ccList.join(', ')}` : '';
    const rtNote = replyTo ? ` | reply-to: ${replyTo}` : '';
    console.log(`✉️  Email sent to ${recipients.join(', ')} (${vendor.name})${ccNote}${rtNote}`);
    return true;
  } catch (err) {
    console.error(`❌ Email failed to ${recipients.join(', ')}:`, err.message);
    return false;
  }
};

/**
 * Build HTML email to notify admin/purchasing that a vendor submitted their quote.
 */
const formatMailUnitPriceHtml = (price, currency, discountRate) => {
  if (price == null || price === '' || !Number.isFinite(Number(price))) {
    return '<span style="color:#cbd5e1;">—</span>';
  }
  const symbol = ({ TRY: '₺', USD: '$', EUR: '€', CHF: 'CHF' })[currency] || currency || '';
  const num = Number(price).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const d = Number(discountRate);
  const disc =
    Number.isFinite(d) && d > 0
      ? `<div style="margin-top:4px;font-size:11px;font-weight:600;color:#64748b;">isk. %${escapeHtml(
          String(d)
        )}</div>`
      : '';
  return `${escapeHtml(symbol)} ${escapeHtml(num)}${disc}`;
};

const quoteItemNameCell = (item) => {
  const notesPlain = htmlToPlainText(item.notes);
  return `<td style="padding:10px 12px;font-size:13px;color:#1e293b;font-weight:700;border-bottom:1px solid #e2e8f0;">
        ${escapeHtml(item.productName || '—')}
        ${
          notesPlain
            ? `<div style="margin-top:6px;font-size:11px;font-weight:400;color:#64748b;line-height:1.4;white-space:pre-wrap;">${escapeHtml(
                notesPlain
              )}</div>`
            : ''
        }
      </td>`;
};

const quoteItemQtyCell = (item) => `<td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:center;font-weight:700;border-bottom:1px solid #e2e8f0;">
        ${escapeHtml(String(item.quantity ?? ''))} ${escapeHtml(item.unit || 'Adet')}
        ${
          item.secondaryQuantity
            ? `<br><span style="font-size:11px;color:#94a3b8;font-weight:600;">(${escapeHtml(
                String(item.secondaryQuantity)
              )} ${escapeHtml(item.secondaryUnit || '')})</span>`
            : ''
        }
      </td>`;

const buildQuoteNotificationHTML = ({
  vendorName,
  request,
  quotedItems,
  portalUrl,
  greeting,
  isUpdate = false,
  overallDiscountChange = null,
}) => {
  const vendorSafe = escapeHtml(vendorName || 'Tedarikçi');
  const titleSafe = escapeHtml(request?.title || 'Talep');
  const actionText = isUpdate
    ? 'fiyat teklifini güncelledi'
    : 'fiyat teklifini portala girdi';

  const itemRows = (quotedItems || [])
    .map((item, i) => {
      const quoteNotesPlain = htmlToPlainText(item.quoteNotes);
      const bg = `background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}`;
      const idx = `<td style="padding:10px 12px;font-size:12px;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;">${i + 1}</td>`;
      if (isUpdate) {
        return `<tr style="${bg}">
      ${idx}
      ${quoteItemNameCell(item)}
      ${quoteItemQtyCell(item)}
      <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;color:#94a3b8;text-decoration:line-through;">${formatMailUnitPriceHtml(
        item.oldPrice,
        item.oldCurrency || item.currency,
        item.oldDiscountRate
      )}</td>
      <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:800;border-bottom:1px solid #e2e8f0;color:#1e293b;">${formatMailUnitPriceHtml(
        item.price,
        item.currency,
        item.discountRate
      )}</td>
    </tr>`;
      }
      const priceColor = item.price != null ? '#1e293b' : '#94a3b8';
      return `<tr style="${bg}">
      ${idx}
      ${quoteItemNameCell(item)}
      ${quoteItemQtyCell(item)}
      <td style="padding:10px 12px;font-size:13px;text-align:right;font-weight:800;border-bottom:1px solid #e2e8f0;color:${priceColor};">${formatMailUnitPriceHtml(
        item.price,
        item.currency,
        item.discountRate
      )}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:pre-wrap;">${
        quoteNotesPlain ? escapeHtml(quoteNotesPlain) : '<span style="color:#cbd5e1;">—</span>'
      }</td>
    </tr>`;
    })
    .join('');

  const metaRows = [
    ['Talep', titleSafe],
    ['Tedarikçi', vendorSafe],
    ['Kalem', isUpdate ? `${(quotedItems || []).length} değişen` : `${(quotedItems || []).length}`],
    ['Durum', isUpdate ? 'Güncelleme' : 'İlk teklif'],
    overallDiscountChange
      ? ['Genel iskonto', `%${overallDiscountChange.old} → %${overallDiscountChange.new}`]
      : null,
  ]
    .filter(Boolean)
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:8px 0;font-size:12px;color:#64748b;width:120px;vertical-align:top;">${k}</td>
          <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${v}</td>
        </tr>`
    )
    .join('');

  const requestId = request?.id;
  const ctaUrl = requestId ? `${portalUrl}/procurement/${requestId}` : `${portalUrl}/procurement`;
  const tableHead = isUpdate
    ? `<th style="padding:10px 12px;text-align:center;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;width:36px;">#</th>
                    <th style="padding:10px 12px;text-align:left;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Ürün</th>
                    <th style="padding:10px 12px;text-align:center;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Miktar</th>
                    <th style="padding:10px 12px;text-align:right;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Eski fiyat</th>
                    <th style="padding:10px 12px;text-align:right;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Yeni fiyat</th>`
    : `<th style="padding:10px 12px;text-align:center;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;width:36px;">#</th>
                    <th style="padding:10px 12px;text-align:left;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Ürün</th>
                    <th style="padding:10px 12px;text-align:center;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Miktar</th>
                    <th style="padding:10px 12px;text-align:right;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Birim fiyat</th>
                    <th style="padding:10px 12px;text-align:left;color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Not</th>`;

  return buildPortalEmailHTML({
    kicker: 'Teklif bildirimi',
    heading: request?.title || (isUpdate ? 'Teklif güncellendi' : 'Yeni teklif'),
    greeting: greeting || mailSayinGreeting(null),
    bodyHtml: `<p style="margin:0;"><strong>${vendorSafe}</strong> firması, <strong>${titleSafe}</strong> başlıklı tedarikçi talebi için ${actionText}. ${
      isUpdate
        ? 'Yalnızca değişen kalemlerin eski ve yeni birim fiyatı aşağıdadır.'
        : 'Kalem özetini aşağıda inceleyebilirsiniz.'
    }</p>`,
    extraHtml: `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0">${metaRows}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 20px 8px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin:0 8px 12px;">${
                isUpdate ? 'Değişen kalemler' : 'Teklif kalemleri'
              }</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <thead>
                  <tr style="background:#252b31;">
                    ${tableHead}
              </tr>
            </thead>
                <tbody>${
                  itemRows ||
                  `<tr><td colspan="5" style="padding:16px;font-size:13px;color:#94a3b8;text-align:center;">${
                    isUpdate ? 'Değişen kalem yok.' : 'Kalem bulunmuyor.'
                  }</td></tr>`
                }</tbody>
          </table>
            </td>
          </tr>`,
    ctaLabel: 'Talebi aç',
    ctaUrl,
    portalUrl,
  });
};

/**
 * Teklif geldi / güncellendi → yalnız talebi açan personele.
 */
export const sendQuoteNotificationEmail = async ({
  vendorName,
  request,
  quotedItems,
  isUpdate = false,
  overallDiscountChange = null,
}) => {
  const portalUrl = getFrontendBaseUrl();

  try {
    let owner = request?.createdBy;
    const ownerId = request?.createdById || owner?.id;
    if ((!owner?.email || owner.isActive === false) && (ownerId || request?.id)) {
      const row = ownerId
        ? await prisma.user.findUnique({
            where: { id: ownerId },
            select: { email: true, name: true, isActive: true },
          })
        : (
            await prisma.procurementRequest.findUnique({
              where: { id: request.id },
              select: { createdBy: { select: { email: true, name: true, isActive: true } } },
            })
          )?.createdBy;
      owner = row || owner;
    }

    if (!owner?.email || owner.isActive === false) {
      console.warn('⚠️  Teklif bildirimi: talebi açan kişide aktif e-posta yok, kimseye gönderilmedi.');
      return false;
    }

    const teamCc = await isSatinAlmaRequest(request);
    const subjectTopic = isUpdate ? 'Teklif güncellendi' : 'Yeni teklif';
    const html = buildQuoteNotificationHTML({
      vendorName,
      request,
      quotedItems,
      portalUrl,
      greeting: mailSayinGreeting(owner.name),
      isUpdate,
      overallDiscountChange,
    });
    const result = await dispatchMail(
      {
        to: `"${owner.name || 'Yetkili'}" <${owner.email}>`,
        subject: mailSubject(subjectTopic, request.title),
        html,
        teamCc,
        notify: {
          message: `${vendorName || 'Tedarikçi'}, "${request.title}" talebine ${
            isUpdate ? 'teklifini güncelledi' : 'teklif verdi'
          }.`,
          link: request?.id ? `/procurement/${request.id}` : null,
        },
      },
      { channel: MAIL_CHANNEL.QUOTE_RECEIVED },
    );
    if (result.skipped) {
      console.log('✉️  Teklif bildirimi atlandı (kanal kapalı)');
      return false;
    }
    console.log(`✉️  Quote notification sent to: ${owner.email}`);
    return true;
  } catch (err) {
    console.error('❌ Quote notification email failed:', err.message);
    return false;
  }
};

const buildAllQuotesCompleteHTML = ({ request, vendorNames, portalUrl, greeting }) => {
  const titleSafe = escapeHtml(request?.title || 'Talep');
  const names = Array.isArray(vendorNames) ? vendorNames.filter(Boolean) : [];
  const count = names.length;
  const vendorRows = names
    .map(
      (name, i) => `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
      <td style="padding:10px 12px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${escapeHtml(
        name
      )}</td>
      <td style="padding:10px 12px;font-size:12px;color:#15803d;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Teklif geldi</td>
    </tr>`
    )
    .join('');
  const requestId = request?.id;
  const ctaUrl = requestId ? `${portalUrl}/procurement/${requestId}` : `${portalUrl}/procurement`;

  return buildPortalEmailHTML({
    kicker: 'Teklif bildirimi',
    heading: request?.title || 'Tüm teklifler tamamlandı',
    greeting: greeting || mailSayinGreeting(null),
    bodyHtml: `<p style="margin:0;"><strong>${titleSafe}</strong> talebine fiyat veren <strong>${count}</strong> tedarikçinin de teklifi geldi. Fiyatlar hazır, talebi açıp yan yana bakabilirsiniz.</p>`,
    extraHtml: `<tr>
            <td style="padding:24px 20px 8px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin:0 8px 12px;">Tedarikçiler (${count}/${count})</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <tbody>${
                  vendorRows ||
                  `<tr><td style="padding:16px;font-size:13px;color:#94a3b8;text-align:center;">Tedarikçi yok.</td></tr>`
                }</tbody>
        </table>
      </td>
          </tr>`,
    ctaLabel: 'Talebi aç',
    ctaUrl,
    portalUrl,
  });
};

/**
 * Atanan tüm tedarikçiler teklif verince — talebi açan ve atanan personele (QUOTE_RECEIVED kanalı).
 */
export const sendAllQuotesCompleteEmail = async ({ request, vendorNames }) => {
  const portalUrl = getFrontendBaseUrl();
  const ids = [...new Set([request?.createdById, request?.assignedToId].filter(Boolean))];
  if (!ids.length) {
    console.warn('⚠️  Tüm teklifler bildirimi: alıcı yok, gönderilmedi.');
    return false;
  }

  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, email: true, name: true },
    });
    const seen = new Set();
    let sentAny = false;
    const teamCc = await isSatinAlmaRequest(request);
    const ownerEmails = users.map((u) => u.email).filter(Boolean);
    for (const owner of users) {
      const email = String(owner.email || '')
        .trim()
        .toLowerCase();
      if (!email || seen.has(email)) continue;
      const first = seen.size === 0;
      seen.add(email);

      const html = buildAllQuotesCompleteHTML({
        request,
        vendorNames,
        portalUrl,
        greeting: mailSayinGreeting(owner.name),
      });
      const result = await dispatchMail(
        {
          to: `"${owner.name || 'Yetkili'}" <${owner.email}>`,
          subject: mailSubject('Tüm teklifler tamamlandı', request.title),
          html,
          ...(teamCc && first ? { teamCc: true, teamCcExclude: ownerEmails } : {}),
        },
        { channel: MAIL_CHANNEL.QUOTE_RECEIVED },
      );
      if (result.skipped) {
        console.log('✉️  Tüm teklifler bildirimi atlandı (kanal kapalı)');
        return false;
      }
      sentAny = true;
      console.log(`✉️  All-quotes-complete notification sent to: ${owner.email}`);
    }
    if (!sentAny) {
      console.warn('⚠️  Tüm teklifler bildirimi: aktif e-posta yok, kimseye gönderilmedi.');
    }
    return sentAny;
  } catch (err) {
    console.error('❌ All-quotes-complete email failed:', err.message);
    return false;
  }
};

/**
 * Teklif kararı daveti — portal kart şablonu.
 */
const buildDecisionInviteEmailHTML = ({ requestTitle, decisionUrl, portalUrl, greeting }) =>
  buildPortalEmailHTML({
    kicker: 'Teklif kararı',
    heading: requestTitle || 'Talep',
    greeting: greeting || mailSayinBeyGreeting('Mustafa'),
    bodyHtml: `<p style="margin:0;">Tedarik ekibimiz, ${mailStrong(
      requestTitle || 'Talep'
    )} kapsamında iletilen tedarikçi tekliflerinin değerlendirilmesi için sizin onayınızı beklemektedir.</p>
<p style="margin:14px 0 0;">Kararınızı, kurumsal hesap bilgisi veya ek şifre gerektirmeyen güvenli bağlantı üzerinden kaydedebilirsiniz. Bağlantı <strong>14 gün</strong> süreyle geçerlidir.</p>`,
    ctaLabel: 'Karar ekranını açın',
    ctaUrl: decisionUrl,
    portalUrl,
  });

export const sendDecisionInviteEmail = async ({ to, requestTitle, decisionUrl, recipientName }) => {
  const portalUrl = getFrontendBaseUrl();
  const name = recipientName || (await lookupUserNameByEmail(to)) || 'Mustafa';
  const html = buildDecisionInviteEmailHTML({
    requestTitle,
    decisionUrl,
    portalUrl,
    greeting: mailSayinBeyGreeting(name),
  });

  try {
    const result = await dispatchMail(
      {
        to,
        subject: mailSubject('Teklif kararı', requestTitle || 'Talep'),
      html,
        notify: false,
      },
      { channel: MAIL_CHANNEL.APPROVAL },
    );
    if (result.skipped) {
      console.log(`✉️  Karar daveti atlandı (kanal kapalı) → ${to}`);
      return false;
    }
    console.log(`✉️  Decision invite sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Decision invite email failed to ${to}:`, err.message);
    return false;
  }
};

/* ─── Depo teslim listesi (ürün + miktar + tedarikçi) ─────────────────────── */

const buildWarehouseDispatchEmailHTML = ({ request, items, note, senderName, portalUrl, greeting }) => {
  const year = new Date().getFullYear();
  const dispatchDate = new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  const accent = '#D9B625';
  const plainNote = htmlToPlainText(note);
  const greet = greeting || mailSayinGreeting(null);

  const rows = (items || [])
    .map(
      (item, i) => `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
        <td style="padding:12px 14px;font-size:12px;color:#64748b;text-align:center;font-weight:600;border-bottom:1px solid #e2e8f0;width:36px;">${
          i + 1
        }</td>
        <td style="padding:12px 14px;font-size:13px;color:#1e293b;font-weight:700;border-bottom:1px solid #e2e8f0;">${escapeHtml(
          item.productName
        )}</td>
        <td style="padding:12px 14px;font-size:13px;color:#1e293b;font-weight:700;white-space:nowrap;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(
          String(item.quantity ?? '')
        )} ${escapeHtml(item.unit || '')}</td>
        <td style="padding:12px 14px;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #e2e8f0;">${escapeHtml(
          item.vendorName || '—'
        )}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Depo teslim listesi</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#ebebeb;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="border-top:3px solid ${accent};">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:20px 24px 16px;vertical-align:middle;width:42%;">
              <img src="${MAIL_LOGO_SRC}" alt="Uğur Promilling" style="max-height:72px;width:auto;max-width:100%;display:block;" />
            </td>
            <td style="padding:20px 24px 16px;vertical-align:middle;text-align:right;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:${accent};">Depo teslim listesi</div>
              <div style="font-size:15px;font-weight:600;color:#e2e8f0;margin-top:8px;line-height:1.35;">Mal kabul bildirimi</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:28px 16px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <tr>
            <td style="padding:28px 28px 22px;border-bottom:1px solid #f1f5f9;">
              <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:12px;">${escapeHtml(greet)}</div>
              <p style="margin:0;font-size:15px;color:#475569;line-height:1.75;">
                ${mailStrong(request?.title || 'Tedarikçi talebi')} kapsamında depo teslim listesi oluşturuldu.
                ${
                  request?.requesterName
                    ? ` Talebi ${mailStrong(request.requesterName)}${
                        request?.requesterUnit ? ` (${escapeHtml(request.requesterUnit)})` : ''
                      } açtı.`
                    : ''
                }
              </p>
              <p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">
                Aşağıdaki <strong>${(items || []).length}</strong> ürün belirtilen miktarlarda depoya gelecektir; mal kabulünde bu listeyi esas alın.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;font-size:12px;color:#64748b;width:140px;vertical-align:top;">Talep</td>
                  <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${escapeHtml(
                    request?.title || 'Tedarikçi talebi'
                  )}</td>
                </tr>
                ${
                  request?.requesterName
                    ? `<tr>
                  <td style="padding:8px 0;font-size:12px;color:#64748b;vertical-align:top;">Talep eden</td>
                  <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${escapeHtml(
                    request.requesterName
                  )}</td>
                </tr>`
                    : ''
                }
                ${
                  request?.requesterUnit
                    ? `<tr>
                  <td style="padding:8px 0;font-size:12px;color:#64748b;vertical-align:top;">Birim</td>
                  <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${escapeHtml(
                    request.requesterUnit
                  )}</td>
                </tr>`
                    : ''
                }
                <tr>
                  <td style="padding:8px 0;font-size:12px;color:#64748b;vertical-align:top;">Düzenleme tarihi</td>
                  <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${escapeHtml(dispatchDate)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:12px;color:#64748b;vertical-align:top;">Kalem sayısı</td>
                  <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${(items || []).length}</td>
                </tr>
                ${
                  senderName
                    ? `<tr>
                  <td style="padding:8px 0;font-size:12px;color:#64748b;vertical-align:top;">Gönderen</td>
                  <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${escapeHtml(senderName)}</td>
                </tr>`
                    : ''
                }
              </table>
              ${
                plainNote
                  ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Açıklama</div>
                <div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(
                  plainNote
              )}</div>
              </div>`
              : ''
          }
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#252b31;">
                    <th style="padding:12px 14px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};text-align:center;font-weight:800;width:36px;">#</th>
                    <th style="padding:12px 14px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};text-align:left;font-weight:800;">Ürün</th>
                    <th style="padding:12px 14px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};text-align:right;font-weight:800;">Miktar</th>
                    <th style="padding:12px 14px;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};text-align:left;font-weight:800;">Tedarikçi</th>
                  </tr>
                </thead>
                <tbody>${
                  rows ||
                  `<tr><td colspan="4" style="padding:16px;font-size:13px;color:#94a3b8;text-align:center;">Listede kalem bulunmuyor.</td></tr>`
                }</tbody>
              </table>
            </td>
          </tr>

          ${mailFooterHtml(year)}

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
};

/**
 * Fiyatsız depo teslim listesini depo sorumlularına gönderir.
 * Gönderim hatası akışı kesmemeli; sonuç boolean döner.
 */
export const sendWarehouseDispatchEmail = async ({ to, request, items, note, senderName, recipients: namedRecipients }) => {
  const list =
    Array.isArray(namedRecipients) && namedRecipients.length
      ? namedRecipients
          .map((r) => ({
            email: String(r?.email ?? '').trim(),
            name: r?.name || null,
          }))
          .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
      : (Array.isArray(to) ? to : [to])
    .map((e) => String(e ?? '').trim())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
          .map((email) => ({ email, name: null }));
  if (!list.length) return false;

  const portalUrl = getFrontendBaseUrl();
  let sentAny = false;

  for (const r of list) {
    const name = r.name || (await lookupUserNameByEmail(r.email));
    const html = buildWarehouseDispatchEmailHTML({
      request,
      items,
      note,
      senderName,
      portalUrl,
      greeting: mailSayinGreeting(name),
    });
    try {
      const result = await dispatchMail(
        {
          to: r.email,
          subject: mailSubject('Depo teslim listesi', request?.title || 'Tedarikçi talebi'),
      html,
        },
        { channel: MAIL_CHANNEL.WAREHOUSE },
      );
      if (!result.skipped) sentAny = true;
  } catch (err) {
      console.error(`❌ Depo teslim listesi gönderilemedi (${r.email}):`, err.message);
    }
  }

  if (sentAny) {
    console.log(`✉️  Depo teslim listesi gönderildi → ${list.map((r) => r.email).join(', ')}`);
  } else {
    console.log(`✉️  Depo teslim listesi atlandı (kanal kapalı) → ${list.map((r) => r.email).join(', ')}`);
  }
  return sentAny;
};

/* ─── Onay akışı bildirimleri (personel → yetkili → üst yönetim) ───────────── */

/** Diğer portal mailleriyle aynı marka altını (yeşil/turuncu sapması yok). */
const APPROVAL_MAIL_TONES = {
  neutral: { accent: '#D9B625' },
  warning: { accent: '#D9B625' },
  success: { accent: '#D9B625' },
  danger: { accent: '#D9B625' },
};

const buildApprovalWorkflowEmailHTML = ({
  badge,
  heading,
  greeting,
  intro,
  facts,
  note,
  detailBlocks = [],
  extraHtml = '',
  actionUrl,
  actionLabel,
  portalUrl,
  tone,
}) => {
  const palette = APPROVAL_MAIL_TONES[tone] || APPROVAL_MAIL_TONES.neutral;
  const year = new Date().getFullYear();
  const hrefSafe = actionUrl ? escapeHtml(actionUrl) : '';
  const plainNote = htmlToPlainText(note);
  const greet = greeting || mailSayinGreeting(null);

  const factRows = (facts || [])
    .filter((f) => f && f.label)
    .map(
      (f) => `<tr>
        <td style="padding:8px 0;font-size:12px;color:#64748b;width:120px;vertical-align:top;">${escapeHtml(f.label)}</td>
        <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:${f.strong ? '700' : '600'};">${escapeHtml(
          f.value ?? '—'
        )}</td>
      </tr>`
    )
    .join('');

  const detailBlocksHtml = (detailBlocks || [])
    .map((block) => {
      const body = htmlToPlainText(block?.body);
      if (!body) return '';
      return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${escapeHtml(
          block.title || 'Not'
        )}</div>
        <div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(
          body
        )}</div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading || 'Tedarik onay akışı')}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#ebebeb;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="border-top:3px solid ${palette.accent};">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:20px 24px 16px;vertical-align:middle;width:42%;">
              <img src="${MAIL_LOGO_SRC}" alt="Uğur Promilling" style="max-height:72px;width:auto;max-width:100%;display:block;" />
            </td>
            <td style="padding:20px 24px 16px;vertical-align:middle;text-align:right;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:${palette.accent};">Tedarik onay akışı</div>
              <div style="font-size:15px;font-weight:600;color:#e2e8f0;margin-top:8px;line-height:1.35;">${escapeHtml(
                heading || badge || ''
              )}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:28px 16px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <tr>
            <td style="padding:28px 28px 22px;border-bottom:1px solid #f1f5f9;">
              <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:12px;">${escapeHtml(greet)}</div>
              <div style="font-size:15px;color:#475569;line-height:1.75;">${intro || ''}</div>
            </td>
          </tr>

          ${
            factRows || detailBlocksHtml || plainNote
              ? `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              ${factRows ? `<table width="100%" cellpadding="0" cellspacing="0">${factRows}</table>` : ''}
              ${detailBlocksHtml}
              ${
                plainNote
                  ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Not</div>
                <div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(
                  plainNote
              )}</div>
              </div>`
                  : ''
              }
            </td>
          </tr>`
              : ''
          }

          ${extraHtml || ''}

          ${
            hrefSafe
              ? `<tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#252b31;border-radius:10px;border:1px solid #1e293b;border-left:4px solid ${palette.accent};">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <div style="font-size:13px;font-weight:700;color:${palette.accent};margin-bottom:8px;">Tedarik Portalı Erişimi</div>
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;line-height:1.55;">
                      Düğme görünmüyorsa aşağıdaki adresi tarayıcıya kopyalayabilirsiniz.
                    </div>
                    <a href="${hrefSafe}"
                      style="display:inline-block;background:${palette.accent};color:#1e293b;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:8px;">
                      ${escapeHtml(actionLabel || 'Portalda aç')}
                    </a>
                    <div style="margin-top:22px;padding:12px 14px;background:#1a1f24;border-radius:6px;text-align:left;word-break:break-all;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Bağlantı</div>
                      <span style="font-size:12px;color:#cbd5e1;font-family:Consolas,'Courier New',monospace;">${hrefSafe}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ''
          }

          ${mailFooterHtml(year)}

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
};

/**
 * Limit aşımı — üye olmadan günlük onay kutusu.
 */
export const sendOverLimitInboxEmail = async ({
  to,
  requestTitle,
  escalatedByName,
  totalText,
  limitText,
  exceedsText,
  pendingCount,
  inboxPath,
  recipientName,
  kind,
  unitLabel = 'Üretim Planlama',
  replyToUser = null,
}) => {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((e) => String(e ?? '').trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (!recipients.length) return false;

  const portalUrl = getFrontendBaseUrl();
  const actionUrl = `${portalUrl}${inboxPath}`;
  const isProduction = kind === 'PRODUCTION_DECISION';
  let sentAny = false;

  for (const email of recipients) {
    const name = recipientName || (await lookupUserNameByEmail(email)) || 'Mustafa';
    const html = buildApprovalWorkflowEmailHTML({
      badge: isProduction ? unitLabel.toLocaleUpperCase('tr-TR') : 'SATIN ALMA',
      heading: isProduction
        ? 'Üst yönetim kararınız bekleniyor'
        : 'Üst yönetim onayınız bekleniyor',
      greeting: mailSayinBeyGreeting(name),
      intro: isProduction
        ? `<p style="margin:0;">${unitLabel}, ${mailStrong(
            requestTitle || 'Talep'
          )} kaydındaki tedarikçi tekliflerini onay kutunuza ekledi. Bugünkü bekleyen kararlara aşağıdaki bağlantıdan bakabilir, sırayla tedarikçi seçebilirsiniz.</p>`
        : `<p style="margin:0;">Satın Alma limit aşımı: ${mailStrong(
            escalatedByName || 'Satın Alma Birimi Yetkilisi'
          )}, ${mailStrong(
            requestTitle || 'Talep'
          )} kaydını size yönlendirdi. Bugünkü bekleyen onaylara aşağıdaki bağlantıdan bakabilir, sırayla karar verebilirsiniz.</p>`,
      facts: isProduction
        ? [
            { label: 'İsteyen', value: unitLabel, strong: true },
            { label: 'Yeni talep', value: requestTitle || '—', strong: true },
            { label: 'Teklif toplamı (TL)', value: totalText || '—', strong: true },
            { label: 'Kuyruktaki onay', value: String(pendingCount ?? 1), strong: true },
          ]
        : [
            { label: 'İsteyen', value: 'Satın Alma', strong: true },
            { label: 'Yeni talep', value: requestTitle || '—' },
            { label: 'Teklif toplamı (TL)', value: totalText || '—', strong: true },
            { label: 'Limit', value: limitText || '—' },
            { label: 'Aşım', value: exceedsText || '—', strong: true },
            { label: 'Kuyruktaki onay', value: String(pendingCount ?? 1), strong: true },
          ],
      note: `Aynı gün gelen tüm maillerdeki bağlantı aynı onay kutusunu açar. Giriş yapmanız gerekmez. Bu iletiye yanıt verirseniz ${
        replyToUser?.email ? `${unitLabel} birimine` : 'Satın Alma Birimi Yetkilisine'
      } ulaşır.`,
      actionUrl,
      actionLabel: 'Onay kutusunu aç',
      portalUrl,
      tone: 'warning',
    });

    const replyTo = replyToUser?.email
      ? formatNamedMailbox(replyToUser.name, replyToUser.email)
      : await resolveSatinAlmaManagerReplyTo();
    try {
      const result = await dispatchMail(
        {
          to: email,
          subject: mailSubject(
            isProduction ? 'Üst yönetim kararı' : 'Üst yönetim onayı',
            requestTitle || (isProduction ? 'Teklif kararı' : 'Limit aşımı'),
          ),
          html,
          ...replyToIfDistinct(replyTo, email),
          notify: false,
        },
        { channel: MAIL_CHANNEL.OVER_LIMIT, meta: replyTo ? { replyTo } : undefined },
      );
      if (!result.skipped) sentAny = true;
    } catch (err) {
      console.error(`❌ Limit aşımı e-postası gönderilemedi (${email}):`, err.message);
    }
  }

  if (sentAny) {
    console.log(`✉️  Limit aşımı onay kutusu gönderildi → ${recipients.join(', ')}`);
  } else {
    console.log(`✉️  Limit aşımı onay kutusu atlandı (kanal kapalı) → ${recipients.join(', ')}`);
  }
  return sentAny;
};

/**
 * Onay akışı adımlarını ilgili kullanıcılara duyurur (yetkili onayı, limit aşımı, üst yönetim kararı…).
 * Gönderim başarısız olsa bile akışı kesmemek için hata fırlatmaz; sonucu boolean döner.
 */
const splitCc = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((x) => String(x ?? '').trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

export const sendApprovalWorkflowEmail = async ({
  to,
  subject,
  badge,
  heading,
  intro,
  facts = [],
  note,
  detailBlocks = [],
  extraHtml = '',
  actionPath,
  actionLabel,
  tone = 'neutral',
  channel = null,
  greetingStyle = 'sayin',
  recipientName = null,
  replyTo: replyToOverride = null,
  teamCc = false,
  cc = null,
}) => {
  let recipients = (Array.isArray(to) ? to : [to])
    .map((e) => String(e ?? '').trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (!recipients.length && teamCc) {
    const { getSatinAlmaTeamEmails } = await import('./mail-settings.service.js');
    recipients = (await getSatinAlmaTeamEmails()).slice(0, 1);
  }
  if (!recipients.length) return false;

  const portalUrl = getFrontendBaseUrl();
  const actionUrl = actionPath ? `${portalUrl}${actionPath}` : null;
  const toExecutive = channel === MAIL_CHANNEL.OVER_LIMIT;
  const replyTo =
    replyToOverride || (toExecutive ? await resolveSatinAlmaManagerReplyTo() : null);
  let sentAny = false;

  for (const [idx, email] of recipients.entries()) {
    const name = recipientName || (await lookupUserNameByEmail(email));
    const greeting =
      greetingStyle === 'bey'
        ? mailSayinBeyGreeting(name || 'Mustafa')
        : mailSayinGreeting(name);
  const html = buildApprovalWorkflowEmailHTML({
    badge,
    heading,
      greeting,
    intro,
    facts,
    note:
      note ||
      (toExecutive
        ? 'Bu iletiye yanıt verirseniz Satın Alma Birimi Yetkilisine ulaşır.'
        : undefined),
      detailBlocks,
      extraHtml,
    actionUrl,
    actionLabel,
    portalUrl,
    tone,
  });

  try {
      const result = await dispatchMail(
        {
          to: email,
      subject,
      html,
          ...replyToIfDistinct(replyTo, email),
          ...(idx === 0
            ? {
                ...(splitCc(cc).length ? { cc: splitCc(cc) } : {}),
                ...(teamCc ? { teamCc: true, teamCcExclude: recipients } : {}),
              }
            : {}),
        },
        { channel: channel || MAIL_CHANNEL.APPROVAL, meta: replyTo ? { replyTo } : undefined },
      );
      if (!result.skipped) sentAny = true;
  } catch (err) {
      console.error(`❌ Onay akışı e-postası gönderilemedi (${email}):`, err.message);
    }
  }

  return sentAny;
};

/* ─── Tedarikçiye teklif onayı (satın alma onayı sonrası) ─────────────────── */

const vendorMoney = (amount, currency) => {
  if (amount == null || !Number.isFinite(Number(amount))) return '—';
  const symbol = ({ TRY: '₺', USD: '$', EUR: '€', CHF: 'CHF' })[currency] || currency || '';
  return `${symbol} ${Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** İç not, onaycı notu, limit ve diğer cariler bu maile girmez; yalnız carinin kendi onaylanan kalemleri. */
const buildVendorApprovedEmailHTML = ({ vendorName, request, items, approvedAt, portalUrl, approverName }) => {
  const rows = (items || [])
    .map((item, i) => {
      const disc = Number(item.discountRate) > 0 ? `<div style="font-size:11px;color:#64748b;">isk. %${escapeHtml(String(item.discountRate))}</div>` : '';
      return `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'}">
        <td style="padding:10px 12px;font-size:12px;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;">${i + 1}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1e293b;font-weight:700;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.productName || '—')}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:center;font-weight:700;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(String(item.quantity ?? ''))} ${escapeHtml(item.unit || 'Adet')}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(vendorMoney(item.price, item.currency))}${disc}</td>
        <td style="padding:10px 12px;font-size:13px;color:#1e293b;text-align:right;font-weight:800;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(vendorMoney(item.lineTotal, item.currency))}</td>
      </tr>`;
    })
    .join('');
  const th = (label, align = 'left') =>
    `<th style="padding:10px 12px;text-align:${align};color:#D9B625;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${label}</th>`;
  const titleSafe = request?.title || 'Fiyat teklifi';
  const dateText = formatTrDate(approvedAt || new Date());
  const approver = String(approverName || '').trim();
  const approvalSentence = approver
    ? `${mailStrong(titleSafe)} kapsamında ilettiğiniz fiyat teklifi, ${mailStrong(approver)} tarafından aşağıdaki kalemler için ${escapeHtml(dateText)} tarihinde firmamızca onaylanmıştır.`
    : `${mailStrong(titleSafe)} kapsamında ilettiğiniz fiyat teklifi, aşağıdaki kalemler için ${escapeHtml(dateText)} tarihinde firmamızca onaylanmıştır.`;

  return buildPortalEmailHTML({
    kicker: 'Teklif onayı',
    heading: 'Teklifiniz onaylandı',
    greeting: `Sayın ${String(vendorName || 'Tedarikçi').trim()} yetkilisi,`,
    bodyHtml: `<p style="margin:0;">${approvalSentence}</p>
<p style="margin:14px 0 0;">Sipariş, teslimat ve faturalandırma detayları için Satın Alma birimimiz sizinle iletişime geçecektir.</p>`,
    extraHtml: `<tr>
            <td style="padding:24px 20px 8px;">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin:0 8px 12px;">Onaylanan kalemler (${(items || []).length})</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <thead><tr style="background:#252b31;">${th('#', 'center')}${th('Ürün')}${th('Miktar', 'center')}${th('Birim fiyat', 'right')}${th('Tutar', 'right')}</tr></thead>
                <tbody>${rows || '<tr><td colspan="5" style="padding:16px;font-size:13px;color:#94a3b8;text-align:center;">Kalem yok.</td></tr>'}</tbody>
              </table>
              <p style="margin:10px 8px 0;font-size:11px;color:#94a3b8;line-height:1.5;">Fiyatlar teklifinizde belirttiğiniz koşullar (KDV, vade, nakliye) geçerli olmak üzere gösterilmiştir.</p>
            </td>
          </tr>`,
    portalUrl,
  });
};

/**
 * Onaylanan cariye bilgilendirme. To: carinin tüm bildirim adresleri; CC: satın alma ekibi.
 * Token / teklif bağlantısı içermez.
 */
export const sendVendorApprovedEmail = async ({ vendor, request, items, approvedAt, actor = null, approverName = null }) => {
  const recipients = resolveVendorNotificationEmails(vendor);
  if (!recipients.length) return false;
  const html = buildVendorApprovedEmailHTML({
    vendorName: vendor.name,
    request,
    items,
    approvedAt,
    approverName: approverName || actor?.name,
    portalUrl: getFrontendBaseUrl(),
  });
  const replyTo = resolveVendorQuoteReplyTo({ actor, request });
  try {
    const result = await dispatchMail(
      {
        to: recipients,
        subject: mailSubject('Teklifiniz onaylandı', request?.title),
        html,
        ...(replyTo ? { replyTo } : {}),
        teamCc: true,
        teamCcExclude: recipients,
        notify: {
          message: `"${request?.title || 'Talep'}" için ${vendor?.name || 'tedarikçi'} firmasına onay maili gönderildi.`,
          link: request?.id ? `/procurement/${request.id}` : null,
        },
      },
      { channel: MAIL_CHANNEL.VENDOR_APPROVED, meta: replyTo ? { replyTo } : undefined },
    );
    return !result.skipped;
  } catch (err) {
    console.error(`❌ Teklif onayı maili gönderilemedi (${vendor?.name}):`, err.message);
    return false;
  }
};

/**
 * ADMIN: Tüm mail şablonlarını örnek veriyle mail_outbox'a PREVIEW yazar.
 * SMTP'ye gitmez; kimseye gerçek mail çıkmaz.
 */
export const seedMailTemplatePreviews = async ({ viewerEmail } = {}) => {
  const portalUrl = getFrontendBaseUrl();
  const to = String(viewerEmail || 'onizleme@yerel.test').trim() || 'onizleme@yerel.test';
  const sampleLink = `${portalUrl}/procurement/ornek-talep-id`;

  // Eski önizlemeler eski şablonu gösterir; her eklemede güncel HTML yazılsın.
  await prisma.mailOutbox.deleteMany({
    where: { OR: [{ status: 'PREVIEW' }, { skipReason: 'preview_only' }] },
  });

  const writePreview = async ({ channel, subject, html, text, meta: extraMeta, to: previewTo, cc }) => {
    const plainSnippet = htmlToPlainText(html || text || '').slice(0, 280) || null;
    await prisma.mailOutbox.create({
      data: {
        channel: channel || 'system',
        status: 'PREVIEW',
        skipReason: 'preview_only',
        to: previewTo || to,
        cc:
          (cc || '')
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x && x.toLowerCase() !== String(previewTo || to).toLowerCase())
            .join(', ') || null,
        subject: String(subject || 'Önizleme').slice(0, 500),
        htmlBody: html != null ? String(html) : null,
        textBody: text != null ? String(text) : null,
        plainSnippet,
        meta: { preview: true, ...(extraMeta || {}) },
      },
    });
  };

  const viewerName = (await lookupUserNameByEmail(to)) || 'Ahmet Yılmaz';
  const { getSatinAlmaTeamEmails } = await import('./mail-settings.service.js');
  const { buildVendorApprovedSmsText } = await import('../sms/sms.service.js');
  const teamCcText = (await getSatinAlmaTeamEmails()).join(', ') || null;
  const vendorApprovedItems = [
    { productName: 'Ürün A', quantity: 10, unit: 'Adet', price: 1250, currency: 'TRY', discountRate: 5, lineTotal: 11875 },
    { productName: 'Ürün B', quantity: 2, unit: 'Kutu', price: 89.5, currency: 'USD', discountRate: 0, lineTotal: 179 },
  ];
  const samples = [
    {
      channel: MAIL_CHANNEL.VENDOR_APPROVED,
      subject: mailSubject('Teklifiniz onaylandı', 'Örnek tedarikçi talebi'),
      to: 'teklif@ornek-tedarik.com',
      cc: teamCcText,
      html: buildVendorApprovedEmailHTML({
        vendorName: 'Örnek Tedarik A.Ş.',
        request: { title: 'Örnek tedarikçi talebi' },
        items: vendorApprovedItems,
        approvedAt: new Date(),
        approverName: viewerName,
        portalUrl,
      }),
      meta: { replyTo: formatNamedMailbox(viewerName, to) || to },
    },
    {
      channel: 'sms',
      subject: 'SMS — Teklif onayı (tedarikçiye)',
      to: '0532 000 00 00 (tedarikçi yetkilisi)',
      text: buildVendorApprovedSmsText({ title: 'Örnek tedarikçi talebi', itemCount: vendorApprovedItems.length }),
    },
    {
      channel: 'approval',
      subject: mailSubject('Üst yönetim onayına gönderildi', 'Örnek yüksek tutarlı talep'),
      cc: teamCcText,
      html: buildApprovalWorkflowEmailHTML({
        badge: 'Üst yönetim onayı bekleniyor',
        heading: 'Limit aşan teklif üst yönetime iletildi',
        greeting: mailSayinGreeting(viewerName),
        intro: `<p style="margin:0;">${mailStrong('Mahmut Örnek')}, ${mailStrong(
          'Örnek yüksek tutarlı talep',
        )} talebindeki teklif toplamı onay limitini aştığı için kaydı üst yönetim onayına gönderdi.</p>`,
        facts: [
          { label: 'Talep', value: 'Örnek yüksek tutarlı talep' },
          { label: 'Gönderen', value: 'Mahmut Örnek' },
          { label: 'Teklif toplamı (TL karşılığı)', value: '312.000,00 TL', strong: true },
          { label: 'Onay limiti', value: '250.000,00 TL' },
        ],
        actionUrl: sampleLink,
        actionLabel: 'Talebi aç',
        portalUrl,
        tone: 'warning',
      }),
    },
    {
      channel: 'smtp_test',
      subject: mailSubject('SMTP doğrulama'),
      html: buildPortalEmailHTML({
        kicker: 'SMTP doğrulama',
        heading: 'Test iletisi',
        greeting: mailSayinGreeting(viewerName),
        bodyHtml: '<p style="margin:0;">Bu bir test iletisidir. SMTP ayarlarınız çalışıyor.</p>',
        portalUrl,
      }),
    },
    {
      channel: 'otp',
      subject: mailSubject('Doğrulama kodu'),
      html: buildOtpEmailHTML({
        toName: 'ECATAR',
        code: '123456',
        loginUrl: `${portalUrl}/login?otp=1`,
        portalUrl,
      }),
    },
    (() => {
      const mail = buildDepartmentRequestMail({
        title: 'Bilgisayar şarj aleti',
        requesterName: 'Örnek Personel',
        requesterEmail: 'ornek@ugurpromilling.com',
        requesterUnit: 'PROJE',
        description: 'Merhaba,\n\nX üründen Y tane lazım.',
        link: `${portalUrl}/internal-requests/ornek`,
        recipientName: 'Mahmut Örnek',
      });
      return { channel: 'department', subject: mail.subject, html: mail.html, text: mail.text };
    })(),
    (() => {
      const mail = buildInternalRequestAssignedMail({
        title: 'Bilgisayar şarj aleti',
        assignedByName: 'Mahmut Örnek',
        requesterName: 'Örnek Personel',
        requesterUnit: 'PROJE',
        reviewNote: 'Tamam, teklif toplayın.',
        link: `${portalUrl}/internal-requests/ornek`,
        recipientName: 'Gülnur Örnek',
      });
      return { channel: 'department', subject: mail.subject, html: mail.html, text: mail.text };
    })(),
    ...['SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'SPLIT'].map((kind) => {
      const mail = buildRequesterStatusMail({
        kind,
        title: 'Bilgisayar şarj aleti',
        requesterUnit: 'PROJE',
        actorName: 'Mahmut Örnek',
        actorLabel: kind === 'REJECTED' ? 'Reddeden' : 'Onaylayan',
        note:
          kind === 'REJECTED'
            ? 'Örnek gerekçe: depoda mevcut; önce oradan talep edin.'
            : kind === 'APPROVED'
              ? 'Tamam, teklif toplayın.'
              : null,
        itemNames: kind === 'SPLIT' ? 'Boya, Sac levha' : null,
        rfqTitle: kind === 'SPLIT' ? 'Boya alımı' : null,
        link: `${portalUrl}/taleplerim/ornek`,
        recipientName: viewerName,
      });
      return {
        channel: 'department',
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      };
    }),
    {
      channel: 'chat',
      subject: mailSubject('Yeni mesajınız var', 'Örnek talep başlığı'),
      html: buildPortalEmailHTML({
        kicker: 'Talep yazışması',
        heading: 'Yeni mesajınız var',
        greeting: mailSayinGreeting(viewerName),
        bodyHtml: `<p style="margin:0;">${mailStrong(
          'Örnek talep başlığı'
        )} isimli tedarik talebi hakkında yeni bir mesajınız var; görüntülemek için portala girin.</p>`,
        ctaLabel: 'Yazışmayı aç',
        ctaUrl: sampleLink,
        portalUrl,
      }),
    },
    {
      channel: 'vendorQuote',
      subject: mailSubject('Fiyat teklif talebi', 'Örnek tedarikçi talebi'),
      html: buildProcurementEmailHTML({
        vendor: { name: 'Örnek Tedarik A.Ş.' },
        request: {
          title: 'Örnek tedarikçi talebi',
          description: 'Merhaba,<div><br></div><div>Teknik şartname notu.</div>',
        },
        items: [
          { productName: 'Ürün A', quantity: 10, unit: 'Adet' },
          { productName: 'Ürün B', quantity: 2, unit: 'Kutu' },
        ],
        portalUrl,
        quoteToken: 'ornek-token',
        letterhead: { quoteDate: new Date(), quoteDeadline: new Date(Date.now() + 7 * 864e5) },
      }),
      meta: {
        replyTo: formatNamedMailbox(viewerName, to) || to,
      },
    },
    {
      channel: 'quoteReceived',
      subject: mailSubject('Yeni teklif', 'Örnek talep'),
      html: buildQuoteNotificationHTML({
        vendorName: 'Örnek Tedarik A.Ş.',
        request: { id: 'ornek-talep-id', title: 'Örnek talep' },
        quotedItems: [
          {
            productName: 'Ürün A',
            quantity: 10,
            unit: 'Adet',
            price: 1250,
            currency: 'TRY',
            notes: null,
            quoteNotes: 'Stokta mevcut',
          },
          {
            productName: 'Ürün B',
            quantity: 2,
            unit: 'Kutu',
            price: 89.5,
            currency: 'USD',
            notes: 'Kalem notu',
            quoteNotes: null,
          },
        ],
        portalUrl,
        greeting: mailSayinGreeting(viewerName),
        isUpdate: false,
      }),
    },
    {
      channel: 'quoteReceived',
      subject: mailSubject('Teklif güncellendi', 'Örnek talep'),
      html: buildQuoteNotificationHTML({
        vendorName: 'Örnek Tedarik A.Ş.',
        request: { id: 'ornek-talep-id', title: 'Örnek talep' },
        quotedItems: [
          {
            productName: 'Ürün A',
            quantity: 10,
            unit: 'Adet',
            oldPrice: 1250,
            oldCurrency: 'TRY',
            price: 1180,
            currency: 'TRY',
            notes: null,
            quoteNotes: 'Fiyat revize edildi',
          },
        ],
        portalUrl,
        greeting: mailSayinGreeting(viewerName),
        isUpdate: true,
      }),
    },
    {
      channel: 'quoteReceived',
      subject: mailSubject('Tüm teklifler tamamlandı', 'Örnek talep'),
      html: buildAllQuotesCompleteHTML({
        request: { id: 'ornek-talep-id', title: 'Örnek talep' },
        vendorNames: ['Örnek Tedarik A.Ş.', 'İkinci Firma Ltd.', 'Üçüncü Sanayi'],
        portalUrl,
        greeting: mailSayinGreeting(viewerName),
      }),
    },
    {
      channel: 'overLimit',
      subject: mailSubject('Üst yönetim kararı', 'Örnek üretim talebi'),
      html: buildApprovalWorkflowEmailHTML({
        badge: 'ÜRETİM PLANLAMA',
        heading: 'Üst yönetim kararınız bekleniyor',
        greeting: mailSayinBeyGreeting('Mustafa'),
        intro: `<p style="margin:0;">Üretim Planlama, ${mailStrong(
          'Örnek üretim talebi'
        )} kaydındaki tedarikçi tekliflerini onay kutunuza ekledi. Bugünkü bekleyen kararlara aşağıdaki bağlantıdan bakabilir, sırayla tedarikçi seçebilirsiniz.</p>`,
        facts: [
          { label: 'İsteyen', value: 'Üretim Planlama', strong: true },
          { label: 'Yeni talep', value: 'Örnek üretim talebi', strong: true },
          { label: 'Teklif toplamı (TL)', value: '84.500,00 TL', strong: true },
          { label: 'Kuyruktaki onay', value: '2', strong: true },
        ],
        note: 'Aynı gün gelen tüm maillerdeki bağlantı aynı onay kutusunu açar. Giriş yapmanız gerekmez.',
        actionUrl: `${portalUrl}/executive-approval/ornek`,
        actionLabel: 'Onay kutusunu aç',
        portalUrl,
        tone: 'warning',
      }),
    },
    {
      channel: 'warehouse',
      subject: mailSubject('Depo teslim listesi', 'Örnek talep'),
      html: buildWarehouseDispatchEmailHTML({
        request: {
          title: 'Örnek talep — fotolu',
          requesterName: 'Ayşe Yılmaz',
          requesterUnit: 'Bakım',
        },
        items: [
          { productName: 'TEST', quantity: 1, unit: 'Adet', vendorName: 'Örnek Tedarik A.Ş.' },
          { productName: 'TEST2', quantity: 1, unit: 'Adet', vendorName: 'Ugur Promilling' },
        ],
        note: 'Depo için kısa not.',
        senderName: 'Ahmet Faruk Akseli',
        portalUrl,
        greeting: mailSayinGreeting('Ali Demir'),
      }),
    },
    {
      channel: 'approval',
      subject: mailSubject('Onaylandı', 'Örnek talep'),
      html: buildApprovalWorkflowEmailHTML({
        badge: 'Yetkili onayı verildi',
        heading: 'Teklif listesi onaylandı',
        greeting: mailSayinGreeting('Ahmet Faruk Akseli'),
        intro: `<p style="margin:0;">${mailStrong('Mahmut Örnek')}, ${mailStrong(
          'Örnek talep'
        )} talebindeki teklif listesini onayladı. Sipariş süreci satın alma birimine aktarıldı.</p>`,
        facts: [
          { label: 'Talep', value: 'Örnek talep' },
          { label: 'Onaylayan', value: 'Mahmut Örnek' },
          { label: 'Onaylanan tutar (TL karşılığı)', value: '12.450,00 TL', strong: true },
        ],
        actionUrl: sampleLink,
        actionLabel: 'Talebi aç',
        portalUrl,
        tone: 'success',
      }),
    },
    {
      channel: 'overLimit',
      subject: mailSubject('Üst yönetim onayı', 'Örnek yüksek tutarlı talep'),
      html: buildApprovalWorkflowEmailHTML({
        badge: 'SATIN ALMA',
        heading: 'Üst yönetim onayınız bekleniyor',
        greeting: mailSayinBeyGreeting('Mustafa'),
        intro: `<p style="margin:0;">Satın Alma limit aşımı: ${mailStrong('Mahmut Örnek')}, ${mailStrong(
          'Örnek yüksek tutarlı talep'
        )} kaydını size yönlendirdi. Bugünkü bekleyen onaylara aşağıdaki bağlantıdan bakabilir, sırayla karar verebilirsiniz.</p>`,
        facts: [
          { label: 'İsteyen', value: 'Satın Alma', strong: true },
          { label: 'Yeni talep', value: 'Örnek yüksek tutarlı talep' },
          { label: 'Teklif toplamı (TL)', value: '312.000,00 TL', strong: true },
          { label: 'Limit', value: '250.000,00 TL' },
          { label: 'Aşım', value: '62.000,00 TL', strong: true },
          { label: 'Kuyruktaki onay', value: '1', strong: true },
        ],
        note: 'Aynı gün gelen tüm maillerdeki bağlantı aynı onay kutusunu açar.',
        actionUrl: `${portalUrl}/executive-approval/ornek`,
        actionLabel: 'Onay kutusunu aç',
        portalUrl,
        tone: 'warning',
      }),
    },
    {
      channel: 'overLimit',
      subject: mailSubject('Limit altında onay', 'Örnek talep'),
      cc: [teamCcText, 'mcinar@ugurpromilling.com', 'gyanik@ugurpromilling.com'].filter(Boolean).join(', '),
      html: buildApprovalWorkflowEmailHTML({
        badge: 'Bilgilendirme',
        heading: 'Yetkili limit altında onay verdi',
        greeting: mailSayinBeyGreeting('Mustafa'),
        intro: `<p style="margin:0;">${mailStrong('Mahmut Örnek')}, ${mailStrong(
          'Örnek talep'
        )} talebini onay limitinin altında onayladı. Ek onayınız gerekmiyor; bu ileti yalnızca bilgilendirme içindir.</p>`,
        facts: [
          { label: 'Talep', value: 'Örnek talep' },
          { label: 'Onaylayan', value: 'Mahmut Örnek' },
          { label: 'Birim', value: 'PROJE' },
          { label: 'Onaylanan tutar (TL)', value: '48.200,00 TL', strong: true },
          { label: 'Onay limiti', value: '250.000,00 TL' },
        ],
        detailBlocks: [
          { title: 'Birim notu', body: 'Acil ihtiyaç; mevcut stok yetersiz.' },
          { title: 'Yetkili notu', body: 'En uygun cari seçildi, vade uygun.' },
        ],
        extraHtml: `<tr>
    <td style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Alınan teklifler</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;">
        <thead><tr style="background:#252b31;">
          <th style="padding:10px 12px;font-size:10px;color:#D9B625;text-align:left;">Tedarikçi</th>
          <th style="padding:10px 12px;font-size:10px;color:#D9B625;text-align:right;">Tutar (TL)</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:9px 12px;font-size:13px;">Örnek Tedarik A.Ş.</td><td style="padding:9px 12px;font-size:13px;font-weight:700;text-align:right;">48.200,00 TL</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:9px 12px;font-size:13px;">İkinci Firma Ltd.</td><td style="padding:9px 12px;font-size:13px;font-weight:700;text-align:right;">51.100,00 TL</td></tr>
        </tbody>
      </table>
    </td>
  </tr>`,
        actionUrl: sampleLink,
        actionLabel: 'Talebi incele',
        portalUrl,
        tone: 'success',
      }),
    },
  ];

  for (const s of samples) {
    await writePreview(s);
  }

  return { count: samples.length };
};
