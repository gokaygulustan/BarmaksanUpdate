'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, FolderKanban, Loader2, Plus, Trash2 } from 'lucide-react';
import { procurementApi, departmentsApi, orgWorkersApi, projectsApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from 'sonner';
import { procurementStatusLabel } from '@/lib/procurementStatus';
import { useAuthStore } from '@/stores/useAuthStore';
import { canCreateStandaloneRfq, isSatinAlmaPurchasing, projectLabel } from '@/lib/access';
import { DocumentTitle } from '@/components/DocumentTitle';
import { PrimaryLink } from '@/components/requests/RequestBoard';
import {
  comboControlClass,
  Dot,
  EmptyState,
  IconButton,
  Initial,
  PageHeader,
  revealClass,
  RowArrow,
  RowBar,
  rowClass,
  SearchField,
  SecondaryButton,
  SelectMenu,
  SkeletonRows,
  StatusChip,
  Swap,
  Tile,
  TileHeader,
} from '@/components/page/Page';
import { cn } from '@/lib/utils';

type ProjectOption = {
  id: string;
  code?: string | null;
  name: string;
  isDefault?: boolean;
  isActive?: boolean;
  requestCount?: number;
};

function groupByProject(rows: any[]) {
  const groups = new Map<string, { project: ProjectOption | null; rows: any[] }>();
  for (const row of rows) {
    const key = row.project?.id || '_none';
    const current = groups.get(key);
    if (current) current.rows.push(row);
    else groups.set(key, { project: row.project || null, rows: [row] });
  }
  const rank = (project: ProjectOption | null) => (!project ? 2 : project.isDefault ? 1 : 0);
  return [...groups.values()].sort((a, b) => {
    const byKind = rank(a.project) - rank(b.project);
    if (byKind) return byKind;
    return String(b.project?.code || '').localeCompare(String(a.project?.code || ''), 'tr', { numeric: true });
  });
}

export default function ProcurementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get('round') === 'complete' ? 'QUOTE_ROUND_COMPLETE' : 'ALL'
  );
  const [invoiceFilter, setInvoiceFilter] = useState<'ALL' | 'MISSING' | 'DONE'>('ALL');
  const [shopDepartmentId, setShopDepartmentId] = useState<string | null>(null);
  const [shopWorkerId, setShopWorkerId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [draftName, setDraftName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const isSupplier = user?.role === 'SUPPLIER';
  const canDelete = user?.role === 'ADMIN';
  const canFilterShop = user?.role === 'ADMIN' || isSatinAlmaPurchasing(user);
  const canUseProjects =
    user?.role === 'ADMIN' || (user?.role === 'PURCHASING' && user?.moduleId === 'URETIM_PLANLAMA');
  const listTitle = isSupplier ? 'Teklif Verme' : 'Tedarikçi talepleri';

  useEffect(() => {
    if (searchParams.get('round') === 'complete') setStatusFilter('QUOTE_ROUND_COMPLETE');
  }, [searchParams]);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['procurement', shopDepartmentId, shopWorkerId],
    queryFn: async () => {
      const { data } = await procurementApi.getAll({
        ...(shopDepartmentId ? { shopDepartmentId } : {}),
        ...(shopWorkerId ? { shopWorkerId } : {}),
      });
      return data;
    },
  });

  const { data: blueDepartments = [] } = useQuery({
    queryKey: ['org-departments', 'BLUE_COLLAR'],
    queryFn: async () =>
      (await departmentsApi.getAll({ collarType: 'BLUE_COLLAR' })).data as { id: string; name: string }[],
    enabled: canFilterShop,
  });

  const { data: orgWorkers = [] } = useQuery({
    queryKey: ['org-workers', shopDepartmentId],
    queryFn: async () =>
      (
        await orgWorkersApi.getAll({
          ...(shopDepartmentId ? { departmentId: shopDepartmentId } : {}),
        })
      ).data as { id: string; firstName: string; lastName: string; fullName?: string }[],
    enabled: canFilterShop,
  });

  const blueDeptOptions = useMemo(
    () => blueDepartments.map((d) => ({ value: d.id, label: d.name })),
    [blueDepartments]
  );
  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['procurement-projects'],
    queryFn: async () => (await projectsApi.list({ includeInactive: true })).data,
    enabled: canUseProjects,
  });
  const activeProjects = projects.filter((p) => p.isActive !== false);
  const projectOptions = activeProjects.map((p) => ({
    value: p.id,
    label: projectLabel(p),
    hint: p.requestCount ? String(p.requestCount) : undefined,
  }));

  const moveMutation = useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      procurementApi.update(id, { projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-projects'] });
    },
    onError: () => toast.error('Talep projeye taşınamadı.'),
  });

  const createProjectMutation = useMutation({
    mutationFn: () => projectsApi.create({ code: draftCode.trim() || null, name: draftName.trim() }),
    onSuccess: async () => {
      setDraftCode('');
      setDraftName('');
      await queryClient.invalidateQueries({ queryKey: ['procurement-projects'] });
      toast.success('Proje oluşturuldu.');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Proje oluşturulamadı.',
      );
    },
  });

  const workerOptions = useMemo(
    () =>
      orgWorkers.map((w) => ({
        value: w.id,
        label: w.fullName || `${w.firstName} ${w.lastName}`,
      })),
    [orgWorkers]
  );

  const saveProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean } }) =>
      projectsApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['procurement-projects'] }),
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Proje güncellenemedi.',
      );
    },
  });

  const removeProjectMutation = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-projects'] });
      toast.success('Proje silindi.');
    },
    onError: (e: unknown) => {
      toast.error(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Proje silinemedi.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => procurementApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-analysis'] });
      toast.success('Tedarikçi talebi silindi.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Silme işlemi başarısız oldu.'),
  });

  const filteredRequests = requests.filter((r: any) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.assignments?.some((a: any) =>
        a.vendor.name.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      String(r.project?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.project?.code || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'QUOTE_ROUND_COMPLETE'
        ? Boolean(r.quoteRoundComplete)
        : r.status === statusFilter);
    const missingInvoice = r.status === 'COMPLETED' && !r.invoiceUploadedAt;
    const hasInvoice = r.status === 'COMPLETED' && Boolean(r.invoiceUploadedAt);
    const matchesInvoice =
      invoiceFilter === 'ALL' ||
      (invoiceFilter === 'MISSING' && missingInvoice) ||
      (invoiceFilter === 'DONE' && hasInvoice);
    const matchesProject =
      !canUseProjects || projectFilter === 'ALL' || (r.project?.id || '') === projectFilter;
    return matchesSearch && matchesStatus && matchesInvoice && matchesProject;
  });
  const requestSections =
    canUseProjects && projectFilter === 'ALL'
      ? groupByProject(filteredRequests)
      : [{ project: null as ProjectOption | null, rows: filteredRequests }];
  const showProjectGroups = canUseProjects && projectFilter === 'ALL';
  const filterCount = 1 + (canFilterShop ? 2 : 0) + (canUseProjects ? 1 : 0);
  const filtersActive =
    Boolean(searchTerm || shopDepartmentId || shopWorkerId) ||
    statusFilter !== 'ALL' ||
    invoiceFilter !== 'ALL' ||
    projectFilter !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setShopDepartmentId(null);
    setShopWorkerId(null);
    setStatusFilter('ALL');
    setInvoiceFilter('ALL');
    setProjectFilter('ALL');
  };

  const openRequest = (req: any) => {
    router.push(req.status === 'DRAFT' ? `/procurement/new?edit=${req.id}` : `/procurement/${req.id}`);
  };

  /**
   * Satır (dashboard'daki "Son tedarikçi talepleri" gibi): solda başlık ve bilgi satırı, sağda
   * firmalar, hareketli durum ikonu, sil ve ok. Üzerine gelince altın dolgu, soldan çizgi, içerik kayar.
   */
  const renderRow = (req: any) => {
    const totalItems = req.items?.length || 0;
    const vendorsArr = req.assignments?.map((a: any) => a.vendor) || [];
    const attCount = req.attachments?.length ?? 0;
    const draft = req.status === 'DRAFT';
    const canMove = canUseProjects && req.moduleId !== 'SATIN_ALMA' && req.moduleId !== 'YEDEK_PARCA';

    return (
      <div
        key={req.id}
        role="link"
        tabIndex={0}
        onClick={() => openRequest(req)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openRequest(req);
        }}
        className={cn(
          rowClass,
          'flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-3 px-6 py-4 outline-none md:flex-nowrap',
        )}
      >
        <RowBar />
        <div className="min-w-0 flex-1 basis-full transition-transform duration-300 ease-out group-hover/row:translate-x-1 md:basis-auto">
          <p className="truncate text-[14.5px] font-medium leading-snug text-white">{req.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/40">
            <span className="tabular-nums">{totalItems} kalem</span>
            {attCount > 0 ? (
              <>
                <Dot />
                <span className="tabular-nums">{attCount} ek</span>
              </>
            ) : null}
            {req.createdBy?.name ? (
              <>
                <Dot />
                <span>{req.createdBy.name}</span>
              </>
            ) : null}
            <Dot />
            <span className="tabular-nums">{format(new Date(req.createdAt), 'dd MMM yyyy', { locale: tr })}</span>
            {req.status === 'COMPLETED' ? (
              <>
                <Dot />
                {req.invoiceUploadedAt ? (
                  <span>Faturalı</span>
                ) : (
                  <span className="font-medium text-brand-ink">Fatura bekleniyor</span>
                )}
              </>
            ) : null}
          </div>
        </div>

        {canMove ? (
          <div className="w-full md:w-auto" onClick={(e) => e.stopPropagation()}>
            <SelectMenu
              label="Projeye taşı"
              value={req.project?.id || ''}
              placeholder="Proje seçin"
              options={projectOptions}
              onChange={(next) => {
                if (next && next !== req.project?.id) moveMutation.mutate({ id: req.id, projectId: next });
              }}
              size="sm"
              variant="ghost"
              className="md:w-40"
            />
          </div>
        ) : null}

        <div className="hidden w-[120px] shrink-0 items-center xl:flex" aria-label="İlgili firmalar">
          {vendorsArr.length > 0 ? (
            <div className="flex -space-x-1.5">
              {vendorsArr.slice(0, 3).map((v: any, idx: number) => (
                <Initial key={idx} name={v.name} />
              ))}
              {vendorsArr.length > 3 ? (
                <span
                  title={`${vendorsArr.length - 3} firma daha`}
                  className="inline-flex size-7 items-center justify-center rounded-full bg-[#26262a] text-[11px] font-medium tabular-nums text-white/55 ring-2 ring-card"
                >
                  +{vendorsArr.length - 3}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-[12px] text-white/30">Firma yok</span>
          )}
        </div>

        <StatusChip
          status={req.status}
          label={procurementStatusLabel(req.status) || req.status}
          className="w-[210px] shrink-0 max-md:w-auto"
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {canDelete ? (
            <IconButton
              label="Talebi sil"
              tone="danger"
              className={revealClass}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget({ id: req.id, title: req.title });
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          ) : null}
          {draft ? (
            <span className="text-[12.5px] font-medium text-white/40 transition-colors duration-300 group-hover/row:text-brand">
              Devam et
            </span>
          ) : null}
          <RowArrow />
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <DocumentTitle topic={listTitle} />
      <PageHeader
        tour="rfq-list-head"
        title={isSupplier ? 'Teklif verme' : 'Tedarikçi talepleri'}
        description={
          isSupplier
            ? 'Size iletilen teklif talepleri ve durumları.'
            : 'Tedarikçilere gönderilen teklif talepleri ve durumları.'
        }
        actions={
          !isSupplier ? (
            <>
              {canUseProjects ? (
                <SecondaryButton icon={<FolderKanban className="size-4" strokeWidth={1.8} />} onClick={() => setProjectsOpen(true)}>
                  Projeler
                </SecondaryButton>
              ) : null}
              <PrimaryLink
                href="/procurement/new"
                tour="rfq-list-new"
                icon={<Plus className="size-[18px]" strokeWidth={1.9} />}
              >
                {canCreateStandaloneRfq(user) ? 'Yeni tedarikçi talebi' : 'Yetkiliye talep'}
              </PrimaryLink>
            </>
          ) : null
        }
      />

      {/* Süzgeç: arama geniş; seçiciler sığdığı kadar yan yana, sığmayan alta geçer. */}
      <div data-tour="rfq-list-filters" className="mb-6 flex flex-col gap-2 xl:flex-row">
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Talep, tedarikçi veya proje ara"
          label="Tedarikçi talebi ara"
          className="xl:flex-[1.4]"
        />
        <div
          className={cn(
            'grid min-w-0 gap-2 xl:flex-[2.6]',
            filterCount >= 4 ? 'grid-cols-2 md:grid-cols-4' : filterCount === 3 ? 'grid-cols-1 sm:grid-cols-3' : filterCount === 2 ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
        {canFilterShop ? (
          <>
            <SearchableCombobox
              options={blueDeptOptions}
              value={shopDepartmentId}
              onChange={(v) => {
                setShopDepartmentId(v);
                setShopWorkerId(null);
              }}
              placeholder="Mavi yaka birim"
              allowClear
              className="min-w-0"
              controlClassName={cn(comboControlClass, shopDepartmentId && 'border-brand/45 bg-brand/[0.06]')}
            />
            <SearchableCombobox
              options={workerOptions}
              value={shopWorkerId}
              onChange={setShopWorkerId}
              placeholder="Usta / çalışan"
              allowClear
              className="min-w-0"
              controlClassName={cn(comboControlClass, shopWorkerId && 'border-brand/45 bg-brand/[0.06]')}
            />
          </>
        ) : null}
        {canUseProjects ? (
          <SelectMenu
            label="Proje"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[{ value: 'ALL', label: 'Tüm projeler' }, ...projectOptions]}
            active={projectFilter !== 'ALL'}
          />
        ) : null}
        {/* Fatura süzgeci yalnızca tamamlananlara uyar; bu yüzden durumla aynı menüde, ayrı grupta. */}
        <SelectMenu
          label="Durum"
          value={invoiceFilter !== 'ALL' ? `INVOICE_${invoiceFilter}` : statusFilter}
          onChange={(next) => {
            if (next.startsWith('INVOICE_')) {
              setStatusFilter('ALL');
              setInvoiceFilter(next.slice('INVOICE_'.length) as 'MISSING' | 'DONE');
            } else {
              setInvoiceFilter('ALL');
              setStatusFilter(next);
            }
          }}
          active={statusFilter !== 'ALL' || invoiceFilter !== 'ALL'}
          menuWidth={300}
          searchable={false}
          options={[
            { value: 'ALL', label: 'Tüm durumlar' },
            { value: 'DRAFT', label: 'Taslaklar', group: 'Durum' },
            { value: 'SENT_TO_VENDOR', label: 'Tedarikçiye iletilenler', group: 'Durum' },
            { value: 'VENDOR_QUOTED', label: 'Teklif gelenler', group: 'Durum' },
            ...(!isSupplier
              ? [{ value: 'QUOTE_ROUND_COMPLETE', label: 'Tamamlanan teklifler (hepsi / süre doldu)', group: 'Durum' }]
              : []),
            { value: 'PENDING_MANAGER_APPROVAL', label: 'Yetkili onayı bekleyenler', group: 'Durum' },
            { value: 'PENDING_ADMIN_APPROVAL', label: 'Üst yönetim onayı bekleyenler', group: 'Durum' },
            { value: 'APPROVED_FOR_PURCHASE', label: 'Satın alma aşamasında', group: 'Durum' },
            { value: 'COMPLETED', label: 'Tamamlananlar', group: 'Durum' },
            { value: 'VENDOR_APPROVED', label: 'Onaylananlar', group: 'Durum' },
            { value: 'HAS_ISSUES', label: 'Sorunlu talepler', group: 'Durum' },
            { value: 'CANCELLED', label: 'İptal edilenler', group: 'Durum' },
            { value: 'INVOICE_MISSING', label: 'Faturasız tamamlananlar', group: 'Fatura' },
            { value: 'INVOICE_DONE', label: 'Faturası yüklü', group: 'Fatura' },
          ]}
        />
        </div>
      </div>

      <div data-tour="rfq-list-rows">
        <Swap
          loading={isLoading}
          skeleton={
            <Tile>
              <SkeletonRows rows={7} />
            </Tile>
          }
        >
        {filteredRequests.length === 0 ? (
          <Tile>
            <EmptyState
              icon={<ClipboardList />}
              title={filtersActive ? 'Eşleşen talep yok' : 'Henüz tedarikçi talebi yok'}
              body={
                filtersActive
                  ? 'Aramayı veya süzgeçleri değiştirip yeniden deneyin.'
                  : 'Oluşturulan talepler burada, durumlarıyla birlikte listelenir.'
              }
              action={
                filtersActive ? (
                  <SecondaryButton onClick={resetFilters}>Süzgeçleri temizle</SecondaryButton>
                ) : null
              }
            />
          </Tile>
        ) : (
          <div className="space-y-4">
            {requestSections.map((section) => {
              const sectionKey = section.project?.id || '_none';
              const isCollapsed = showProjectGroups && Boolean(collapsedProjects[sectionKey]);
              const groupName = section.project ? projectLabel(section.project) : 'Projesiz';
              return (
                <Tile key={sectionKey}>
                  {showProjectGroups ? (
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsedProjects((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
                      }
                      className={cn(
                        'gold-fade gold-fade-x group/head flex min-h-[60px] w-full items-center gap-3 px-6 py-3.5 text-left outline-none',
                        !isCollapsed && 'border-b border-hairline',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.012em] text-white">
                        {groupName}
                      </span>
                      <span className="text-[12px] tabular-nums text-white/35">{section.rows.length} talep</span>
                      <span className="flex size-7 items-center justify-center rounded-full border border-white/10 text-white/50 transition-colors duration-200 group-hover/head:border-brand group-hover/head:bg-brand group-hover/head:text-primary-foreground">
                        <ChevronRight
                          className={cn('size-4 transition-transform duration-300', !isCollapsed && 'rotate-90')}
                        />
                      </span>
                    </button>
                  ) : (
                    <TileHeader title="Tedarikçi talepleri" aside={`${filteredRequests.length} talep`} />
                  )}
                  {!isCollapsed ? <div className="divide-y divide-white/[0.05]">{section.rows.map(renderRow)}</div> : null}
                </Tile>
              );
            })}
          </div>
        )}
        </Swap>
      </div>

      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
        <DialogContent className="sm:max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle>Projeler</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Üretim talepleri proje altında toplanır. Kod, listenin başındaki iş numarasıdır.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] gap-2">
            <Input value={draftCode} onChange={(e) => setDraftCode(e.target.value)} placeholder="Kod" />
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Proje adı" />
            <Button
              type="button"
              disabled={!draftName.trim() || createProjectMutation.isPending}
              onClick={() => createProjectMutation.mutate()}
            >
              Ekle
            </Button>
          </div>
          <div className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-[12px] border border-white/[0.07]">
            {projects.map((p) => (
              <div key={p.id} className={cn('flex items-center gap-2 px-3 py-2', p.isActive === false && 'opacity-55')}>
                <span className="w-14 shrink-0 text-[12.5px] font-medium tabular-nums text-white/60">{p.code || '—'}</span>
                <Input
                  defaultValue={p.name}
                  key={`${p.id}-${p.name}`}
                  disabled={saveProjectMutation.isPending}
                  className="h-8 border-transparent bg-transparent px-2 hover:border-white/10 focus:border-white/20"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== p.name) saveProjectMutation.mutate({ id: p.id, data: { name: next } });
                  }}
                />
                <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-white/40" title="Talep sayısı">
                  {p.requestCount ?? 0} talep
                </span>
                {p.isDefault ? (
                  <span className="w-16 text-center text-[12px] text-white/40">Varsayılan</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-16 px-2 text-xs"
                    onClick={() => saveProjectMutation.mutate({ id: p.id, data: { isActive: p.isActive === false } })}
                  >
                    {p.isActive === false ? 'Aç' : 'Kapat'}
                  </Button>
                )}
                {!p.isDefault && (p.requestCount ?? 0) === 0 ? (
                  <IconButton label="Projeyi sil" tone="danger" onClick={() => removeProjectMutation.mutate(p.id)}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                ) : (
                  <span className="size-8 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Tedarikçi talebini sil</DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">{deleteTarget?.title}</span> kalıcı olarak
              silinecek. Teklifler, yorumlar, analiz raporu verisi ve tedarikçi atamaları da kaldırılır. Bu işlem
              geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Siliniyor…
                </>
              ) : (
                'Evet, sil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
