/** Kalem ölçü birimleri (organizasyon birimi değil: Adet, Kutu, Palet…). */

export const FALLBACK_QUANTITY_UNITS = [
  'Adet',
  'Kutu',
  'Paket',
  'Koli',
  'Palet',
  'Set',
  'Takım',
  'Çift',
  'Metre',
  'Metrekare (m²)',
  'Metreküp (m³)',
  'Santimetre (cm)',
  'Milimetre (mm)',
  'Kilogram (kg)',
  'Gram (g)',
  'Ton',
  'Litre',
  'Mililitre (ml)',
  'Rulo',
  'Bidon',
  'Varil',
  'Torba',
  'Makara',
] as const;

function foldUnit(name: string) {
  return name.trim().toLocaleLowerCase('tr-TR');
}

/** API listesi + varsayılanlar; Adet başta, tekrarsız. */
export function mergeQuantityUnits(fromApi?: Array<{ name?: string | null } | string> | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const name = String(raw || '').trim();
    if (!name) return;
    const key = foldUnit(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  add('Adet');
  for (const name of FALLBACK_QUANTITY_UNITS) add(name);
  for (const row of fromApi || []) {
    add(typeof row === 'string' ? row : row?.name);
  }
  return out;
}
