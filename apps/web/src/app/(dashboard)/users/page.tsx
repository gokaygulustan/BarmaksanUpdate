'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Users, UserPlus, Loader2, Trash2, Pencil, Power } from 'lucide-react';
import {
  EmptyState,
  IconButton,
  InitialTile,
  PageHeader,
  PrimaryButton,
  revealClass,
  RowBar,
  rowClass,
  SearchField,
  Segmented,
  SelectMenu,
  SkeletonRows,
  Swap,
  Tile,
  TileHeader,
} from '@/components/page/Page';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/useAuthStore';
import { useRouter } from 'next/navigation';

const userSchema = z
  .object({
    name: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır'),
    email: z.string().email('Geçerli bir e-posta adresi giriniz'),
    password: z.string().optional(),
    role: z.enum(['ADMIN', 'PURCHASING', 'SUPPLIER']),
    moduleId: z.string().optional(),
    subRole: z.enum(['MANAGER', 'STAFF', 'DIRECTOR', 'WAREHOUSE']),
  })
  // Depo Sorumlusu portala giriş yapmaz; şifre istenmez.
  .refine((d) => d.subRole === 'WAREHOUSE' || (d.password || '').length >= 6, {
    message: 'Şifre en az 6 karakter olmalıdır',
    path: ['password'],
  });

type UserFormData = z.infer<typeof userSchema>;

const SUB_ROLE_OPTIONS = [
  { value: 'STAFF', label: 'Personel' },
  { value: 'MANAGER', label: 'Birim Yetkilisi / Müdürü' },
  { value: 'WAREHOUSE', label: 'Depo Sorumlusu' },
];

