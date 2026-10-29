/**
 * Multer / bazı istemciler orijinal dosya adını Latin-1 bayt olarak gönderir;
 * Türkçe karakterler bozulur (ör. TALEP LÄ°STESÄ°). UTF-8'e çevir.
 */
export function decodeMultipartOriginalName(name) {
  if (!name || typeof name !== 'string') return name;
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

/** Daha önce bozulmuş kayıtlardaki Türkçe dosya adını düzeltir. */
export function decodeStoredOriginalName(name) {
  if (!name || typeof name !== 'string') return name;
  if (!/[ÃÄÅÂ]/.test(name)) return name;
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded || name;
  } catch {
    return name;
  }
}
