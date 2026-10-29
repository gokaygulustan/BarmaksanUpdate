/**
 * Tedarikçi telefonlarının tek kalıpta tutulması için maske yardımcıları.
 * Hedef biçim: 0532 123 45 67 (11 hane, alan kodu dahil).
 */

/** Girilen değerden 11 haneli yerel numarayı çıkarır (+90 / 0090 / 90 önekleri temizlenir). */
export const trPhoneDigits = (value: string): string => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0090')) digits = digits.slice(4);
  else if (digits.length >= 12 && digits.startsWith('90')) digits = digits.slice(2);
  if (digits && !digits.startsWith('0')) digits = `0${digits}`;
  return digits.slice(0, 11);
};

/** Yazarken uygulanan maske: 0532 123 45 67 */
export const maskTrPhone = (value: string): string => {
  const digits = trPhoneDigits(value);
  if (!digits) return '';
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)]
    .filter(Boolean)
    .join(' ');
};

/**
 * Dahili/açıklama içeren eski kayıtları bozmamak için harf içeren değerlere dokunmaz.
 * (Örn: "0212 000 00 00 / dahili 1533")
 */
export const maskTrPhoneLoose = (value: string): string =>
  /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(value) ? value : maskTrPhone(value);

/** Numara girildiyse 11 hane tamamlanmış mı? */
export const isTrPhoneComplete = (value: string): boolean => trPhoneDigits(value).length === 11;

export const TR_PHONE_PLACEHOLDER = '0532 123 45 67';
export const TR_PHONE_ERROR = 'Telefon 11 haneli olmalı (0532 123 45 67)';