function apiErrorMessage(error: any, fallback: string) {
  const data = error?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map((e: { message?: string }) => e.message).filter(Boolean).join(' · ') || fallback;
  }
  if (typeof data?.message === 'string' && data.message.trim() && data.message !== 'Validation error') {
    return data.message;
  }
  return fallback;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [statusView, setStatusView] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [unitView, setUnitView] = useState('');
  const { user: currentUser } = useAuthStore();

  const isAdmin = currentUser?.role === 'ADMIN';
  const canManageUsers =
    isAdmin ||
    (currentUser?.role === 'PURCHASING' && currentUser?.moduleId === 'URETIM_PLANLAMA');
  const managerModuleId = currentUser?.moduleId || 'URETIM_PLANLAMA';

  useEffect(() => {
    if (currentUser && !canManageUsers) router.replace('/dashboard');
  }, [currentUser, canManageUsers, router]);

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await usersApi.getAll();
      return data;
    },
    enabled: Boolean(canManageUsers),
  });

  const createMutation = useMutation({
    mutationFn: (newUser: UserFormData) => usersApi.create(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Birim kullanıcısı başarıyla oluşturuldu');
      setIsDialogOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(apiErrorMessage(error, 'Kullanıcı oluşturulurken bir hata oluştu'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Kullanıcı güncellendi');
      setIsEditOpen(false);
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast.error(apiErrorMessage(error, 'Kullanıcı güncellenirken bir hata oluştu'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await usersApi.delete(userId);
      return res;
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (res?.status === 204) {
        toast.success('Kullanıcı silindi');
      } else {
        toast.success(
          res?.data?.message ||
            'Bu kullanıcıya bağlı kayıtlar var; hesap pasife alındı.'
        );
      }
    },
    onError: (error: any) => {
      toast.error(apiErrorMessage(error, 'Kullanıcı silinemedi.'));
    },
  });

  const activateMutation = useMutation({
    mutationFn: (userId: string) => usersApi.update(userId, { isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Hesap yeniden aktifleştirildi');
    },
    onError: (error: any) => {
      toast.error(apiErrorMessage(error, 'Hesap aktifleştirilemedi.'));
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      role: 'PURCHASING',
      subRole: 'STAFF',
      moduleId: managerModuleId,
    },
  });

  const isWarehouseSelected = watch('subRole') === 'WAREHOUSE';

  const onSubmit = (data: UserFormData) => {
    const payload = {
      ...data,
      moduleId: isAdmin ? (data.moduleId || managerModuleId) : managerModuleId,
      // Depo Sorumlusu giriş yapmadığı için şifre gönderilmez; sunucu tarafında üretilir.
      password: data.subRole === 'WAREHOUSE' ? undefined : data.password,
    };
    createMutation.mutate(payload);
  };

  const onEditSubmit = (data: any) => {
    if (!editingUser) return;
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      payload[key] = trimmed;
    }

    if (payload.password && payload.password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır');
      return;
    }

    if (isAdmin && payload.accessProfile) {
      const profile = payload.accessProfile;
      delete payload.accessProfile;
      const profiles: Record<string, { role: string; moduleId: string; subRole: string }> = {
        BIRIM_OTP: { role: 'DEPARTMENT', moduleId: 'BIRIM', subRole: 'STAFF' },
        SA_STAFF: { role: 'PURCHASING', moduleId: 'SATIN_ALMA', subRole: 'STAFF' },
        SA_MANAGER: { role: 'PURCHASING', moduleId: 'SATIN_ALMA', subRole: 'MANAGER' },
        SA_WAREHOUSE: { role: 'PURCHASING', moduleId: 'SATIN_ALMA', subRole: 'WAREHOUSE' },
        UP_STAFF: { role: 'PURCHASING', moduleId: 'URETIM_PLANLAMA', subRole: 'STAFF' },
        UP_MANAGER: { role: 'PURCHASING', moduleId: 'URETIM_PLANLAMA', subRole: 'MANAGER' },
        YP_STAFF: { role: 'PURCHASING', moduleId: 'YEDEK_PARCA', subRole: 'STAFF' },
        ADMIN: { role: 'ADMIN', moduleId: 'IT_DIRECTORATE', subRole: 'STAFF' },
      };
      const mapped = profiles[profile];
      if (mapped) Object.assign(payload, mapped);
    }

    updateMutation.mutate({ id: editingUser.id, data: payload });
  };

  const editAccessProfileDefault = (u: any) => {
    if (u.role === 'ADMIN') return 'ADMIN';
    if (u.role === 'DEPARTMENT' || u.moduleId === 'BIRIM') return 'BIRIM_OTP';
    if (u.moduleId === 'SATIN_ALMA') {
      if (u.subRole === 'MANAGER') return 'SA_MANAGER';
      if (u.subRole === 'WAREHOUSE') return 'SA_WAREHOUSE';
      return 'SA_STAFF';
    }
    if (u.moduleId === 'URETIM_PLANLAMA') {
      return u.subRole === 'MANAGER' ? 'UP_MANAGER' : 'UP_STAFF';
    }
    if (u.moduleId === 'YEDEK_PARCA') return 'YP_STAFF';
    return 'SA_STAFF';
  };

  const filteredUsers = users.filter((u: any) => {
    const raw = searchTerm.trim().toLowerCase();
    if (!raw) return true;
    const compact = raw.replace(/[-._\s]/g, '');
    const fields = [u.name, u.email, String(u.email || '').split('@')[0]];
    return fields.some((f) => {
      const s = String(f || '').toLowerCase();
      return s.includes(raw) || s.replace(/[-._\s]/g, '').includes(compact);
    });
  });

  const getModuleLabel = (u: any) => {
    if (u.role === 'DEPARTMENT' || u.moduleId === 'BIRIM') return 'Birim talebi';
    if (u.moduleId === 'SATIN_ALMA') return 'Satın Alma Birimi';
    if (u.moduleId === 'YEDEK_PARCA') return 'Yedek Parça Birimi';
    if (u.moduleId === 'IT_DIRECTORATE') return 'Bilgi Teknolojileri';
    return 'Üretim Planlama Birimi';
  };

  const getTitleLabel = (u: any) => {
    if (u.role === 'ADMIN') return 'Sistem Yöneticisi';
    if (u.role === 'DEPARTMENT') return 'Birim kullanıcısı';
    if (u.role === 'SUPPLIER') return 'Tedarikçi Firma';
    if (u.subRole === 'WAREHOUSE') return 'Depo Sorumlusu';
    const isManager = u.subRole === 'MANAGER';
    if (u.moduleId === 'SATIN_ALMA') {
      return isManager ? 'Satın Alma Birimi Yetkilisi' : 'Satın Alma Birimi Personeli';
    }
    if (u.moduleId === 'YEDEK_PARCA') {
      return isManager ? 'Yedek Parça Birimi Yetkilisi' : 'Yedek Parça Birimi Personeli';
    }
    return isManager ? 'Üretim Planlama Birimi Yetkilisi' : 'Üretim Planlama Birimi Personeli';
  };

  /** Grup adı: sistem yöneticileri ayrı, diğerleri birimine göre. */
  const groupLabel = (u: any) => (u.role === 'ADMIN' ? 'Sistem yöneticileri' : getModuleLabel(u));
  const GROUP_ORDER = [
    'Sistem yöneticileri',
    'Satın Alma Birimi',
    'Üretim Planlama Birimi',
    'Yedek Parça Birimi',
    'Bilgi Teknolojileri',
    'Birim talebi',
  ];
  const unitOptions = [
    { value: '', label: 'Tüm birimler' },
    ...GROUP_ORDER.filter((label) => users.some((u: any) => groupLabel(u) === label)).map((label) => ({
      value: label,
      label,
      hint: String(users.filter((u: any) => groupLabel(u) === label).length),
    })),
  ];
  const visibleUsers = filteredUsers.filter(
    (u: any) =>
      (statusView === 'ALL' || (statusView === 'ACTIVE' ? u.isActive !== false : u.isActive === false)) &&
      (!unitView || groupLabel(u) === unitView),
  );
  const isManagerUser = (u: any) => u.role === 'ADMIN' || u.subRole === 'MANAGER';
  const userGroups = GROUP_ORDER.map((label) => {
    const list = visibleUsers
      .filter((u: any) => groupLabel(u) === label)
      .sort(
        (a: any, b: any) =>
          Number(isManagerUser(b)) - Number(isManagerUser(a)) || String(a.name).localeCompare(String(b.name), 'tr'),
      );
    return { label, users: list, managers: list.filter(isManagerUser).length };
  }).filter((g) => g.users.length > 0);

  const openEditFor = (u: any) => {
    setEditingUser(u);
    setIsEditOpen(true);
  };

  const unitName = managerModuleId === 'SATIN_ALMA' ? 'Satın Alma' : 'Üretim Planlama';
  const labelClass = 'text-[12.5px] font-medium text-white/60';
  const inputClass = 'h-11 rounded-[12px] border-white/[0.08] bg-white/[0.03] text-[14px] text-white';

  return (
    <div className="mx-auto w-full max-w-[1400px] pb-8">
      <PageHeader
        title="Kullanıcılar"
        description={
          isAdmin
            ? 'Sistemdeki tüm birim yöneticilerini ve personel hesaplarını yönetin.'
            : `${unitName} biriminize ait personelleri ekleyin, düzenleyin veya çıkarın.`
        }
        actions={
          <PrimaryButton icon={<UserPlus className="size-[18px]" strokeWidth={1.9} />} onClick={() => setIsDialogOpen(true)}>
            Yeni kullanıcı
          </PrimaryButton>
        }
      />

      {/* Üst kısım tek satır: arama, durum (sayılar segmentte) ve birim. Büyük sayı kutuları yok. */}
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="İsim veya e-posta ara"
          label="Kullanıcı ara"
          className="lg:flex-1"
        />
        <Segmented
          label="Hesap durumu"
          value={statusView}
          onChange={setStatusView}
          options={[
            { value: 'ALL', label: 'Tümü', count: filteredUsers.length },
            { value: 'ACTIVE', label: 'Aktif', count: filteredUsers.filter((u: any) => u.isActive !== false).length },
            { value: 'INACTIVE', label: 'Pasif', count: filteredUsers.filter((u: any) => u.isActive === false).length },
          ]}
        />
        {unitOptions.length > 2 ? (
          <SelectMenu
            label="Birim"
            value={unitView}
            onChange={setUnitView}
            active={Boolean(unitView)}
            align="end"
            className="lg:w-60"
            options={unitOptions}
          />
        ) : null}
      </div>

      {/* Hesaplar birime göre gruplu (Ayarlar'daki gruplu liste gibi); grupta önce yetkililer, sonra ada göre. */}
      <Swap
        loading={usersLoading}
        skeleton={
          <Tile>
            <SkeletonRows rows={7} />
          </Tile>
        }
      >
      {userGroups.length === 0 ? (
        <Tile>
          <EmptyState icon={<Users />} title="Kullanıcı bulunamadı" body="Aramayı, durumu veya birimi değiştirip yeniden deneyin." />
        </Tile>
      ) : (
        <div className="space-y-4">
          {userGroups.map((group) => (
            <Tile key={group.label}>
              <TileHeader
                title={group.label}
                aside={`${group.users.length} kişi${group.managers ? ` · ${group.managers} yetkili` : ''}`}
              />
              <div className="divide-y divide-white/[0.05]">
                {group.users.map((u: any) => {
                  const active = u.isActive !== false;
                  const manager = u.role === 'ADMIN' || u.subRole === 'MANAGER';
                  const canDeleteUser = currentUser?.id !== u.id && (isAdmin || u.subRole !== 'MANAGER');
                  return (
                    <div
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditFor(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openEditFor(u);
                      }}
                      className={cn(rowClass, 'flex cursor-pointer items-center gap-4 px-6 py-3.5 outline-none')}
                    >
                      <RowBar />
                      <div className="flex min-w-0 flex-1 items-center gap-3.5 transition-transform duration-300 ease-out group-hover/row:translate-x-1">
                        <InitialTile name={u.name} className={cn(!active && 'opacity-45')} />
                        <div className="min-w-0">
                          <p className={cn('truncate text-[14.5px] font-medium leading-snug', active ? 'text-white' : 'text-white/50')}>
                            {u.name}
                            {currentUser?.id === u.id ? <span className="ml-2 text-[12px] font-normal text-white/40">Siz</span> : null}
                            {manager ? <span className="ml-2 text-[12px] font-normal text-brand-ink">Yetkili</span> : null}
                          </p>
                          <p className="mt-0.5 truncate text-[12.5px] text-white/40">{u.email}</p>
                        </div>
                      </div>
                      <p className="hidden w-[240px] shrink-0 truncate text-[13px] text-white/60 md:block">{getTitleLabel(u)}</p>
                      <span className={cn('w-[52px] shrink-0 text-right text-[12.5px]', active ? 'text-transparent' : 'text-white/40')}>
                        {active ? '' : 'Pasif'}
                      </span>
                      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <IconButton label="Düzenle" className={revealClass} onClick={() => openEditFor(u)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        {!active ? (
                          <IconButton
                            label="Aktifleştir"
                            disabled={activateMutation.isPending}
                            onClick={() => activateMutation.mutate(u.id)}
                          >
                            <Power className="size-4" />
                          </IconButton>
                        ) : null}
                        {canDeleteUser ? (
                          <IconButton
                            label="Sil"
                            tone="danger"
                            className={revealClass}
                            onClick={() => {
                              if (confirm(`${u.name} isimli kullanıcıyı silmek istediğinize emin misiniz?`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Tile>
          ))}
        </div>
      )}
      </Swap>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[440px] bg-card border-white/[0.08] text-white rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-medium tracking-[-0.015em] text-white">Yeni kullanıcı</DialogTitle>
            <DialogDescription className="text-[13px] text-white/50">
              {isAdmin
                ? 'İstediğiniz birim için yeni bir yetkili veya personel tanımlayın.'
                : `Yalnızca ${unitName} biriminize kullanıcı ekleyebilirsiniz.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className={labelClass}>Ad soyad</Label>
              <Input {...register('name')} placeholder="Örn: Ahmet Yılmaz" className={inputClass} />
              {errors.name && <p className="text-[12px] text-[#f2705e]">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>E-posta adresi</Label>
              <Input type="email" {...register('email')} placeholder="ayilmaz@ugurpromilling.com" className={inputClass} />
              {errors.email && <p className="text-[12px] text-[#f2705e]">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>Unvan / yetki tipi</Label>
              <input type="hidden" {...register('subRole')} />
              <SelectMenu
                label="Unvan / yetki tipi"
                inline
                value={watch('subRole')}
                onChange={(v) => setValue('subRole', v as UserFormData['subRole'], { shouldValidate: true })}
                options={SUB_ROLE_OPTIONS}
              />
              <p className="text-[12px] leading-relaxed text-white/40">
                Depo Sorumlusu portala giriş yapamaz; yalnızca fiyatsız depo teslim listesi e-postasını alır.
              </p>
            </div>

            {!isWarehouseSelected && (
              <div className="space-y-1.5">
                <Label className={labelClass}>Giriş şifresi</Label>
                <Input type="password" {...register('password')} className={inputClass} />
                {errors.password && <p className="text-[12px] text-[#f2705e]">{errors.password.message}</p>}
              </div>
            )}

            {isAdmin && (
              <div className="space-y-1.5">
                <Label className={labelClass}>Ait olduğu birim</Label>
                <input type="hidden" {...register('moduleId')} />
                <SelectMenu
                  label="Ait olduğu birim"
                  inline
                  value={watch('moduleId') || managerModuleId}
                  onChange={(v) => setValue('moduleId', v, { shouldValidate: true })}
                  options={[
                    { value: 'SATIN_ALMA', label: 'Satın Alma Birimi' },
                    { value: 'URETIM_PLANLAMA', label: 'Üretim Planlama Birimi' },
                    { value: 'YEDEK_PARCA', label: 'Yedek Parça Birimi' },
                    { value: 'IT_DIRECTORATE', label: 'Bilgi Teknolojileri' },
                  ]}
                />
              </div>
            )}

            <DialogFooter className="pt-2">
              <PrimaryButton type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Kullanıcıyı kaydet'}
              </PrimaryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[440px] bg-card border-white/[0.08] text-white rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-medium tracking-[-0.015em] text-white">Kullanıcıyı düzenle</DialogTitle>
            {editingUser ? (
              <DialogDescription className="text-[13px] text-white/50">{editingUser.email}</DialogDescription>
            ) : null}
          </DialogHeader>
          {editingUser && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = Object.fromEntries(formData.entries());
                onEditSubmit(data);
              }}
              className="space-y-4 py-2"
            >
              <div className="space-y-1.5">
                <Label className={labelClass}>Ad soyad</Label>
                <Input name="name" defaultValue={editingUser.name} className={inputClass} required />
              </div>

              <div className="space-y-1.5">
                <Label className={labelClass}>E-posta adresi</Label>
                <Input name="email" defaultValue={editingUser.email} type="email" className={inputClass} required />
              </div>

              {isAdmin ? (
                <div className="space-y-1.5">
                  <Label className={labelClass}>Görev / yetki</Label>
                  <SelectMenu
                    label="Görev / yetki"
                    inline
                    name="accessProfile"
                    defaultValue={editAccessProfileDefault(editingUser)}
                    searchable={false}
                    options={[
                      { value: 'BIRIM_OTP', label: 'Birim kullanıcısı (OTP /birim girişi)' },
                      { value: 'SA_STAFF', label: 'Satın Alma Personeli', group: 'Satın Alma' },
                      { value: 'SA_MANAGER', label: 'Satın Alma Birimi Yetkilisi', group: 'Satın Alma' },
                      { value: 'SA_WAREHOUSE', label: 'Depo Sorumlusu', group: 'Satın Alma' },
                      { value: 'UP_STAFF', label: 'Üretim Planlama Personeli', group: 'Üretim Planlama' },
                      { value: 'UP_MANAGER', label: 'Üretim Planlama Yetkilisi', group: 'Üretim Planlama' },
                      { value: 'YP_STAFF', label: 'Yedek Parça Personeli', group: 'Yedek Parça' },
                      { value: 'ADMIN', label: 'Sistem yöneticisi', group: 'Yönetim' },
                    ]}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className={labelClass}>Unvan / yetki tipi</Label>
                  <SelectMenu
                    label="Unvan / yetki tipi"
                    inline
                    name="subRole"
                    defaultValue={editingUser.subRole || 'STAFF'}
                    options={SUB_ROLE_OPTIONS}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className={labelClass}>Yeni şifre (isteğe bağlı)</Label>
                <Input
                  name="password"
                  type="password"
                  placeholder="En az 6 karakter; değiştirmeyecekseniz boş bırakın"
                  className={cn(inputClass, 'text-[13px]')}
                />
              </div>

              <DialogFooter className="pt-2">
                <PrimaryButton type="submit" className="w-full" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Değişiklikleri kaydet'}
                </PrimaryButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
