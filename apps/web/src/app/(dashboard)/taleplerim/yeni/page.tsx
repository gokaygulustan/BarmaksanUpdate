'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { internalRequestsApi } from '@/lib/api';
import {
  BirimTalepForm,
  isBirimTalepEditable,
  type BirimTalepExisting,
} from '@/components/internal-request/BirimTalepForm';

export default function YeniTalepPage() {
  const router = useRouter();
  const draftId = useSearchParams().get('id');

  const { data: draft, isLoading, isError, error } = useQuery({
    queryKey: ['birim-request', draftId],
    enabled: Boolean(draftId),
    retry: 1,
    queryFn: async () => (await internalRequestsApi.getById(draftId as string)).data as BirimTalepExisting,
  });

  if (draftId && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (draftId && (isError || !draft)) {
    const message =
      (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ||
      'Talep açılamadı.';
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold">{message}</p>
        <button
          type="button"
          onClick={() => router.push('/taleplerim')}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Taleplerim
        </button>
      </div>
    );
  }

  if (draft && !isBirimTalepEditable(draft)) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold">Bu talep teklif sürecine aktarıldı, artık düzenlenemez.</p>
        <button
          type="button"
          onClick={() => router.push(`/taleplerim/${draft.id}`)}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          Talebi görüntüle
        </button>
      </div>
    );
  }

  return <BirimTalepForm key={draft?.id || 'yeni'} draft={draft || null} />;
}
