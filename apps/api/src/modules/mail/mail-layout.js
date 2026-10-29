import { getFrontendBaseUrl } from '../../config/frontendUrl.js';
import { MAIL_LOGO_SRC } from './mail-logo.js';

export const MAIL_BRAND = 'Uğur Promilling';
export const MAIL_PRODUCT = 'Tedarik Portalı';
export const MAIL_SUFFIX = `${MAIL_BRAND} - ${MAIL_PRODUCT}`;

const MAIL_FOOTER_UP_URL = 'https://www.ugurpromilling.com';
const MAIL_SOCIAL = [
  { label: 'Facebook', href: 'https://www.facebook.com/p/U%C4%9Fur-Promilling-100063512081179/' },
  { label: 'Instagram', href: 'https://www.instagram.com/ugurpromilling' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/ugurpromilling' },
  { label: 'X', href: 'https://twitter.com/ugurpromilling' },
  { label: 'YouTube', href: 'https://www.youtube.com/channel/UCoDEtWN7SE8j8ZSys1ZI5gg' },
];

const mailSocialLinksHtml = () =>
  MAIL_SOCIAL.map(
    (s, i) =>
      `${i ? '<span style="color:#cbd5e1;padding:0 6px;">·</span>' : ''}<a href="${s.href}" style="color:#475569;text-decoration:none;font-weight:600;">${s.label}</a>`,
  ).join('');

/** Giden maillerin ortak alt bilgisi — adres, hat, sosyal. */
export const mailFooterHtml = (year = new Date().getFullYear()) => `<tr>
            <td style="padding:18px 28px 24px;text-align:center;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.55;">Bu e-posta tedarik süreci kapsamında otomatik gönderilmiştir.</p>
              <p style="margin:14px 0 0;font-size:12px;color:#334155;line-height:1.6;">${mailSocialLinksHtml()}</p>
              <p style="margin:12px 0 0;font-size:12px;color:#475569;line-height:1.65;">Pınarçay OSB, 7. Cd, No:27-31/1 Çorum / Türkiye</p>
              <p style="margin:4px 0 0;font-size:12px;color:#475569;line-height:1.65;">
                <a href="tel:+903642220444" style="color:#475569;text-decoration:none;">+90 364 222 0 444</a>
                <span style="color:#cbd5e1;padding:0 6px;">·</span>
                <a href="mailto:info@ugurpromilling.com" style="color:#475569;text-decoration:none;">info@ugurpromilling.com</a>
                <span style="color:#cbd5e1;padding:0 6px;">·</span>
                <a href="${MAIL_FOOTER_UP_URL}" style="color:#475569;text-decoration:underline;">www.ugurpromilling.com</a>
              </p>
              <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;">© ${year} Uğur Promilling. Tüm hakları saklıdır.</p>
            </td>
          </tr>`;

/** "Sayın Ali Veli," — portal hesabı olan alıcılar. */
export const mailSayinGreeting = (name) => {
  const n = String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
  return n ? `Sayın ${n},` : 'Sayın Yetkili,';
};

/** "Sayın Mustafa Bey," — hesap olmadan giden üst yönetim / karar mailleri. */
export const mailSayinBeyGreeting = (name) => {
  const n = String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!n) return 'Sayın Yetkili,';
  if (/\b(Bey|Hanım)$/i.test(n)) return `Sayın ${n},`;
  const first = n.split(/\s+/)[0];
  return `Sayın ${first} Bey,`;
};

/** Giden mailler: "Talep başlığı // Uğur Promilling - Tedarik Portalı". Başlık yoksa yalnız konu. */
export const mailSubject = (topic, detail) => {
  const cleanTopic = String(topic || MAIL_PRODUCT).replace(/\s+/g, ' ').trim();
  const cleanDetail = detail != null ? String(detail).replace(/\s+/g, ' ').trim() : '';
  const head = cleanDetail || cleanTopic;
  return `${head} // ${MAIL_SUFFIX}`;
};

