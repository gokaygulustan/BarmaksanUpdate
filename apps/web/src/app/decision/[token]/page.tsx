'use client';

import { use, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { procurementApi } from '@/lib/api';
import { Loader2, AlertTriangle } from 'lucide-react';
import { pageTitle } from '@/lib/brand';

export default function PublicDecisionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const { data: bundle, isLoading, error, isError } = useQuery({
    queryKey: ['decision-token', token],
    queryFn: async () => {
      const { data } = await procurementApi.getByDecisionToken(token);
      return data as {
        requestId?: string;
        inboxToken?: string | null;
        invite: { email: string; expiresAt: string };
      };
    },
    retry: false,
  });

  useEffect(() => {
    document.title = pageTitle('Üst yönetim onayı');
  }, []);

  useEffect(() => {
    if (!bundle?.inboxToken) return;
    const requestId = bundle.requestId ? encodeURIComponent(bundle.requestId) : '';
    const qs = requestId ? `?r=${requestId}` : '';
    router.replace(`/executive-approval/${bundle.inboxToken}${qs}`);
  }, [bundle, router]);

  if (isLoading || (bundle?.inboxToken && !isError)) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-100 text-slate-800 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">Onay kutusu açılıyor…</p>
      </div>
    );
  }

  const status = (error as { response?: { status?: number } })?.response?.status;
  const msg =
    status === 410
      ? 'Bu davet bağlantısının süresi dolmuş. Yeni davet için satın alma ekibiyle iletişime geçin.'
      : (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Bağlantı geçersiz veya onay kutusu açılamadı.';

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-neutral-100 text-slate-800 p-6">
      <AlertTriangle className="h-12 w-12 text-amber-600 mb-4" />
      <p className="text-center text-slate-600 max-w-md">{msg}</p>
    </div>
  );
}
