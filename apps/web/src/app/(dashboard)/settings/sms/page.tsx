'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { smsSettingsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

export default function SmsSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [usercode, setUsercode] = useState('');
  const [password, setPassword] = useState('');
  const [msgheader, setMsgheader] = useState('');
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (user && !user.isExecutive && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.phone) setTestTo((t) => t || user.phone || '');
  }, [user?.phone]);

  const { data, isPending } = useQuery({
    queryKey: ['sms-settings'],
    queryFn: async () => (await smsSettingsApi.get()).data,
    enabled: Boolean(user?.isExecutive || user?.role === 'ADMIN'),
  });

  useEffect(() => {
    if (!data) return;
    setUsercode(data.usercode || '');
    setMsgheader(data.msgheader || '');
    setPassword('');
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      smsSettingsApi.update({
        usercode,
        msgheader,
        ...(password ? { password } : {}),
      }),
    onSuccess: () => {
      toast.success('SMS ayarları kaydedildi');
      queryClient.invalidateQueries({ queryKey: ['sms-settings'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Kaydedilemedi'),
  });

  const testMutation = useMutation({
    mutationFn: () => smsSettingsApi.test(testTo.trim() || undefined),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Test SMS gönderildi.');
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Test gönderilemedi; NetGSM bilgilerini kontrol edin.');
    },
  });

  if (isPending && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><SmokeText text="SMS" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          NetGSM hesabı. SMS’in gidip gitmeyeceği Bildirimler’de.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Hesap</CardTitle>
          <CardDescription>Kullanıcı kodu, şifre ve onaylı mesaj başlığı.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Kullanıcı kodu</Label>
            <Input value={usercode} onChange={(e) => setUsercode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Şifre {data?.hasPassword ? '(kayıtlı, boş bırakırsanız değişmez)' : ''}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mesaj başlığı (onaylı originator)</Label>
            <Input value={msgheader} onChange={(e) => setMsgheader(e.target.value)} />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Kaydet
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bağlantı testi</CardTitle>
          <CardDescription>Kaydettikten sonra test SMS’i göndererek doğrulayın. Bildirim anahtarı kapalı olsa da çalışır.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="testTo">Test alıcısı</Label>
            <Input
              id="testTo"
              type="tel"
              inputMode="tel"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="05xx xxx xx xx"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-2"
            disabled={testMutation.isPending || !testTo.trim()}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Test gönder
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
