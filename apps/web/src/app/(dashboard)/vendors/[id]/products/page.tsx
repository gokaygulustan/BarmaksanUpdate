'use client';

import { SmokeText } from '@/components/SmokeText';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vendorsApi, catalogApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader2, FileText, Eye, Download, Trash2, AlertCircle, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/useAuthStore';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

export default function VendorCatalogsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const vendorId = resolvedParams.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: async () => {
      const { data } = await vendorsApi.getById(vendorId);
      return data;
    },
  });

  const { data: catalogs = [], isLoading: catalogsLoading } = useQuery({
    queryKey: ['catalogs', vendorId],
    queryFn: async () => {
      const { data } = await catalogApi.getAll();
      return data.filter((c: any) => c.vendorId === vendorId);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catalogApi.delete(id),
    onSuccess: () => {
      toast.success('Katalog silindi.');
      queryClient.invalidateQueries({ queryKey: ['catalogs', vendorId] });
    },
    onError: () => toast.error('Silinemedi, lütfen tekrar deneyin.'),
  });

  const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:4000';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="p-3 rounded-xl" style={{ background: 'hsl(48, 71%, 50%)', color: 'hsl(0, 0%, 8%)' }}>
          <BookOpen className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground"><SmokeText text="Ürün Katalogları" /></h1>
          <p className="text-muted-foreground text-sm mt-1">
            {vendorLoading ? 'Yükleniyor...' : `${vendor?.name} firmasına ait PDF kataloglar`}
          </p>
        </div>
      </div>

      <Card className="border-border shadow-md" style={{ background: 'hsl(0, 0%, 11%)' }}>
        <CardHeader className="pb-4 border-b border-border/50">
          <CardTitle className="text-lg">Yüklenen Kataloglar</CardTitle>
          <CardDescription>Tedarikçinin sisteme yüklediği ürün kataloglarını buradan inceleyebilirsiniz.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {catalogsLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Kataloglar yükleniyor...</span>
            </div>
          ) : catalogs.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 opacity-50">
              <AlertCircle className="w-10 h-10" />
              <p className="text-sm font-medium">Bu tedarikçiye ait katalog bulunmuyor</p>
              <p className="text-xs text-muted-foreground">Tedarikçi kendi paneli üzerinden PDF katalog yükleyebilir.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {catalogs.map((cat: any) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-red-500/10">
                      <FileText className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{cat.originalName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatBytes(cat.fileSize)}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">{formatDate(cat.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`${API_BASE}/${cat.filePath}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Görüntüle"
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                    <a
                      href={`${API_BASE}/${cat.filePath}`}
                      download={cat.originalName}
                      title="İndir"
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {user?.role === 'ADMIN' && (
                      <button
                        onClick={() => {
                          if (confirm('Bu kataloğu silmek istediğinize emin misiniz?')) {
                            deleteMutation.mutate(cat.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        title="Sil"
                        className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
