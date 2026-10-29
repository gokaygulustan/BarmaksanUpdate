/** Tedarikçi e-postaları için tek doğrulama kaynağı. */

/** Tek nokta, geçerli TLD, boşluksuz adres. */
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export const EMAIL_ERROR = 'Geçerli bir e-posta giriniz (ornek@firma.com)';

/** Baş/son boşluk ve büyük harf farklarını temizler. */
export const normalizeEmail = (value: string): string => String(value ?? '').trim().toLowerCase();

export const isValidEmail = (value: string): boolean => EMAIL_RE.test(normalizeEmail(value));
