import { prisma } from './prisma.js';

const COMPANY_PHONE_DISPLAY = '+90 (364) 222 0 444';
const COMPANY_PHONE_TEL = '+903642220444';

/** Satın alma: şirket hattı + dahili. Kerem (üretim): cep. */
const EXTENSION_BY_NAME = [
  {
    keys: ['kerem kalender'],
    displayName: 'Kerem Kalender',
    mobile: '+90 532 787 06 09',
    mobileTel: '+905327870609',
  },
  { keys: ['mahmut çorlu', 'mahmut corlu'], ext: '162', displayName: 'Mahmut Çorlu' },
  { keys: ['gülnur gültekin', 'gulnur gultekin'], ext: '186', displayName: 'Gülnur Gültekin' },
  { keys: ['elif can'], ext: '187', displayName: 'Elif Can' },
  {
    keys: ['m.akif tura', 'm. akif tura', 'mehmet akif tura', 'akif tura'],
    ext: '188',
    displayName: 'M. Akif Tura',
  },
];

const contactSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  subRole: true,
  moduleId: true,
};

const normalizeName = (name) =>
  String(name || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const matchExtension = (name) => {
  const n = normalizeName(name);
  if (!n) return null;
  return (
    EXTENSION_BY_NAME.find((row) =>
      row.keys.some((k) => {
        const key = normalizeName(k);
        return n === key || n.includes(key) || key.includes(n);
      }),
    ) || null
  );
};

const companyPhoneFor = (name) => {
  const hit = matchExtension(name);
  if (hit?.mobile) {
    return { phone: hit.mobile, phoneTel: hit.mobileTel || hit.mobile };
  }
  return {
    phone: hit?.ext ? `${COMPANY_PHONE_DISPLAY} - ${hit.ext}` : COMPANY_PHONE_DISPLAY,
    phoneTel: COMPANY_PHONE_TEL,
  };
};

const displayNameFor = (name) => matchExtension(name)?.displayName || String(name || '').trim();

const presentPerson = (u) => {
  if (!u?.name) return null;
  const own = formatOwnPhone(u.phone);
  const phoneInfo = own || companyPhoneFor(u.name);
  return {
    name: displayNameFor(u.name),
    email: u.email || null,
    phone: phoneInfo.phone,
    phoneTel: phoneInfo.phoneTel,
  };
};

/** Kayıtlı dahili kısa numaraysa şirket hattına eklenir; uzun numara olduğu gibi yazılır. */
const formatOwnPhone = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 2 && digits.length <= 8 && digits.length === text.length) {
    return {
      phone: `${COMPANY_PHONE_DISPLAY} - ${digits}`,
      phoneTel: COMPANY_PHONE_TEL,
    };
  }
  const tel = text.replace(/[^\d+]/g, '');
  return { phone: text, phoneTel: tel || COMPANY_PHONE_TEL };
};

export const managerLabelForModule = (moduleId) => {
  if (moduleId === 'SATIN_ALMA') return 'Satın Alma Birimi Yetkilisi';
  if (moduleId === 'YEDEK_PARCA') return 'Yedek Parça Birimi Yetkilisi';
  return 'Üretim planlama yetkilisi';
};

/**
 * Giden teklif üst bilgisi: ilgili kişi (oluşturan) + birim müdürü.
 * Oluşturan müdürse tek kolon gösterilir.
 * Telefon: satın almada şirket hattı + dahili; Kerem’de cep.
 */
export const resolveQuoteLetterhead = async (request) => {
  const moduleId = request?.moduleId || 'URETIM_PLANLAMA';

  let contact = request?.createdBy;
  const needsFull =
    request?.createdById && (!contact?.email || contact.phone === undefined);
  if (needsFull) {
    contact = await prisma.user.findUnique({
      where: { id: request.createdById },
      select: contactSelect,
    });
  } else if (contact?.id && (contact.phone === undefined || !contact.email)) {
    contact = await prisma.user.findUnique({
      where: { id: contact.id },
      select: contactSelect,
    });
  }

  const manager = await prisma.user.findFirst({
    where: {
      isActive: true,
      subRole: 'MANAGER',
      moduleId,
      role: { in: ['PURCHASING', 'ADMIN'] },
    },
    select: contactSelect,
    orderBy: { createdAt: 'asc' },
  });

  const same = contact?.id && manager?.id && contact.id === manager.id;
  const contactPerson = same ? null : presentPerson(contact);
  const managerPerson = presentPerson(manager) || (same ? presentPerson(contact) : null);

  return {
    contact: contactPerson,
    manager: managerPerson,
    contactLabel: 'İlgili kişi',
    managerLabel: managerLabelForModule(moduleId),
    quoteRef: String(request?.title || '').trim(),
    showQuoteTitle: moduleId === 'URETIM_PLANLAMA',
    quoteDate: request?.createdAt || null,
    quoteDeadline: request?.deadline || null,
    companyPhone: COMPANY_PHONE_DISPLAY,
  };
};
