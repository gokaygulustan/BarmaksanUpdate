'use client';

import { SmokeText } from '@/components/SmokeText';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { toast } from 'sonner';
import { Check, Loader2, Pencil, Plus, Power, X } from 'lucide-react';
import { SkeletonRows, Swap } from '@/components/page/Skeleton';
import { cn } from '@/lib/utils';

type Collar = 'WHITE_COLLAR' | 'BLUE_COLLAR';
type Department = {
  id: string;
  name: string;
  collarType: Collar;
  isActive: boolean;
  requestCount?: number;
};

const collarLabel = (c: Collar) => (c === 'BLUE_COLLAR' ? 'Mavi yaka' : 'Beyaz yaka');

function DeptRow({
  dept,
  onSave,
  onToggleActive,
  busy,
}: {
  dept: Department;
  onSave: (patch: { name?: string; collarType?: Collar }) => void;
  onToggleActive: () => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dept.name);
  const [collar, setCollar] = useState<Collar>(dept.collarType || 'WHITE_COLLAR');
  const count = dept.requestCount ?? 0;

  useEffect(() => {
    if (!editing) {
      setDraft(dept.name);
      setCollar(dept.collarType || 'WHITE_COLLAR');
    }
  }, [dept.name, dept.collarType, editing]);

  const save = () => {
    const next = draft.trim();
    if (next.length < 2) {
      setDraft(dept.name);
      setEditing(false);
      return;
    }
    onSave({
      name: next !== dept.name ? next : undefined,
      collarType: collar !== dept.collarType ? collar : undefined,
    });
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-white/10 px-4 py-2.5 first:border-t-0',
        !dept.isActive && 'opacity-55'
      )}
    >
      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(dept.name);
                setEditing(false);
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-md border border-white/20 bg-black/40 px-2.5 text-sm outline-none focus:border-white/40"
          />
          <select
            value={collar}
            onChange={(e) => setCollar(e.target.value as Collar)}
            className="h-9 rounded-md border border-white/20 bg-black/40 px-2 text-sm"
          >
            <option value="WHITE_COLLAR">Beyaz yaka</option>
            <option value="BLUE_COLLAR">Mavi yaka</option>
          </select>
          <button type="submit" className="rounded-md p-1.5 text-foreground hover:bg-white/10" aria-label="Kaydet">
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10"
            onClick={() => {
              setDraft(dept.name);
              setEditing(false);
            }}
            aria-label="Vazgeç"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{dept.name}</span>
          <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {collarLabel(dept.collarType)}
          </span>
          {!dept.isActive ? (
            <span className="shrink-0 text-[11px] text-amber-400/90">Pasif</span>
          ) : null}
          <span className="shrink-0 text-[12px] text-muted-foreground">{count} talep</span>
          <button
            type="button"
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            onClick={() => setEditing(true)}
            aria-label="Düzenle"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            title={dept.isActive ? 'Pasife al' : 'Aktifleştir'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            onClick={onToggleActive}
            aria-label={dept.isActive ? 'Pasife al' : 'Aktifleştir'}
          >
            <Power className={cn('h-4 w-4', dept.isActive ? 'text-emerald-400' : 'text-muted-foreground')} />
          </button>
        </>
      )}
    </div>
  );
}

export default function DepartmentSettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [collarType, setCollarType] = useState<Collar>('WHITE_COLLAR');
  const [tab, setTab] = useState<'ALL' | Collar>('ALL');

  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, router]);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['org-departments'],
    queryFn: async () => (await departmentsApi.getAll()).data as Department[],
    enabled: user?.role === 'ADMIN',
  });

  const visible = useMemo(() => {
    if (tab === 'ALL') return departments;
    return departments.filter((d) => d.collarType === tab);
  }, [departments, tab]);

  const createMut = useMutation({
    mutationFn: () => departmentsApi.create({ name: name.trim(), collarType }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['org-departments'] });
      toast.success('Birim eklendi.');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Eklenemedi');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; collarType?: Collar; isActive?: boolean } }) =>
      departmentsApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-departments'] });
      qc.invalidateQueries({ queryKey: ['sa-inbox-board'] });
      qc.invalidateQueries({ queryKey: ['sa-inbox-counts'] });
      toast.success('Birim güncellendi.');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Kaydedilemedi');
    },
  });

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold"><SmokeText text="Birim Yönetimi" /></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Beyaz yaka birimler Birim Talepleri’nde; mavi yaka birimler Satın Alma’nın tedarik taleplerinde kullanılır.
        </p>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 2) return;
          createMut.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn. Kalite Kontrol"
          className="h-10 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-white/25"
        />
        <select
          value={collarType}
          onChange={(e) => setCollarType(e.target.value as Collar)}
          className="h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm"
        >
          <option value="WHITE_COLLAR">Beyaz yaka</option>
          <option value="BLUE_COLLAR">Mavi yaka</option>
        </select>
        <button
          type="submit"
          disabled={createMut.isPending || name.trim().length < 2}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ekle
        </button>
      </form>

      <div className="flex gap-1 rounded-md border border-white/10 p-1">
        {(
          [
            ['ALL', 'Tümü'],
            ['WHITE_COLLAR', 'Beyaz yaka'],
            ['BLUE_COLLAR', 'Mavi yaka'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-xs font-medium',
              tab === key ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:bg-white/5'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10">
        <Swap loading={isLoading} skeleton={<SkeletonRows rows={5} />}>
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Henüz birim yok.</p>
          )}
          {visible.map((dept) => (
            <DeptRow
              key={dept.id}
              dept={dept}
              busy={updateMut.isPending}
              onSave={(patch) => {
                if (!patch.name && !patch.collarType) return;
                updateMut.mutate({ id: dept.id, patch });
              }}
              onToggleActive={() =>
                updateMut.mutate({ id: dept.id, patch: { isActive: !dept.isActive } })
              }
            />
          ))}
        </Swap>
      </div>
    </div>
  );
}
