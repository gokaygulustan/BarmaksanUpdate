const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI']);
const HEADING = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const INLINE_KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U']);

export const INLINE_IMG_SPLIT = /(\[\[img:[A-Za-z0-9_-]+(?:\|\d+)?\]\])/g;
export const INLINE_IMG_TOKEN = /^\[\[img:([A-Za-z0-9_-]+)(?:\|(\d+))?\]\]$/;

export function inlineImgMarker(id: string, width?: number) {
  const w = width && width > 24 && width < 4000 ? Math.round(width) : 0;
  return w ? `[[img:${id}|${w}]]` : `[[img:${id}]]`;
}

export function readImgWidth(el: HTMLElement) {
  const data = parseInt(el.getAttribute('data-w') || '', 10);
  if (data > 24 && data < 4000) return data;
  const styleW = parseInt((el.getAttribute('style') || '').match(/width:\s*(\d+)/i)?.[1] || '', 10);
  if (styleW > 24 && styleW < 4000) return styleW;
  const attr = parseInt(el.getAttribute('width') || '', 10);
  if (attr > 24 && attr < 4000) return attr;
  return 0;
}

export function applyImgWidth(el: HTMLElement, width?: number) {
  const w = width && width > 24 && width < 4000 ? Math.round(width) : 0;
  if (!w) {
    el.removeAttribute('data-w');
    el.style.width = '';
    el.style.height = '';
    return;
  }
  el.setAttribute('data-w', String(w));
  el.style.width = `${w}px`;
  el.style.height = 'auto';
}

function flagsFrom(el: HTMLElement) {
  const style = (el.getAttribute('style') || '').toLowerCase();
  const tag = el.tagName;
  return {
    bold: tag === 'B' || tag === 'STRONG' || HEADING.has(tag) || /font-weight:\s*(bold|[6-9]00)/.test(style),
    italic: tag === 'I' || tag === 'EM' || /font-style:\s*italic/.test(style),
    underline: tag === 'U' || /text-decoration:[^;]*underline/.test(style),
  };
}

function wrapNode(doc: Document, node: Node, tag: string) {
  const el = doc.createElement(tag);
  node.parentNode?.insertBefore(el, node);
  el.appendChild(node);
  return el;
}

function unwrap(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function applyFlags(doc: Document, el: HTMLElement, flags: ReturnType<typeof flagsFrom>) {
  const skipB = INLINE_KEEP.has(el.tagName) && (el.tagName === 'B' || el.tagName === 'STRONG');
  const skipI = INLINE_KEEP.has(el.tagName) && (el.tagName === 'I' || el.tagName === 'EM');
  const skipU = el.tagName === 'U';
  for (const kid of Array.from(el.childNodes)) {
    let node: Node = kid;
    if (flags.underline && !skipU) node = wrapNode(doc, node, 'U');
    if (flags.italic && !skipI) node = wrapNode(doc, node, 'I');
    if (flags.bold && !skipB) node = wrapNode(doc, node, 'B');
  }
}

function cleanNode(doc: Document, node: Node, keepLocalImages: boolean) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName;

  if (tag === 'IMG') {
    const local = el.getAttribute('data-local') || el.getAttribute('data-att') || '';
    if (local && /^[A-Za-z0-9_-]+$/.test(local)) {
      const width = readImgWidth(el);
      if (keepLocalImages) {
        const src = el.getAttribute('src') || '';
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
        el.setAttribute('data-local', local);
        if (src) el.setAttribute('src', src);
        el.setAttribute('alt', '');
        applyImgWidth(el, width);
      } else {
        el.replaceWith(doc.createTextNode(inlineImgMarker(local, width)));
      }
    } else {
      el.remove();
    }
    return;
  }

  for (const child of Array.from(el.childNodes)) cleanNode(doc, child, keepLocalImages);

  if (tag === 'TR') {
    el.appendChild(doc.createElement('BR'));
  }

  const flags = flagsFrom(el);
  if (flags.bold || flags.italic || flags.underline) applyFlags(doc, el, flags);

  if (tag === 'BR' || KEEP.has(tag)) {
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    return;
  }

  if (HEADING.has(tag)) {
    const p = doc.createElement('P');
    while (el.firstChild) p.appendChild(el.firstChild);
    el.replaceWith(p);
    return;
  }

  unwrap(el);
}

export function sanitizeHtml(html: string, keepLocalImages = false) {
  if (typeof window === 'undefined' || !html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  for (const child of Array.from(root.childNodes)) cleanNode(doc, child, keepLocalImages);
  return root.innerHTML.replace(/&nbsp;/g, ' ').trim();
}

export function htmlToPlain(html: string) {
  return String(html || '')
    .replace(/\[\[img:[^\]]+\]\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatBytes(size?: number) {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageFile(name?: string, mime?: string) {
  if (String(mime || '').startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(name || ''));
}

export function isPdfFile(name?: string, mime?: string) {
  if (String(mime || '').includes('pdf')) return true;
  return /\.pdf$/i.test(String(name || ''));
}

export function fileKindLabel(name?: string, mime?: string) {
  if (isPdfFile(name, mime)) return 'PDF';
  const ext = String(name || '').split('.').pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : 'Dosya';
}
