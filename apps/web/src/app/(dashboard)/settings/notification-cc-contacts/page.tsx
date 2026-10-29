'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationCcContactsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { SkeletonRows, Swap } from '@/components/page/Skeleton';
import { toast } from 'sonner';

const MAX_CONTACTS = 40;

type Row = {
  id: string;
  name: string;
  email: string;
  sortOrder: number;
};

export default function NotificationCcContactsSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const { data: rows = [], isPending } = useQuery<Row[]>({
    queryKey: ['notification-cc-contacts'],
    queryFn: async () => {
      const { data } = await notificationCcContactsApi.getAll();
      return data as Row[];
    },
    enabled: Boolean(user?.role === 'ADMIN'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      notificationCcContactsApi.create({
        name: name.trim(),
        email: email.trim(),
        sortOrder: parseInt(sortOrder, 10) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-cc-contacts'] });
      setName('');
      setEmail('');
      setSortOrder('0');
      toast.success('Kişi eklendi.');
    },
    onError: (e: unknown) => {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Eklenemedi.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationCcContactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-cc-contacts'] });
      toast.success('Silindi.');
    },
    onError: () => toast.error('Silinemedi.'),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('İsim girin.');
      return;
    }
    if (!email.trim()) {
      toast.error('E-posta girin.');
      return;
    }
    if (rows.length >= MAX_CONTACTS) {
      toast.error(`En fazla ${MAX_CONTACTS} kişi tanımlanabilir.`);
      return;
    }
    createMutation.mutate();
  };

  if (user && user.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground"><SmokeText text="Teklif mail kopyası" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tedarikçi talebi oluşturulurken seçilen kişilere teklif maili kopyalanır (CC). Tedarikçi bunu görür.
          Listeyi yalnız yönetici düzenler.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">Yeni kişi</CardTitle>
          <CardDescription>İsim ve kurumsal e-posta. Sıra no küçük olanlar listede önce görünür.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-4 space-y-1.5">
              <Label>İsim soyisim</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salih Uysal" />
            </div>
            <div className="sm:col-span-5 space-y-1.5">
              <Label>E-posta</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yonetici@ugurpromilling.com"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Sıra</Label>
              <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
            </div>
            <div className="sm:col-span-1 flex sm:justify-end">
              <Button
                type="submit"
                disabled={createMutation.isPending || rows.length >= MAX_CONTACTS}
                className="w-full sm:w-auto"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg">Kayıtlı kişiler</CardTitle>
            <CardDescription>
              {rows.length} / {MAX_CONTACTS}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Swap loading={isPending} skeleton={<SkeletonRows rows={4} />}>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">Henüz kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-card hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{r.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sıra: {r.sortOrder}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`"${r.name}" silinsin mi?`)) deleteMutation.mutate(r.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Sil
                  </Button>
                </li>
              ))}
            </ul>
          )}
          </Swap>
        </CardContent>
      </Card>
    </div>
  );
}
