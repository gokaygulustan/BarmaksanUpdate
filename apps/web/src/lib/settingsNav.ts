import {
  Bell,
  CircleDollarSign,
  FileSpreadsheet,
  FolderTree,
  HardHat,
  Inbox,
  Mail,
  MailPlus,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** root = sol menüde üst öğe; settings = Ayarlar alt menüsü */
export type SettingsMenuPlacement = 'root' | 'settings';

export type SettingsSection = {
  href: string;
  label: string;
  body: string;
  icon: LucideIcon;
  roles: readonly string[];
  /** Varsa ADMIN dışı kullanıcıda moduleId bu listede olmalı */
  moduleIds?: readonly string[];
  /** Varsayılan: settings */
  menu?: SettingsMenuPlacement;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: '/settings/mail-outbox',
    label: 'Mail günlüğü',
    body: 'Sistemin giden e-postaları (gönderildi / atlandı / hata).',
    icon: Inbox,
    roles: ['ADMIN'],
    menu: 'root',
  },
  {
    href: '/settings/users',
    label: 'Kullanıcılar',
    body: 'Personel hesapları ve yetki.',
    icon: Users,
    roles: ['ADMIN', 'PURCHASING'],
    moduleIds: ['URETIM_PLANLAMA'],
    menu: 'root',
  },
  {
    href: '/settings/notifications',
    label: 'Bildirimler',
    body: 'E-posta ve SMS çıksın mı.',
    icon: Bell,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/mail',
    label: 'E-posta',
    body: 'SMTP sunucusu ve gönderen.',
    icon: Mail,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/sms',
    label: 'SMS',
    body: 'NetGSM hesabı.',
    icon: Smartphone,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/notification-cc-contacts',
    label: 'Teklif mail kopyası',
    body: 'Tedarikçiye giden teklif mailine CC eklenecek kişiler.',
    icon: MailPlus,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/departments',
    label: 'Birim Yönetimi',
    body: 'Beyaz / mavi yaka birimleri ekle, düzenle, pasife al.',
    icon: FolderTree,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/org-workers',
    label: 'Usta / Çalışan',
    body: 'Mavi yaka usta ve çalışan kayıtları.',
    icon: HardHat,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/procurement-list-template',
    label: 'Talep listesi şablonları',
    body: 'Üretim, satın alma ve birim talebi Excel şablonları; hangi modülde toplu kalem kartı açık.',
    icon: FileSpreadsheet,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/executive-inbox',
    label: 'Üst yönetim kutusu',
    body: 'Bekleyen kararlar, kime gitti, kuyruktan çek.',
    icon: Inbox,
    roles: ['ADMIN'],
  },
  {
    href: '/settings/approval-limit',
    label: 'Onay limiti',
    body: 'Tedarik parasal onay eşiği.',
    icon: CircleDollarSign,
    roles: ['ADMIN'],
  },
];

type SettingsUser = {
  role?: string;
  moduleId?: string;
  isExecutive?: boolean;
} | null | undefined;

export function settingsSectionVisible(section: SettingsSection, user: SettingsUser) {
  if (!user?.role || !section.roles.includes(user.role)) return false;
  if (user.role === 'ADMIN' || user.isExecutive) return true;
  if (section.moduleIds?.length) {
    return section.moduleIds.includes(user.moduleId || '');
  }
  return true;
}

export function settingsSectionsForUser(user: SettingsUser) {
  return SETTINGS_SECTIONS.filter((s) => settingsSectionVisible(s, user));
}

export function settingsRootSections() {
  return SETTINGS_SECTIONS.filter((s) => s.menu === 'root');
}

export function settingsNestedSections() {
  return SETTINGS_SECTIONS.filter((s) => s.menu !== 'root');
}

export function isSettingsRootPath(pathname: string) {
  const p = pathname.replace(/\/$/, '') || '/';
  return settingsRootSections().some((s) => p === s.href || p.startsWith(`${s.href}/`));
}

/** @deprecated role-only; tercih settingsSectionsForUser */
export function settingsSectionsForRole(role: string) {
  return SETTINGS_SECTIONS.filter((s) => s.roles.includes(role) && !s.moduleIds?.length);
}

export function activeSettingsHref(pathname: string, user: SettingsUser) {
  const sorted = [...settingsSectionsForUser(user)].sort((a, b) => b.href.length - a.href.length);
  for (const s of sorted) {
    if (pathname === s.href || pathname.startsWith(`${s.href}/`)) return s.href;
  }
  return null;
}

export function settingsLabelForPath(pathname: string, user: SettingsUser) {
  const href = activeSettingsHref(pathname, user);
  return SETTINGS_SECTIONS.find((s) => s.href === href)?.label ?? 'Ayarlar';
}
