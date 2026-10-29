'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mailSettingsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

type ConnMode = 'starttls' | 'ssl';

export default function MailSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [connMode, setConnMode] = useState<ConnMode>('starttls');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.email) setTestTo((t) => t || user.email || '');
  }, [user?.email]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['mail-settings'],
    queryFn: async () => {
      const { data: d } = await mailSettingsApi.get();
      return d as {
        host: string;
        port: number;
        secure: boolean;
        user: string | null;
        hasPassword: boolean;
        fromEmail: string | null;
        fromName: string | null;
      };
    },
    enabled: Boolean(user && user.role === 'ADMIN'),
    /** Sekmeye dönünce otomatik refetch tam formu “yükleniyor” gibi kilitlemesin */
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  /** Yalnızca ilk veri yokken tam spinner; önbellekte veri varken sekme dönüşünde form görünür kalır */
  const showInitialLoader = isPending && data === undefined;

  useEffect(() => {
    if (!data) return;
    setHost(data.host || '');
    setPort(String(data.port ?? 587));
    const mode: ConnMode = data.secure ? 'ssl' : 'starttls';
    setConnMode(mode);
    setSmtpUser(data.user || '');
    setSmtpPass('');
    setFromName(data.fromName || '');
    setFromEmail(data.fromEmail || '');
  }, [data]);

  const applyConnMode = (mode: ConnMode) => {
    setConnMode(mode);
    if (mode === 'ssl') {
      setPort('465');
    } else {
      setPort('587');
    }
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      mailSettingsApi.update({
        host: host.trim(),
        port: parseInt(port, 10),
        secure: connMode === 'ssl',
        user: smtpUser.trim() || null,
        ...(smtpPass.trim() ? { pass: smtpPass } : {}),
        fromName: fromName.trim() || null,
        fromEmail: fromEmail.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mail-settings'] });
      setSmtpPass('');
      toast.success('SMTP ayarları kaydedildi.');
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Kaydedilemedi.');
    },
  });

  const testMutation = useMutation({
    mutationFn: () => mailSettingsApi.test(testTo.trim() || undefined),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Test e-postası gönderildi.');
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Test gönderilemedi; SMTP bilgilerini kontrol edin.');
    },
  });

  const hasPasswordHint = useMemo(() => data?.hasPassword, [data?.hasPassword]);

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight"><SmokeText text="E-posta" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sunucu bilgisi. Hangi maillerin gideceği Ayarlar → Bildirimler’de kanal kanal.
        </p>
      </div>

      <Card className="border-border shadow-md bg-background">
        <CardHeader>
          <CardTitle className="text-lg">Sunucu</CardTitle>
          <CardDescription>SSL/TLS (465) veya STARTTLS (587) seçebilirsiniz.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showInitialLoader ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {(error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
                ?.message ||
                (error as Error)?.message ||
                'Ayarlar yüklenemedi. Sayfayı yenileyin.'}
            </p>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="conn">Bağlantı türü</Label>
                <select
                  id="conn"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={connMode}
                  onChange={(e) => applyConnMode(e.target.value as ConnMode)}
                >
                  <option value="starttls">STARTTLS (önerilen, çoğunlukla port 587)</option>
                  <option value="ssl">SSL/TLS (doğrudan şifreli, genelde port 465)</option>
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">SMTP sunucusu</Label>
                  <Input
                    id="host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="smtp.ornek.com"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2 sm:max-w-[120px]">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpUser">Kullanıcı adı</Label>
                  <Input
                    id="smtpUser"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="posta@alanadiniz.com"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPass">Şifre / uygulama şifresi</Label>
                  <Input
                    id="smtpPass"
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={hasPasswordHint ? '•••••••• (değiştirmek için yazın)' : 'Şifre'}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 border-t border-border/50 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="fromName">Gönderen adı</Label>
                  <Input
                    id="fromName"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="UP Satınalma"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fromEmail">Gönderen e-posta</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="satinalma@sirket.com"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="gap-2"
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Kaydet
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-md bg-background">
        <CardHeader>
          <CardTitle className="text-lg">Bağlantı testi</CardTitle>
          <CardDescription>Kaydettikten sonra test maili göndererek doğrulayın.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="testTo">Test alıcısı</Label>
            <Input
              id="testTo"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={user.email || 'ornek@sirket.com'}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 shrink-0"
            disabled={testMutation.isPending || !testTo.trim()}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Test gönder
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