export const escapeHtml = (s) => {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/** Mail gövdesinde öne çıkan isim / talep / firma. */
export const mailStrong = (s) => `<strong>${escapeHtml(s)}</strong>`;

/**
 * Rich-text / HTML açıklamayı mailler için düz metne çevirir.
 * Etiketler, gömülü img ve [[img:…]] işaretçileri gösterilmez.
 */
export const htmlToPlainText = (input) => {
  if (input == null || input === '') return '';
  let s = String(input);
  s = s.replace(/\[\[img:[^\]]+\]\]/gi, '');
  s = s.replace(/<img\b[^>]*>/gi, '');
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(
    /<\s*\/\s*(p|div|li|h[1-6]|tr|blockquote|table|thead|tbody|section|article)\s*>/gi,
    '\n'
  );
  s = s.replace(
    /<\s*(p|div|li|h[1-6]|tr|blockquote|table|thead|tbody|section|article)(\s[^>]*)?>/gi,
    '\n'
  );
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
  s = s
    .replace(/[ \t\u00a0]+\n/g, '\n')
    .replace(/\n[ \t\u00a0]+/g, '\n')
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
};

/** htmlToPlainText + escapeHtml — mail gövdesine güvenli düz metin. */
export const escapePlainTextHtml = (input) => escapeHtml(htmlToPlainText(input));

/**
 * Tedarikçi / karar daveti mailleriyle aynı üst şerit ve kart iskeleti.
 */
