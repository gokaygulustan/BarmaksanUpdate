'use client';

import { SmokeText } from '@/components/SmokeText';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mailSettingsApi, smsSettingsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';
import { Bell, Loader2, Mail, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

function SwitchRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-4">
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-[13px] text-muted-foreground">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40',
          checked ? 'bg-primary' : 'bg-white/15'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    </label>
  );
}

type MailChannels = {
  notifyVendorQuote?: boolean;
  notifyQuoteReceived?: boolean;
  notifyApproval?: boolean;
  notifyOverLimit?: boolean;
  notifyWarehouse?: boolean;
  notifyDepartment?: boolean;
  notifyChat?: boolean;
};

const MAIL_CHANNEL_ROWS: {
  key: keyof MailChannels;
  title: string;
  hint: string;
}[] = [
  {
    key: 'notifyVendorQuote',
    title: 'Tedarikçi teklif talebi',
    hint: 'Tedarikçiye ürün listesi ve teklif formu bağlantısı.',
  },
  {
    key: 'notifyQuoteReceived',
    title: 'Teklif geldi / güncellendi',
    hint: 'Tedarikçi fiyat girince veya güncelleyince ilgili personele mail. Tüm tedarikçiler teklif verince ayrıca tamamlandı bildirimi.',
  },
  {
    key: 'notifyApproval',
    title: 'Satın alma onay akışı',
    hint: 'Yetkiliye gönderme, yetkili onayı/iadesi (personel ↔ yetkili). Limit aşımı buraya dahil değil.',
  },
  {
    key: 'notifyOverLimit',
    title: 'Limit aşımı (üst yönetim kutusu)',
    hint: 'Parasal limiti aşan taleplerde üye olmayan üst yöneticiye özel onay linki.',
  },
  {
    key: 'notifyWarehouse',
    title: 'Depo mal kabul',
    hint: 'Tamamlama sırasında depocuya irsaliye / mal kabul listesi.',
  },
  {
    key: 'notifyDepartment',
    title: 'Birim tedarik talebi',
    hint: 'Yeni birim talebi (yetkiliye) ve yetkilinin personele atama bildirimi.',
  },
  {
    key: 'notifyChat',
    title: 'Yazışma mesajı',
    hint: 'İç talep sohbetinde yeni mesaj bildirimi.',
  },
];

const PORTAL_FEATURES = [
  { label: 'Atama, onay, teklif geldi, tüm teklifler', who: 'Zil' },
  { label: 'Talep yazışması', who: 'Mesaj' },
];

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [channels, setChannels] = useState<MailChannels>({
    notifyVendorQuote: true,
    notifyQuoteReceived: true,
    notifyApproval: true,
    notifyOverLimit: true,
    notifyWarehouse: true,
    notifyDepartment: true,
    notifyChat: true,
  });
  const [smsOn, setSmsOn] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, router]);

  const mailQuery = useQuery({
    queryKey: ['mail-settings'],
    queryFn: async () => (await mailSettingsApi.get()).data as MailChannels,
    enabled: user?.role === 'ADMIN',
  });
  const smsQuery = useQuery({
    queryKey: ['sms-settings'],
    queryFn: async () => (await smsSettingsApi.get()).data as { isActive?: boolean },
    enabled: user?.role === 'ADMIN',
  });

  useEffect(() => {
    if (!mailQuery.data) return;
    setChannels({
      notifyVendorQuote: mailQuery.data.notifyVendorQuote !== false,
      notifyQuoteReceived: mailQuery.data.notifyQuoteReceived !== false,
      notifyApproval: mailQuery.data.notifyApproval !== false,
      notifyOverLimit: mailQuery.data.notifyOverLimit !== false,
      notifyWarehouse: mailQuery.data.notifyWarehouse !== false,
      notifyDepartment: mailQuery.data.notifyDepartment !== false,
      notifyChat: mailQuery.data.notifyChat !== false,
    });
  }, [mailQuery.data]);

  useEffect(() => {
    if (smsQuery.data) setSmsOn(Boolean(smsQuery.data.isActive));
  }, [smsQuery.data]);

  const mailChannelMut = useMutation({
    mutationFn: (patch: Partial<MailChannels>) => mailSettingsApi.update(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mail-settings'] });
      toast.success('E-posta bildirimi güncellendi.');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Kaydedilemedi',
      );
      qc.invalidateQueries({ queryKey: ['mail-settings'] });
    },
    onSettled: () => setSavingKey(null),
  });

  const smsMut = useMutation({
    mutationFn: (enabled: boolean) => smsSettingsApi.update({ isActive: enabled }),
    onSuccess: (_r, enabled) => {
      qc.invalidateQueries({ queryKey: ['sms-settings'] });
      toast.success(enabled ? 'SMS bildirimleri açık.' : 'SMS bildirimleri kapalı.');
    },
    onError: (e: unknown, enabled: boolean) => {
      setSmsOn(!enabled);
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Kaydedilemedi',
      );
    },
  });

  if (!user || user.role !== 'ADMIN') return null;
  if (mailQuery.isPending && smsQuery.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><SmokeText text="Bildirimler" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Her e-posta türünü ayrı açıp kapatabilirsiniz. Giriş kodu ve SMTP/SMS testi her zaman
          çalışır.
        </p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          E-posta kanalları
        </p>
        <div className="divide-y divide-white/10 rounded-lg border border-white/10 px-4">
          {MAIL_CHANNEL_ROWS.map((row) => (
            <SwitchRow
              key={row.key}
              title={row.title}
              hint={row.hint}
              checked={Boolean(channels[row.key])}
              disabled={savingKey === row.key || mailChannelMut.isPending}
              onChange={(next) => {
                setChannels((prev) => ({ ...prev, [row.key]: next }));
                setSavingKey(row.key);
                mailChannelMut.mutate({ [row.key]: next });
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" />
          SMS
        </p>
        <div className="divide-y divide-white/10 rounded-lg border border-white/10 px-4">
          <SwitchRow
            title="Tedarikçi SMS"
            hint="Kapalıyken tedarikçiye NetGSM mesajı çıkmaz. Test SMS’i çalışır."
            checked={smsOn}
            disabled={smsMut.isPending}
            onChange={(next) => {
              setSmsOn(next);
              smsMut.mutate(next);
            }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 px-4 py-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Bell className="h-4 w-4 text-primary" />
          Portal (her zaman)
        </p>
        <ul className="space-y-2">
          {PORTAL_FEATURES.map((item) => (
            <li key={item.label} className="flex items-start justify-between gap-4 text-[13px]">
              <span>{item.label}</span>
              <span className="shrink-0 text-muted-foreground">{item.who}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[13px] text-muted-foreground">
        <Link href="/settings/mail" className="underline-offset-2 hover:underline">
          E-posta sunucusu
        </Link>
        {' · '}
        <Link href="/settings/sms" className="underline-offset-2 hover:underline">
          NetGSM hesabı
        </Link>
        {' · '}
        <Link href="/settings/notification-cc-contacts" className="underline-offset-2 hover:underline">
          Teklif mail kopyası
        </Link>
      </p>
    </div>
  );
}
