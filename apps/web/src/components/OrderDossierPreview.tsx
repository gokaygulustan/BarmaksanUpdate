'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { procurementApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { OrderDossierSheet, type OrderDossier } from '@/components/OrderDossierSheet';

export function OrderDossierPreview({ requestId }: { requestId: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [sheetH, setSheetH] = useState(794);
  const [downloading, setDownloading] = useState(false);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['procurement-order-dossier', requestId],
    queryFn: async () => {
      const { data: d } = await procurementApi.getOrderDossier(requestId);
      return d as OrderDossier;
    },
    enabled: Boolean(requestId),
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const sheet = sheetRef.current;
    if (!wrap || !sheet || !data) return;

    const update = () => {
      const w = Math.max(sheet.scrollWidth, sheet.offsetWidth);
      const h = Math.max(sheet.scrollHeight, sheet.offsetHeight);
      const avail = wrap.clientWidth;
      if (w > 0 && avail > 0) {
        setScale(Math.min(1, avail / w));
        setSheetH(h);
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [data]);

  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await procurementApi.downloadOrderDossierPdf(requestId);
      const url = URL.createObjectURL(res.data as Blob);
      const safeTitle = String(data?.title || 'talep').replace(/[\\/:*?"<>|]+/g, ' ').trim();
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sipariş dosyası - ${safeTitle}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Sipariş dosyası PDF olarak indirilemedi.');
    } finally {
      setDownloading(false);
    }
  };

  const errMsg =
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ||
    'Sipariş dosyası yüklenemedi.';

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-sm font-medium leading-none text-foreground">Sipariş dosyası</h3>
        </div>
      </div>

      {isPending ? (
        <div className="flex min-h-[12rem] items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Önizleme hazırlanıyor…</span>
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
          {errMsg}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-primary/25 bg-neutral-400/15 p-2">
            <div
              ref={wrapRef}
              className="relative overflow-hidden rounded-md bg-white"
              style={{ height: Math.max(120, Math.ceil(sheetH * scale)) }}
            >
              <div
                ref={sheetRef}
                className="absolute left-0 top-0 origin-top-left bg-white p-[8mm] [&_.overflow-x-auto]:overflow-visible"
                style={{
                  width: 'max-content',
                  minWidth: '297mm',
                  minHeight: '210mm',
                  transform: `scale(${scale})`,
                }}
              >
                <OrderDossierSheet data={data} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="h-9 gap-2 bg-primary text-primary-foreground"
              onClick={downloadPdf}
              disabled={downloading}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              PDF indir
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
