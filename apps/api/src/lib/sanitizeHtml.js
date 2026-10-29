/**
 * Minimal allowlist HTML sanitize (server). No new dependency.
 * Script / event handlers / javascript: URLs stripped.
 */

const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'br',
  'p',
  'div',
  'span',
  'ul',
  'ol',
  'li',
  'a',
  'img',
]);

const stripTags = (html) => {
  let s = String(html || '');
  // Remove script/style blocks
  s = s.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?\s*>/gi, '');
  // Strip on* handlers
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // javascript: / data:text/html urls
  s = s.replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
  s = s.replace(/\s(href|src)\s*=\s*(["'])\s*data:text\/html[\s\S]*?\2/gi, ' $1="#"');
  // Drop disallowed tags (keep content)
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (full, tag) => {
    const t = String(tag || '').toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (t === 'a') {
      const href = /href\s*=\s*(["'])(.*?)\1/i.exec(full);
      const safe = href && /^(https?:|mailto:|#|\/)/i.test(href[2] || '') ? href[2] : '#';
      const isClose = /^<\s*\//.test(full);
      return isClose ? '</a>' : `<a href="${safe}" rel="noopener noreferrer" target="_blank">`;
    }
    if (t === 'img') {
      // Only keep local marker attrs used by richHtml; drop remote src unless data-local
      if (/data-local\s*=/i.test(full) || /\[\[img:/i.test(full)) return full;
      return '';
    }
    return full;
  });
  return s;
};

export const sanitizeRichHtml = (input) => {
  if (input == null) return input;
  const raw = String(input);
  if (!/[<>]/.test(raw)) return raw;
  return stripTags(raw);
};
