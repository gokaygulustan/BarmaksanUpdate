import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Nodemailer CID — HTML'de src="cid:…" ile aynı olmalı. */
export const MAIL_LOGO_CID = 'up-logo@ugurpromilling';
export const MAIL_LOGO_SRC = `cid:${MAIL_LOGO_CID}`;

const LOGO_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../web/public/logo.png',
);

let cached = undefined;

const loadAttachment = () => {
  if (cached !== undefined) return cached;
  try {
    cached = {
      filename: 'logo.png',
      content: fs.readFileSync(LOGO_PATH),
      cid: MAIL_LOGO_CID,
      contentType: 'image/png',
      contentDisposition: 'inline',
    };
  } catch (err) {
    console.warn('[mail] logo.png okunamadı, CID eklenmedi:', LOGO_PATH, err?.message || err);
    cached = null;
  }
  return cached;
};

/**
 * HTML'de /logo.png veya cid varsa logoyu MIME eki olarak bağlar.
 * Uzak URL'yi cid:'e çevirir; dosya yoksa orijinal seçenekleri döner.
 */
export const withMailLogo = (options) => {
  const html = options?.html;
  if (typeof html !== 'string' || !html) return options;
  const mentionsLogo = /\/logo\.png/i.test(html) || html.includes(`cid:${MAIL_LOGO_CID}`);
  if (!mentionsLogo) return options;
  const attachment = loadAttachment();
  if (!attachment) return options;

  const nextHtml = html.replace(/src=(["'])([^"']*\/logo\.png)\1/gi, `src="${MAIL_LOGO_SRC}"`);
  const attachments = Array.isArray(options.attachments) ? [...options.attachments] : [];
  if (!attachments.some((a) => a && a.cid === MAIL_LOGO_CID)) {
    attachments.push(attachment);
  }
  return { ...options, html: nextHtml, attachments };
};
