'use client';

import { SmokeText } from '@/components/SmokeText';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Save, AlertCircle, Lock, Loader2 } from 'lucide-react';
import { SkeletonForm, Swap } from '@/components/page/Skeleton';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

/**
 * "1.250.000,50" gibi Türkçe biçimli tutarı sayıya çevirir.
 * Binlik ayıracı olarak tüm noktalar atılır, ondalık ayıracı virgüldür.
 */
function parseTurkishAmount(value: string): number | null {
  const cleaned = (value ?? '').trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ApprovalLimitSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [limitAmount, setLimitAmount] = useState<string>('250000');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [executiveEmail, setExecutiveEmail] = useState<string>('');

  const { data: limitData, isLoading } = useQuery({
    queryKey: ['procurement-approval-limit'],
    queryFn: async () => {
      const { data } = await procurementApi.getApprovalLimit();
      return data as {
        limitAmount?: number;
        isActive?: boolean;
        executiveEmail?: string | null;
      };
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (limitData) {
      if (limitData.limitAmount != null) {
        setLimitAmount(limitData.limitAmount.toString());
      }
      if (limitData.isActive != null) {
        setIsActive(Boolean(limitData.isActive));
      }
      setExecutiveEmail(limitData.executiveEmail || '');
    }
  }, [limitData]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedLimit = parseTurkishAmount(limitAmount);
      if (parsedLimit === null || parsedLimit < 0) {
        throw new Error('Lütfen geçerli bir limit tutarı giriniz.');
      }
      const email = executiveEmail.trim();
      if (isActive && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Üst yönetim e-postası geçerli değil.');
      }
      if (isActive && !email) {
        throw new Error('Limit açıkken üst yönetim e-postası zorunludur (üye olmadan onay linki).');
      }
      return procurementApi.updateApprovalLimit({
        limitAmount: parsedLimit,
        isActive,
        executiveEmail: email || null,
      });
    },
    onSuccess: () => {
      toast.success('Satın alma onay limiti kaydedildi.');
      void queryClient.invalidateQueries({ queryKey: ['procurement-approval-limit'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Ayarlar kaydedilemedi.');
    },
  });

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <Card className="border-border">
          <CardContent className="space-y-3 p-8 text-center">
            <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Bu sayfa yöneticiye açık</h2>
            <p className="text-sm text-muted-foreground">
              Parasal onay limitini yalnızca sistem yöneticisi görür ve değiştirir.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><SmokeText text="Onay limiti" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Satın alma tekliflerinin üst yönetim onayına gireceği tutar. Yalnızca SATIN_ALMA hattı.
        </p>
      </div>

      <Card className="border-border bg-background">
        <CardHeader>
          <CardTitle className="text-lg">Limit ve durum</CardTitle>
          <CardDescription>
            Limit aşılınca satın alma yetkilisi tek başına onaylayamaz; kayıt üst yönetime yükselir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Swap loading={isLoading} skeleton={<SkeletonForm fields={3} />} innerClassName="space-y-6">
            <>
              <label className="flex cursor-pointer items-start justify-between gap-6 rounded-lg border border-white/10 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">Limit kontrolü</span>
                  <span className="mt-1 block text-[13px] text-muted-foreground">
                    Kapalıyken tüm tutarlar satın alma yetkilisinde kalır, üst yönetim kuyruğuna gitmez.
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => setIsActive(!isActive)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                    isActive ? 'bg-primary' : 'bg-white/15'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      isActive && 'translate-x-5'
                    )}
                  />
                </button>
              </label>

              <div className="space-y-2">
                <Label htmlFor="limit">Parasal üst limit (TL)</Label>
                <div className="relative">
                  <Input
                    id="limit"
                    type="text"
                    value={limitAmount}
                    onChange={(e) => setLimitAmount(e.target.value)}
                    placeholder="250000"
                    disabled={!isActive}
                    className="h-11 pr-12 font-semibold tabular-nums"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">TL</span>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Örnek: 10.000 — kabul edilen teklif toplamı (KDV hariç) bunun üzerindeyse üst yönetim onayı gerekir.
                  USD/EUR/CHF TCMB kuruyla TL’ye çevrilir.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="execEmail">Üst yönetim e-postası</Label>
                <Input
                  id="execEmail"
                  type="email"
                  value={executiveEmail}
                  onChange={(e) => setExecutiveEmail(e.target.value)}
                  placeholder="yonetici@ornek.com"
                  disabled={!isActive}
                  className="h-11"
                  autoComplete="off"
                />
                <p className="text-[13px] text-muted-foreground">
                  Sisteme üye olmaz. Limit aşımında özel link gider; aynı günkü tüm bekleyen onayları bu
                  kutudan görür.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-[13px] leading-relaxed text-emerald-100/90">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div>
                  Personel teklifleri yetkiliye iletir. Limit (KDV hariç) açıksa ve tutar üstündeyse yetkili
                  onaylayamaz; üst yöneticiye e-posta linki gider. Altındaysa yetkili onaylar. Üst yönetim reddi
                  yetkiliye (Çorlu) döner; üretim karar daveti ayrı kalır.
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="gap-2">
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Kaydet
                </Button>
              </div>
            </>
          </Swap>
        </CardContent>
      </Card>
    </div>
  );
}
