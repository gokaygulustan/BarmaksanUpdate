import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * RFC 5987: filename + filename* so browsers show Turkish and other Unicode names correctly.
 */
export function setAttachmentDownloadHeaders(res, originalName, mimeType) {
  const name =
    typeof originalName === 'string' && originalName.trim().length > 0
      ? originalName.trim()
      : 'dosya';
  const ascii = name
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 200);
  const utf8Star = encodeURIComponent(name);
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${utf8Star}`
  );
}

export async function streamAttachmentToResponse(res, absolutePath, originalName, mimeType) {
  setAttachmentDownloadHeaders(res, originalName, mimeType);
  await pipeline(createReadStream(absolutePath), res);
}
