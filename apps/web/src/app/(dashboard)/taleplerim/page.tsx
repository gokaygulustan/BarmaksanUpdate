'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { internalRequestsApi } from '@/lib/api';
import { DEPARTMENT_BOARD_STEPS, pipelineColumnKey } from '@/lib/requestPipeline';
import {
  BoardHero,
  PrimaryLink,
  RequestKanban,
  type BoardPage,
  type RequestRow,
} from '@/components/requests/RequestBoard';

function groupByColumn(rows: RequestRow[]) {
  const map = Object.fromEntries(DEPARTMENT_BOARD_STEPS.map((step) => [step.key, [] as RequestRow[]])) as Record<
    string,
    RequestRow[]
  >;
  for (const row of rows) {
    const key = pipelineColumnKey(row.status, row.procurementStatus);
    (map[key] || map.review).push(row);
  }
  return map;
}

export default function TaleplerimPage() {
  const countsQuery = useQuery({
    queryKey: ['birim-board-counts'],
    retry: 1,
    queryFn: async () =>
      (await internalRequestsApi.boardCounts(undefined, undefined, { mine: true })).data as Record<
        string,
        number
      >,
  });

  // Sayaç uç noktası yanıt vermezse bütün talepler tek seferde alınıp burada aşamalara ayrılır.
  const fallbackQuery = useQuery({
    queryKey: ['birim-requests'],
    enabled: countsQuery.isError,
    queryFn: async () => (await internalRequestsApi.getAll({ mine: true })).data as RequestRow[],
  });

  const useFallback = countsQuery.isError;
  const grouped = useMemo(() => groupByColumn(fallbackQuery.data || []), [fallbackQuery.data]);
  const counts = useMemo(
    () =>
      useFallback
        ? Object.fromEntries(DEPARTMENT_BOARD_STEPS.map((s) => [s.key, grouped[s.key]?.length ?? 0]))
        : countsQuery.data || {},
    [useFallback, grouped, countsQuery.data],
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-10.5rem)] min-h-[560px] max-w-[1600px] flex-col">
      <BoardHero
        title="Taleplerim"
        action={
          <PrimaryLink href="/taleplerim/yeni" tour="taleplerim-new" icon={<Plus className="size-[18px]" strokeWidth={1.9} />}>
            Yeni talep
          </PrimaryLink>
        }
      />

      {useFallback && fallbackQuery.isError ? (
        <p className="mb-4 shrink-0 rounded-[14px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
          Talepler şu anda yüklenemedi. Sayfayı yenileyin; sorun sürerse satın alma birimine bildirin.
        </p>
      ) : null}

      <RequestKanban
        tour="taleplerim-board"
        steps={DEPARTMENT_BOARD_STEPS}
        counts={counts}
        loading={useFallback ? fallbackQuery.isLoading : countsQuery.isLoading}
        staticRows={useFallback ? grouped : null}
        queryKeyFor={(stage) => ['birim-board', stage]}
        fetchPage={async (stage, cursor) =>
          (await internalRequestsApi.boardColumn(stage, cursor, undefined, undefined, { mine: true })).data as BoardPage
        }
        hrefFor={(row) => `/taleplerim/${row.id}`}
      />
    </div>
  );
}
