export const normalizeEmail = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

export const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length >= 12) return digits.slice(-10);
  if (digits.startsWith('0') && digits.length >= 11) return digits.slice(-10);
  return digits.slice(-10);
};

export const emailsOverlap = (a, b) => {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return Boolean(left && right && left === right);
};

export const phonesOverlap = (a, b) => {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return Boolean(left && right && left.length >= 10 && left === right);
};

/** Bildirim alan tüm adresler: ana + yetkili kişiler (+ eski ek adres alanı). */
export const vendorRecipientEmails = (vendor) => {
  const list = [
    vendor?.contactEmail,
    ...(vendor?.contacts || []).map((contact) => contact?.email),
    ...(vendor?.extraContactEmails || []),
  ];
  return [...new Set(list.map(normalizeEmail).filter(Boolean))];
};

/** SMS gidebilecek tüm numaralar: ana + yetkili kişiler (+ eski ek numara alanı). */
export const vendorRecipientPhones = (vendor) => {
  const list = [
    vendor?.contactPhone,
    ...(vendor?.contacts || []).map((contact) => contact?.phone),
    ...(vendor?.extraContactPhones || []),
  ];
  return [...new Set(list.map(normalizePhone).filter((p) => p.length >= 10))];
};

/** Gönderen (veya şirket içi kullanıcı) tedarikçi alıcılarıyla çakışıyor mu? */
export const findVendorActorOverlap = (vendor, actor, internalUsers = []) => {
  const vendorEmails = vendorRecipientEmails(vendor);
  const vendorPhones = vendorRecipientPhones(vendor);
  const contacts = vendor?.contacts || [];
  const people = [actor, ...internalUsers].filter(Boolean);
  const hits = [];
  const seen = new Set();

  for (const person of people) {
    const personEmail = normalizeEmail(person.email);
    if (personEmail && vendorEmails.includes(personEmail)) {
      const key = `email:${person.id || personEmail}`;
      if (!seen.has(key)) {
        seen.add(key);
        const contact = contacts.find((c) => normalizeEmail(c?.email) === personEmail);
        hits.push({
          type: 'email',
          userId: person.id,
          userName: person.name || null,
          email: person.email,
          vendorContactName: contact?.name || null,
        });
      }
    }
    if (vendorPhones.some((phone) => phonesOverlap(phone, person.phone))) {
      const key = `phone:${person.id || normalizePhone(person.phone)}`;
      if (!seen.has(key)) {
        seen.add(key);
        const contact = contacts.find((c) => phonesOverlap(c?.phone, person.phone));
        hits.push({
          type: 'phone',
          userId: person.id,
          userName: person.name || null,
          phone: person.phone,
          vendorContactName: contact?.name || null,
        });
      }
    }
  }
  return hits;
};

/** Bildirim / hata metni: "e-posta x, Salih UYSAL ile aynı". */
export const formatOverlapDetail = (overlaps = []) => {
  const parts = overlaps.map((hit) => {
    const who = String(hit.userName || '').trim() || 'bir kullanıcı';
    const via = hit.vendorContactName ? ` (yetkili: ${hit.vendorContactName})` : '';
    if (hit.type === 'email') {
      return `e-posta ${hit.email}${via} → ${who}`;
    }
    return `telefon ${hit.phone}${via} → ${who}`;
  });
  return parts.filter(Boolean).join('; ');
};
