/** Talep kalemlerini oluşturma/import sırasına göre sıralar (API yedek koruması). */
export function sortRequestItems<T>(items: T[] | null | undefined): T[] {
  if (!items?.length) return [];
  return [...items].sort((a, b) => {
    const ao = (a as { sortOrder?: number | null }).sortOrder ?? 0;
    const bo = (b as { sortOrder?: number | null }).sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    const ac = (a as { createdAt?: string }).createdAt;
    const bc = (b as { createdAt?: string }).createdAt;
    if (ac && bc) {
      return new Date(ac).getTime() - new Date(bc).getTime();
    }
    const aid = (a as { id?: string }).id || '';
    const bid = (b as { id?: string }).id || '';
    return aid.localeCompare(bid);
  });
}
