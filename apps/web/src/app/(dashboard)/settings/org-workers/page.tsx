'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, orgWorkersApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Power, Trash2, X, Check } from 'lucide-react';
import { SkeletonRows, Swap } from '@/components/page/Skeleton';
import { cn } from '@/lib/utils';

type Dept = { id: string; name: string; collarType: string; isActive: boolean };
type Worker = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  departmentId: string;
  isActive: boolean;
  fullName?: string;
  department?: { id: string; name: string };
};

export default function OrgWorkersSettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ firstName: '', lastName: '', phone: '', departmentId: '' });

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, router]);

  const { data: departments = [] } = useQuery({
    queryKey: ['org-departments', 'BLUE_COLLAR'],
    queryFn: async () =>
      (await departmentsApi.getAll({ collarType: 'BLUE_COLLAR', active: true })).data as Dept[],
    enabled: user?.role === 'ADMIN',
  });

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['org-workers'],
    queryFn: async () => (await orgWorkersApi.getAll()).data as Worker[],
    enabled: user?.role === 'ADMIN',
  });

  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments]
  );

  const createMut = useMutation({
    mutationFn: () =>
      orgWorkersApi.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        departmentId: departmentId!,
      }),
    onSuccess: () => {
      setFirstName('');
      setLastName('');
      setPhone('');
      setDepartmentId(null);
      qc.invalidateQueries({ queryKey: ['org-workers'] });
      toast.success('Usta/çalışan eklendi.');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Eklenemedi');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      orgWorkersApi.update(id, data),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['org-workers'] });
      toast.success('Güncellendi.');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Kaydedilemedi');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => orgWorkersApi.delete(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['org-workers'] });
      toast.success(res.data?.deactivated ? 'Pasife alındı (bağlı talep var).' : 'Silindi.');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Silinemedi');
    },
  });

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><SmokeText text="Usta / Çalışan Yönetimi" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mavi yaka taleplerini kişi bazında takip etmek için. Login hesabı oluşturulmaz.
        </p>
      </div>

      <form
        className="space-y-3 rounded-lg border border-white/10 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!departmentId || firstName.trim().length < 1 || lastName.trim().length < 1) {
            toast.error('Ad, soyad ve birim gerekli.');
            return;
          }
          createMut.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ad"
            className="h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-white/25"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Soyad"
            className="h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-white/25"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon (opsiyonel)"
            className="h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-white/25"
          />
          <SearchableCombobox
            options={deptOptions}
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="Mavi yaka birim seçin"
            allowClear
          />
        </div>
        <button
          type="submit"
          disabled={createMut.isPending}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ekle
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-white/10">
        <Swap loading={isLoading} skeleton={<SkeletonRows rows={5} />}>
        {workers.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Henüz kayıt yok.</p>
        )}
        {workers.map((w) => {
          const editing = editingId === w.id;
          return (
            <div
              key={w.id}
              className={cn(
                'border-t border-white/10 px-4 py-2.5 first:border-t-0',
                !w.isActive && 'opacity-55'
              )}
            >
              {editing ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={editDraft.firstName}
                    onChange={(e) => setEditDraft((d) => ({ ...d, firstName: e.target.value }))}
                    className="h-9 flex-1 rounded-md border border-white/20 bg-black/40 px-2.5 text-sm"
                    placeholder="Ad"
                  />
                  <input
                    value={editDraft.lastName}
                    onChange={(e) => setEditDraft((d) => ({ ...d, lastName: e.target.value }))}
                    className="h-9 flex-1 rounded-md border border-white/20 bg-black/40 px-2.5 text-sm"
                    placeholder="Soyad"
                  />
                  <input
                    value={editDraft.phone}
                    onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                    className="h-9 flex-1 rounded-md border border-white/20 bg-black/40 px-2.5 text-sm"
                    placeholder="Telefon"
                  />
                  <div className="min-w-[180px] flex-1">
                    <SearchableCombobox
                      options={deptOptions}
                      value={editDraft.departmentId || null}
                      onChange={(v) => setEditDraft((d) => ({ ...d, departmentId: v || '' }))}
                      placeholder="Birim"
                    />
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1.5 hover:bg-white/10"
                    onClick={() =>
                      updateMut.mutate({
                        id: w.id,
                        data: {
                          firstName: editDraft.firstName.trim(),
                          lastName: editDraft.lastName.trim(),
                          phone: editDraft.phone.trim() || null,
                          departmentId: editDraft.departmentId,
                        },
                      })
                    }
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-md p-1.5 hover:bg-white/10" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {w.fullName || `${w.firstName} ${w.lastName}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {w.department?.name || '—'}
                      {w.phone ? ` · ${w.phone}` : ''}
                      {!w.isActive ? ' · Pasif' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10"
                    onClick={() => {
                      setEditingId(w.id);
                      setEditDraft({
                        firstName: w.firstName,
                        lastName: w.lastName,
                        phone: w.phone || '',
                        departmentId: w.departmentId,
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10"
                    onClick={() => updateMut.mutate({ id: w.id, data: { isActive: !w.isActive } })}
                  >
                    <Power className={cn('h-4 w-4', w.isActive ? 'text-emerald-400' : '')} />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    onClick={() => deleteMut.mutate(w.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        </Swap>
      </div>
    </div>
  );
}
