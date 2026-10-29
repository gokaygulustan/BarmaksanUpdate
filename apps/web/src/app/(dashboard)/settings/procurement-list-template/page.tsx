'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Table, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXCEL_MODULES = [
  { id: 'SATIN_ALMA', label: 'Satın Alma', hint: 'Satın alma personeli talep oluştururken kartı görür.' },
  {
    id: 'URETIM_PLANLAMA',
    label: 'Üretim Planlama',
    hint: 'Üretim planlama personeli talep oluştururken kartı görür.',
  },
  {
    id: 'YEDEK_PARCA',
    label: 'Yedek Parça',
    hint: 'Yedek parça personeli kartı görür; satın alma şablonunu kullanır.',
  },
] as const;

const TEMPLATE_CARDS = [
  {
    id: 'SATIN_ALMA' as const,
    title: 'Satın alma şablonu',
    columns:
      'Ürün Adı, Miktar, Birim, Açıklama. SN / stok / tonaj / ünite yok. Doldurup talep oluştururken yükleyin.',
  },
  {
    id: 'URETIM_PLANLAMA' as const,
    title: 'Üretim şablonu',
    columns: 'SN, Stok Kodu, Ürün Adı, Açıklama, Tonaj, Miktar, Birim. Sarı satır: ünite / grup adı.',
  },
  {
    id: 'BIRIM_TALEP' as const,
    title: 'Birim talep şablonu',
    columns:
      'Ürün Adı, Miktar, Birim, Açıklama. Birimler “Yeni talep” sayfasında şablon indir / Excel yükle ile kullanır. Örnek ürün satırı yok.',
  },
];

type TemplateMeta = {
  moduleId?: string;
  hasCustom: boolean;
  originalName: string | null;
  updatedAt: string | null;
  size: number | null;
};

type TemplateMetaMap = Record<string, TemplateMeta>;

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
    <label className="flex cursor-pointer items-start justify-between gap-6 py-3">
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

export default function ProcurementListTemplateSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadModuleId, setUploadModuleId] = useState<
    'URETIM_PLANLAMA' | 'SATIN_ALMA' | 'BIRIM_TALEP'
  >('URETIM_PLANLAMA');

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const { data, isPending } = useQuery({
    queryKey: ['procurement-list-template'],
    queryFn: async () => {
      const { data: d } = await procurementApi.getListTemplateMeta();
      return d as TemplateMetaMap;
    },
    enabled: Boolean(user && user.role === 'ADMIN'),
  });

  const { data: excelSettings, isPending: excelPending } = useQuery({
    queryKey: ['procurement-excel-import-settings'],
    queryFn: async () => {
      const { data: d } = await procurementApi.getExcelImportSettings();
      return d as Record<string, boolean>;
    },
    enabled: Boolean(user && user.role === 'ADMIN'),
  });

  const excelSettingMutation = useMutation({
    mutationFn: (vars: { moduleId: string; isEnabled: boolean }) =>
      procurementApi.updateExcelImportSetting(vars),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-excel-import-settings'] });
      toast.success(vars.isEnabled ? 'Kart gösterilecek.' : 'Kart gizlendi.');
    },
    onError: (e: unknown) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-excel-import-settings'] });
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Ayar kaydedilemedi.');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (moduleId: string) => procurementApi.downloadListTemplateBlob(moduleId),
    onSuccess: () => toast.success('Şablon indirildi.'),
    onError: (e: unknown) => {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'İndirilemedi.');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, moduleId }: { file: File; moduleId: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      return procurementApi.uploadListTemplate(fd, moduleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-list-template'] });
      toast.success('Şablon kaydedildi. Talep oluştururken bu dosya indirilecek.');
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: unknown) => {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Yüklenemedi.');
      if (fileRef.current) fileRef.current.value = '';
    },
  });

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight"><SmokeText text="Talep listesi şablonları" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Üretim, satın alma ve birim talebi ayrı Excel şablonu kullanır. Özel dosya yüklerseniz
          &quot;Şablon indir&quot; onu verir; yoksa boş varsayılan şablon iner.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Excel ile toplu kalem kartı</CardTitle>
          <CardDescription>
            Kapattığınız modülde &quot;Tedarikçi Talebi Oluştur&quot; sayfasındaki Excel kartı görünmez ve şablon
            indirilemez. Sizin yönetici hesabınız bu ayardan etkilenmez.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 pt-0">
          {EXCEL_MODULES.map((mod) => (
            <SwitchRow
              key={mod.id}
              title={mod.label}
              hint={mod.hint}
              checked={excelSettings?.[mod.id] ?? true}
              disabled={excelPending || excelSettingMutation.isPending}
              onChange={(next) => {
                queryClient.setQueryData<Record<string, boolean>>(
                  ['procurement-excel-import-settings'],
                  (prev) => ({ ...(prev || {}), [mod.id]: next })
                );
                excelSettingMutation.mutate({ moduleId: mod.id, isEnabled: next });
              }}
            />
          ))}
        </CardContent>
      </Card>

      {TEMPLATE_CARDS.map((card) => {
        const meta = data?.[card.id];
        return (
          <Card key={card.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Table className="w-5 h-5 text-primary" />
                {card.title}
              </CardTitle>
              <CardDescription>{card.columns}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isPending && !data ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Durum: </span>
                      {meta?.hasCustom ? (
                        <span className="font-medium text-foreground">Özel şablon yüklü</span>
                      ) : (
                        <span className="font-medium">Henüz özel şablon yok (varsayılan kullanılıyor)</span>
                      )}
                    </p>
                    {meta?.hasCustom && meta.originalName && (
                      <>
                        <p>
                          <span className="text-muted-foreground">Dosya: </span>
                          {meta.originalName}
                        </p>
                        {meta.size != null && (
                          <p>
                            <span className="text-muted-foreground">Boyut: </span>
                            {formatFileSize(meta.size)}
                          </p>
                        )}
                        {meta.updatedAt && (
                          <p>
                            <span className="text-muted-foreground">Güncellendi: </span>
                            {format(new Date(meta.updatedAt), 'dd MMM yyyy HH:mm', { locale: tr })}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={downloadMutation.isPending}
                      onClick={() => downloadMutation.mutate(card.id)}
                    >
                      {downloadMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Şablonu indir
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Yeni şablon yükle (.xlsx)</Label>
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={uploadMutation.isPending}
                      onClick={() => {
                        setUploadModuleId(card.id);
                        fileRef.current?.click();
                      }}
                    >
                      {uploadMutation.isPending && uploadModuleId === card.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Şablon dosyası seç ve kaydet
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          uploadMutation.mutate({ file: f, moduleId: uploadModuleId });
        }}
      />
    </div>
  );
}