export const buildPortalEmailHTML = ({
  kicker,
  heading,
  greeting = 'Sayın Yetkili,',
  bodyHtml,
  extraHtml = '',
  ctaLabel,
  ctaUrl,
  portalUrl,
  preheader = '',
}) => {
  const origin = (portalUrl || getFrontendBaseUrl()).replace(/\/$/, '');
  const year = new Date().getFullYear();
  const kickerSafe = escapeHtml(kicker || MAIL_PRODUCT);
  const headingSafe = escapeHtml(heading || '');
  const hrefSafe = ctaUrl ? escapeHtml(ctaUrl) : '';
  const urlText = hrefSafe;
  const preheaderSafe = escapeHtml(preheader || '');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${kickerSafe}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#ebebeb;">
  ${
    preheaderSafe
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheaderSafe}</div>`
      : ''
  }

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;">
    <tr>
      <td style="border-top:3px solid #D9B625;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:20px 24px 16px;vertical-align:middle;width:42%;">
              <img src="${MAIL_LOGO_SRC}" alt="Uğur Promilling" style="max-height:72px;width:auto;max-width:100%;display:block;" />
            </td>
            <td style="padding:20px 24px 16px;vertical-align:middle;text-align:right;">
              <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#D9B625;">${kickerSafe}</div>
              ${headingSafe ? `<div style="font-size:15px;font-weight:600;color:#e2e8f0;margin-top:8px;line-height:1.35;max-width:280px;margin-left:auto;">${headingSafe}</div>` : ''}
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
              <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:12px;">${escapeHtml(greeting)}</div>
              <div style="font-size:15px;color:#475569;line-height:1.75;">${bodyHtml}</div>
            </td>
          </tr>

          ${extraHtml}

          ${
            ctaLabel && ctaUrl
              ? `<tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#252b31;border-radius:10px;border:1px solid #1e293b;border-left:4px solid #D9B625;">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <div style="font-size:13px;font-weight:700;color:#D9B625;margin-bottom:8px;">Tedarik Portalı Erişimi</div>
                    <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;line-height:1.55;">
                      Düğme görünmüyorsa aşağıdaki adresi tarayıcıya kopyalayabilirsiniz.
                    </div>
                    <a href="${hrefSafe}"
                      style="display:inline-block;background:#D9B625;color:#1e293b;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:8px;">
                      ${escapeHtml(ctaLabel)}
                    </a>
                    <div style="margin-top:22px;padding:12px 14px;background:#1a1f24;border-radius:6px;text-align:left;word-break:break-all;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Bağlantı</div>
                      <span style="font-size:12px;color:#cbd5e1;font-family:Consolas,'Courier New',monospace;">${urlText}</span>
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
 * Tedarikçi teklif mailiyle aynı düzen; koyu kutuda 6 haneli kod.
 */
export const buildOtpEmailHTML = ({ toName, code, portalUrl, loginUrl, headline, introHtml }) => {
  const origin = (portalUrl || getFrontendBaseUrl()).replace(/\/$/, '');
  const year = new Date().getFullYear();
  const nameSafe = escapeHtml(toName || 'Yetkili');
  const codeSafe = escapeHtml(String(code || '').padStart(6, '0').slice(0, 6));
  const hrefSafe = loginUrl ? escapeHtml(loginUrl) : '';
  const title = headline || 'Giriş doğrulama kodu';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Giriş doğrulama kodu</title>
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
              <div style="font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#D9B625;">Tedarik Portalı</div>
              <div style="font-size:17px;font-weight:700;color:#ffffff;margin-top:6px;line-height:1.3;">Giriş doğrulama kodu</div>
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
              <div style="font-size:20px;font-weight:700;color:#1e293b;margin-bottom:14px;">Sayın ${nameSafe},</div>
              ${
                introHtml ||
                `<p style="margin:0;font-size:15px;color:#475569;line-height:1.75;">
                Portala giriş için doğrulama kodunuz hazır. Aşağıdaki 6 haneli kodu giriş ekranına yazabilir${
                  hrefSafe
                    ? '; isterseniz tek kullanımlık bağlantıyla da doğrudan giriş yapabilirsiniz'
                    : ''
                }. Kod${hrefSafe ? ' ve bağlantı' : ''} <strong>10 dakika</strong> geçerlidir.
              </p>
              <p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">
                Bu isteği siz başlatmadıysanız iletiyi yok saymanız yeterli.
              </p>`
              }
            </td>
          </tr>

          <tr>
            <td style="padding:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#252b31;border-radius:10px;border:1px solid #1e293b;border-left:4px solid #D9B625;">
                <tr>
                  <td style="padding:28px 20px;text-align:center;">
                    <div style="font-size:14px;font-weight:700;color:#D9B625;margin-bottom:18px;">Doğrulama kodu</div>
                    <div style="font-size:36px;letter-spacing:14px;font-weight:800;color:#D9B625;font-family:Consolas,'Courier New',monospace;line-height:1.2;padding-left:14px;">${codeSafe}</div>
                    ${
                      hrefSafe
                        ? `<a href="${hrefSafe}"
                      style="display:inline-block;margin-top:24px;background:#D9B625;color:#1e293b;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:8px;">
                      Giriş yap
                    </a>
                    <div style="margin-top:22px;padding:12px 14px;background:#1a1f24;border-radius:6px;text-align:left;word-break:break-all;">
                      <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Bağlantı</div>
                      <span style="font-size:12px;color:#D9B625;font-family:Consolas,'Courier New',monospace;">${hrefSafe}</span>
                    </div>`
                        : ''
                    }
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

/** Şifre sıfırlama kodu: OTP postasının aynı kutusu, giriş bağlantısı yok. */
export const buildPasswordResetEmailHTML = ({ toName, code, portalUrl }) =>
  buildOtpEmailHTML({
    toName,
    code,
    portalUrl,
    headline: 'Şifre sıfırlama kodu',
    introHtml: `<p style="margin:0;font-size:15px;color:#475569;line-height:1.75;">
                Hesabınız için yeni şifre oluşturma kodunuz hazır. Aşağıdaki 6 haneli kodu giriş ekranındaki şifre sıfırlama adımına yazın. Kod <strong>10 dakika</strong> geçerlidir.
              </p>
              <p style="margin:14px 0 0;font-size:15px;color:#475569;line-height:1.75;">
                Bu isteği siz başlatmadıysanız iletiyi yok saymanız yeterli. Şifreniz değişmez.
              </p>`,
  });
