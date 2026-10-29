import axios from 'axios';
import { useAuthStore } from '@/stores/useAuthStore';
import { clearDashboardLockCookie } from '@/lib/dashboard-lock-cookie';

/**
 * Tarayıcıda: mümkünse aynı origin üzerinden /api (server.js → API_INTERNAL_ORIGIN).
 * Sunucuda (RSC vb.): API_INTERNAL_ORIGIN + /api.
 * Üretimde yanlışlıkla gömülmüş localhost env'ini tarayıcıda yok say.
 */
export const getApiBaseUrl = (): string => {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) {
    if (typeof window !== 'undefined') {
      const isLocal =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (
        !isLocal &&
        (pub.startsWith('http://localhost') ||
          pub.startsWith('http://127.0.0.1') ||
          pub.includes('localhost:4000'))
      ) {
        return `${window.location.origin}/api`.replace(/\/+$/, '');
      }
    }
    return pub.replace(/\/+$/, '') || '/api';
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:4000/api';
    }
    return `${window.location.origin}/api`.replace(/\/+$/, '');
  }
  const internal = (process.env.API_INTERNAL_ORIGIN || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  return `${internal}/api`;
};

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — baseURL her istekte (build-time yanlış env sonrası düzeltme) + JWT
api.interceptors.request.use(
  (config) => {
    config.baseURL = getApiBaseUrl();
    if (config.data instanceof FormData) {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('vendor-portal-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          const token = parsed?.state?.token;
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
      } catch {
        // Silently ignore parse errors
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let refreshInFlight: Promise<string> | null = null;

function getStoredToken(): string | null {
  try {
    const stored = localStorage.getItem('vendor-portal-auth');
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { state?: { token?: string } };
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

function authLoginPath() {
  return '/login';
}

// Response interceptor — süresi dolmuş JWT için bir kez /auth/refresh dene
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };
    const status = error.response?.status;

    if (status !== 401 || typeof window === 'undefined' || !originalRequest) {
      return Promise.reject(error);
    }

    const path = String(originalRequest.url ?? '');
    if (path.includes('auth/login') || path.includes('auth/otp')) {
      return Promise.reject(error);
    }
    if (path.includes('auth/refresh')) {
      localStorage.removeItem('vendor-portal-auth');
      clearDashboardLockCookie();
      window.location.href = authLoginPath();
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      localStorage.removeItem('vendor-portal-auth');
      clearDashboardLockCookie();
      window.location.href = authLoginPath();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          const oldToken = getStoredToken();
          if (!oldToken) throw new Error('no token');
          const { data } = await axios.post<{
            token: string;
            user: {
              id: string;
              name: string;
              email: string;
              role: 'ADMIN' | 'PURCHASING' | 'SUPPLIER' | 'DEPARTMENT';
              vendor?: { id: string; name: string };
            };
          }>(`${getApiBaseUrl()}/auth/refresh`, {}, { headers: { Authorization: `Bearer ${oldToken}` } });
          useAuthStore.getState().setToken(data.token);
          useAuthStore.getState().setUser(data.user);
          return data.token;
        })().finally(() => {
          refreshInFlight = null;
        });
      }
      const newToken = await refreshInFlight;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch {
      localStorage.removeItem('vendor-portal-auth');
      clearDashboardLockCookie();
      window.location.href = authLoginPath();
      return Promise.reject(error);
    }
  }
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: {
    name: string;
    phone?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => api.patch('/auth/me', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data: { email: string; code: string; password: string }) =>
    api.post('/auth/reset-password', data),
  verifyPassword: (password: string) => api.post('/auth/verify-password', { password }),
  refresh: () => api.post('/auth/refresh'),
  requestOtp: (email: string) => api.post('/auth/otp/request', { email }),
  verifyOtp: (data: { email: string; code: string; name?: string }) => api.post('/auth/otp/verify', data),
  verifyOtpLink: (token: string) => api.post('/auth/otp/link', { token }),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: unknown) => api.post('/users', data),
  update: (id: string, data: unknown) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// ─── Vendors ─────────────────────────────────────────────────────────────────
export const vendorsApi = {
  getAll: () => api.get('/vendors'),
  getById: (id: string) => api.get(`/vendors/${id}`),
  create: (data: unknown) => api.post('/vendors', data),
  update: (id: string, data: unknown) => api.put(`/vendors/${id}`, data),
  delete: (id: string) => api.delete(`/vendors/${id}`),
  getPurchaseHistory: (vendorId?: string) =>
    api.get('/vendors/history', { params: { vendorId: vendorId || undefined } }),
};

// ─── Products ────────────────────────────────────────────────────────────────
export const productsApi = {
  getAll: (vendorId?: string) => api.get('/products', { params: { vendorId } }),
  getById: (id: string) => api.get(`/products/${id}`),
  create: (data: unknown) => api.post('/products', data),
  update: (id: string, data: unknown) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
};

// ─── Procurement ──────────────────────────────────────────────────────────────
export const procurementApi = {
  getAll: (params?: { shopDepartmentId?: string; shopWorkerId?: string }) =>
    api.get('/procurement', { params }),
  listCentral: () => api.get('/procurement/central'),
  requestHandover: (id: string, body: { direction: 'TAKEOVER' | 'HANDOFF'; note?: string | null }) =>
    api.post(`/procurement/${id}/handover`, body),
  acceptHandover: (id: string, handoverId: string, note?: string | null) =>
    api.post(`/procurement/${id}/handover/${handoverId}/accept`, { note: note ?? null }),
  rejectHandover: (id: string, handoverId: string, note?: string | null) =>
    api.post(`/procurement/${id}/handover/${handoverId}/reject`, { note: note ?? null }),
  getById: (id: string) => api.get(`/procurement/${id}`),
  create: (data: unknown) => api.post('/procurement', data),
  update: (id: string, data: unknown) => api.put(`/procurement/${id}`, data),
  delete: (id: string) => api.delete(`/procurement/${id}`),
  addComment: (id: string, content: string, targetVendorId?: string) =>
    api.post(`/procurement/${id}/comments`, { content, targetVendorId }),
  submitQuote: (id: string, payload: any) => api.put(`/procurement/${id}/quote`, payload),
  getByToken: (token: string) => api.get(`/procurement/token/${token}`),
  submitQuoteByToken: (token: string, payload: any) =>
    api.post(`/procurement/token/${token}/quote`, payload),
  /** Girişsiz satın alma kararı daveti */
  getByDecisionToken: (token: string) => api.get(`/procurement/decision-token/${token}`),
  upsertItemVendorPicksByDecisionToken: (
    token: string,
    body: { choices: { itemId: string; vendorId: string | null }[] }
  ) => api.put(`/procurement/decision-token/${token}/item-vendor-picks`, body),
  sendDecisionInvite: (
    requestId: string,
    body?: { extraEmails?: string[]; includeCanonical?: boolean },
  ) => api.post(`/procurement/${requestId}/decision-invite`, body ?? {}),
  revokeDecisionInvite: (requestId: string) => api.delete(`/procurement/${requestId}/decision-invite`),
  resendExecutiveInbox: (
    requestId: string,
    body?: { extraEmails?: string[]; includeCanonical?: boolean },
  ) => api.post(`/procurement/${requestId}/executive-inbox-resend`, body ?? {}),
  resendVendorNotificationEmail: (requestId: string, vendorId: string) =>
    api.post(`/procurement/${requestId}/resend-vendor-email`, { vendorId }),
  resendVendorNotificationSms: (requestId: string, vendorId: string, phone?: string) =>
    api.post(`/procurement/${requestId}/resend-vendor-sms`, {
      vendorId,
      ...(phone ? { phone } : {}),
    }),
  uploadAttachments: (requestId: string, formData: FormData) =>
    api.post(`/procurement/${requestId}/attachments`, formData, { timeout: 5 * 60 * 1000 }),
  upsertMarketOffer: (requestId: string, formData: FormData) =>
    api.post(`/procurement/${requestId}/market-offers`, formData, { timeout: 5 * 60 * 1000 }),
  updateMarketQuote: (
    requestId: string,
    quoteId: string,
    body: { price?: number; currency?: string; url?: string | null; notes?: string | null }
  ) => api.patch(`/procurement/${requestId}/market-quotes/${quoteId}`, body),
  deleteMarketQuote: (requestId: string, quoteId: string) =>
    api.delete(`/procurement/${requestId}/market-quotes/${quoteId}`),
  deleteItemQuote: (requestId: string, quoteId: string) =>
    api.delete(`/procurement/${requestId}/item-quotes/${quoteId}`),
  renameItem: (requestId: string, itemId: string, productName: string) =>
    api.patch(`/procurement/${requestId}/items/${itemId}`, { productName }),
  deleteMarketSource: (requestId: string, sourceId: string) =>
    api.delete(`/procurement/${requestId}/market-sources/${sourceId}`),
  /** Girişsiz teklif sayfası — tedarikçi ek dosya */
  uploadVendorAttachmentsByToken: (token: string, formData: FormData) =>
    api.post(`/procurement/token/${token}/vendor-attachments`, formData, { timeout: 5 * 60 * 1000 }),
  /** Blob getir (önizleme); indirme zorlamaz */
  fetchAttachmentBlob: (requestId: string, attachmentId: string) =>
    api.get(`/procurement/${requestId}/attachments/${attachmentId}`, { responseType: 'blob' }),
  fetchTokenAttachmentBlob: (token: string, attachmentId: string) =>
    api.get(`/procurement/token/${token}/attachments/${attachmentId}`, { responseType: 'blob' }),
  /** Girişli indirme (satın alma ekranı) */
  downloadAttachmentBlob: async (requestId: string, attachmentId: string, originalName: string) => {
    const res = await api.get(`/procurement/${requestId}/attachments/${attachmentId}`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  upsertItemVendorPicks: (
    id: string,
    body: { choices: { itemId: string; vendorId: string | null }[] }
  ) => api.put(`/procurement/${id}/item-vendor-picks`, body),
  /** Excel talep şablonları (modül bazlı) */
  getListTemplateMeta: () => api.get('/procurement/list-template'),
  /** Sunucudaki şablon veya varsayılan üretilmiş şablon indirme */
  downloadListTemplateBlob: async (moduleId?: string) => {
    const res = await api.get('/procurement/list-template/download', {
      params: moduleId ? { moduleId } : undefined,
      responseType: 'blob',
    });
  const defaultName =
    moduleId === 'SATIN_ALMA'
      ? 'Satin_Alma_Talep_Listesi_Sablonu.xlsx'
      : moduleId === 'BIRIM_TALEP'
        ? 'Birim_Talep_Listesi_Sablonu.xlsx'
        : 'Uretim_Talep_Listesi_Sablonu.xlsx';
    let name = defaultName;
    const cd = res.headers['content-disposition'] as string | undefined;
    if (cd) {
      const mStar = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const m = /filename="([^"]+)"/i.exec(cd);
      if (mStar?.[1]) {
        try {
          name = decodeURIComponent(mStar[1].trim());
        } catch {
          name = defaultName;
        }
      } else if (m?.[1]) name = m[1];
    }
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  uploadListTemplate: (formData: FormData, moduleId: string) =>
    api.post('/procurement/list-template', formData, { params: { moduleId } }),
  /** "Excel ile toplu kalem" kartının modül bazında görünürlüğü */
  getExcelImportSettings: () => api.get('/procurement/settings/excel-import'),
  updateExcelImportSetting: (data: { moduleId: string; isEnabled: boolean }) =>
    api.put('/procurement/settings/excel-import', data),
  getApprovalLimit: () => api.get('/procurement/settings/approval-limit'),
  updateApprovalLimit: (data: {
    limitAmount?: number;
    isActive?: boolean;
    executiveEmail?: string | null;
  }) => api.put('/procurement/settings/approval-limit', data),
  getStaffExecutiveInbox: () => api.get('/procurement/settings/executive-inbox'),
  getStaffExecutivePreviewLink: () => api.get('/procurement/settings/executive-inbox/preview-link'),
  recallFromExecutiveInbox: (requestId: string) =>
    api.post(`/procurement/settings/executive-inbox/${requestId}/recall`),
  getOverLimitInboxByToken: (token: string) =>
    api.get(`/procurement/over-limit-token/${token}`),
  fetchOverLimitAttachmentBlob: (token: string, requestId: string, attachmentId: string) =>
    api.get(
      `/procurement/over-limit-token/${token}/requests/${requestId}/attachments/${attachmentId}`,
      { responseType: 'blob' }
    ),
  approveOverLimitByToken: (
    token: string,
    requestId: string,
    note?: string,
    choices?: { itemId: string; vendorId: string | null }[]
  ) =>
    api.post(`/procurement/over-limit-token/${token}/requests/${requestId}/approve`, {
      note,
      ...(choices ? { choices } : {}),
    }),
  rejectOverLimitByToken: (token: string, requestId: string, note?: string) =>
    api.post(`/procurement/over-limit-token/${token}/requests/${requestId}/reject`, {
      note,
    }),
  getManagerUnderLimitInbox: () => api.get('/procurement/manager-inbox'),
  approveManagerUnderLimit: (
    requestId: string,
    note?: string,
    choices?: { itemId: string; vendorId: string | null }[],
    vendorShippingCosts?: Array<{ vendorId: string; costTRY: number }>,
  ) =>
    api.post(`/procurement/manager-inbox/${requestId}/approve`, {
      note,
      ...(choices ? { choices } : {}),
      ...(vendorShippingCosts?.length ? { vendorShippingCosts } : {}),
    }),
  rejectManagerUnderLimit: (requestId: string, note?: string) =>
    api.post(`/procurement/manager-inbox/${requestId}/reject`, { note }),
  getOrderDossier: (id: string) => api.get(`/procurement/${id}/order-dossier`),
  downloadOrderDossierPdf: (id: string) =>
    api.get(`/procurement/${id}/order-dossier/pdf`, { responseType: 'blob' }),
  getApprovalSummary: (id: string) => api.get(`/procurement/${id}/approval-summary`),
  submitForApproval: (
    id: string,
    note?: string,
    vendorShippingCosts?: Array<{ vendorId: string; costTRY: number }>,
  ) =>
    api.post(`/procurement/${id}/submit-approval`, {
      note,
      ...(vendorShippingCosts?.length ? { vendorShippingCosts } : {}),
    }),
  withdrawFromManagerApproval: (id: string, note?: string) =>
    api.post(`/procurement/${id}/withdraw-approval`, { note }),
  managerApprove: (
    id: string,
    note?: string,
    approvedVendorId?: string,
    extraEmails?: string[],
    includeCanonical?: boolean,
    vendorShippingCosts?: Array<{ vendorId: string; costTRY: number }>,
  ) =>
    api.post(`/procurement/${id}/manager-approve`, {
      note,
      ...(approvedVendorId ? { approvedVendorId } : {}),
      ...(extraEmails?.length ? { extraEmails } : {}),
      ...(typeof includeCanonical === 'boolean' ? { includeCanonical } : {}),
      ...(vendorShippingCosts?.length ? { vendorShippingCosts } : {}),
    }),
  adminApprove: (id: string, note?: string) =>
    api.post(`/procurement/${id}/admin-approve`, { note }),
  routeToStaff: (id: string, targetUserId?: string | null, note?: string) =>
    api.post(`/procurement/${id}/route-staff`, {
      ...(targetUserId ? { targetUserId } : {}),
      note,
    }),
  completePurchase: (
    id: string,
    body?: { note?: string; sendWarehouseMail?: boolean; warehouseUserIds?: string[] }
  ) => api.post(`/procurement/${id}/complete`, body ?? {}),
  uploadInvoice: (id: string, formData: FormData) =>
    api.post(`/procurement/${id}/invoice`, formData),
  deleteInvoice: (id: string, attachmentId: string) =>
    api.delete(`/procurement/${id}/invoice/${attachmentId}`),
  rejectRequest: (id: string, note?: string) =>
    api.post(`/procurement/${id}/reject`, { note }),
  getWarehouseDispatchList: (id: string) =>
    api.get(`/procurement/${id}/warehouse-dispatch`),
  getWarehouseContacts: () => api.get('/procurement/warehouse-contacts'),
  sendWarehouseDispatchList: (id: string, userIds: string[], note?: string) =>
    api.post(`/procurement/${id}/warehouse-dispatch/send`, { userIds, note }),
  recordChannelAction: (id: string, body: { action: string; vendorId?: string }) =>
    api.post(`/procurement/${id}/channel-action`, body),
};

export const projectsApi = {
  list: (params?: { includeInactive?: boolean; moduleId?: string }) =>
    api.get('/projects', {
      params: {
        ...(params?.moduleId ? { moduleId: params.moduleId } : {}),
        ...(params?.includeInactive ? { includeInactive: '1' } : {}),
      },
    }),
  create: (data: { name: string; code?: string | null; moduleId?: string }) => api.post('/projects', data),
  update: (id: string, data: { name?: string; code?: string | null; isActive?: boolean }) =>
    api.put(`/projects/${id}`, data),
  remove: (id: string) => api.delete(`/projects/${id}`),
};

// ─── Organizasyon birimleri (beyaz / mavi yaka) ───────────────────────────────
export const departmentsApi = {
  getAll: (params?: { collarType?: 'WHITE_COLLAR' | 'BLUE_COLLAR'; active?: boolean | string }) =>
    api.get('/departments', { params }),
  create: (data: { name: string; collarType?: 'WHITE_COLLAR' | 'BLUE_COLLAR'; isActive?: boolean } | string) =>
    api.post('/departments', typeof data === 'string' ? { name: data } : data),
  update: (
    id: string,
    data: { name?: string; collarType?: 'WHITE_COLLAR' | 'BLUE_COLLAR'; isActive?: boolean } | string
  ) => api.put(`/departments/${id}`, typeof data === 'string' ? { name: data } : data),
  delete: (id: string) => api.delete(`/departments/${id}`),
};

// ─── Usta / çalışan (mavi yaka) ───────────────────────────────────────────────
export const orgWorkersApi = {
  getAll: (params?: { departmentId?: string; active?: boolean | string }) =>
    api.get('/org-workers', { params }),
  create: (data: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    departmentId: string;
    isActive?: boolean;
  }) => api.post('/org-workers', data),
  update: (
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      phone: string | null;
      departmentId: string;
      isActive: boolean;
    }>
  ) => api.put(`/org-workers/${id}`, data),
  delete: (id: string) => api.delete(`/org-workers/${id}`),
};

export const unitsApi = {
  getAll: () => api.get('/units'),
  create: (name: string) => api.post('/units', { name }),
  resolve: (name: string) => api.post('/units/resolve', { name }),
  resolveMany: (names: string[]) => api.post('/units/resolve-many', { names }),
  delete: (id: string) => api.delete(`/units/${id}`),
};

// ─── Yerinde düzenlenen yazılar — okuma herkes, yazma ADMIN ──────────────────
export const siteTextsApi = {
  getAll: () => api.get<Record<string, string>>('/site-texts'),
  save: (key: string, value: string | null) => api.put(`/site-texts/${encodeURIComponent(key)}`, { value }),
  history: (key: string) =>
    api.get<{ value: string | null; author: string | null; createdAt: string }[]>(
      `/site-texts/${encodeURIComponent(key)}/history`,
    ),
};

// ─── Mail (SMTP) ayarları — ADMIN ─────────────────────────────────────────────
export const mailSettingsApi = {
  get: () => api.get('/mail-settings'),
  update: (data: unknown) => api.put('/mail-settings', data),
  test: (to?: string) => api.post('/mail-settings/test', to ? { to } : {}),
};

// ─── Mail günlüğü (giden kutu) — yalnız ADMIN ─────────────────────────────────
export const mailOutboxApi = {
  list: (params?: { status?: string; channel?: string; q?: string; page?: number; pageSize?: number }) =>
    api.get('/mail-outbox', { params }),
  getById: (id: string) => api.get(`/mail-outbox/${id}`),
  seedPreviews: () => api.post('/mail-outbox/seed-previews'),
  clearPreviews: () => api.post('/mail-outbox/clear-previews'),
  remove: (id: string) => api.delete(`/mail-outbox/${id}`),
  removeMany: (ids: string[]) => api.post('/mail-outbox/delete-many', { ids }),
};

// ─── Teklif bildirimi CC listesi — okuma: ADMIN+PURCHASING; yazma: yalnız ADMIN ──
export const notificationCcContactsApi = {
  getAll: () => api.get('/notification-cc-contacts'),
  create: (data: { name: string; email: string; sortOrder?: number }) =>
    api.post('/notification-cc-contacts', data),
  update: (id: string, data: { name?: string; email?: string; sortOrder?: number }) =>
    api.put(`/notification-cc-contacts/${id}`, data),
  delete: (id: string) => api.delete(`/notification-cc-contacts/${id}`),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: (kind?: 'ALERT' | 'MESSAGE') =>
    api.patch('/notifications/read-all', undefined, { params: kind ? { kind } : undefined }),
  list: (params: {
    page?: number;
    pageSize?: number;
    kind?: 'ALERT' | 'MESSAGE';
    status?: 'read' | 'unread';
    q?: string;
  }) => api.get('/notifications/list', { params }),
  markAsUnread: (id: string) => api.patch(`/notifications/${id}/unread`),
  markMany: (ids: string[], isRead = true) => api.patch('/notifications/read-many', { ids, isRead }),
  remove: (id: string) => api.delete(`/notifications/${id}`),
  removeMany: (ids: string[]) => api.post('/notifications/delete-many', { ids }),
};

export const internalRequestsApi = {
  getAll: (opts?: { mine?: boolean }) =>
    api.get('/internal-requests', { params: opts?.mine ? { mine: '1' } : undefined }),
  getById: (id: string) => api.get(`/internal-requests/${id}`),
  create: (data: unknown) => api.post('/internal-requests', data),
  createAndSubmit: (formData: FormData) => api.post('/internal-requests/submit-with-files', formData),
  update: (id: string, data: unknown) => api.put(`/internal-requests/${id}`, data),
  submit: (id: string) => api.post(`/internal-requests/${id}/submit`),
  approve: (id: string, note?: string, assignedToIds?: string[]) =>
    api.post(`/internal-requests/${id}/approve`, { note, assignedToIds }),
  reject: (id: string, note?: string) => api.post(`/internal-requests/${id}/reject`, { note }),
  convert: (id: string, body?: { itemIds?: string[]; title?: string }) =>
    api.post(`/internal-requests/${id}/convert`, body ?? {}),
  remove: (id: string) => api.delete(`/internal-requests/${id}`),
  uploadAttachments: (id: string, formData: FormData) =>
    api.post(`/internal-requests/${id}/attachments`, formData),
  downloadAttachment: (id: string, attachmentId: string) =>
    api.get(`/internal-requests/${id}/attachments/${attachmentId}`, { responseType: 'blob' }),
  deleteAttachment: (id: string, attachmentId: string) =>
    api.delete(`/internal-requests/${id}/attachments/${attachmentId}`),
  boardCounts: (units?: string[], q?: string, opts?: { mine?: boolean }) =>
    api.get('/internal-requests/board/counts', {
      params: {
        units: units?.length ? units.join(',') : undefined,
        q: q || undefined,
        mine: opts?.mine ? '1' : undefined,
      },
    }),
  boardColumn: (
    column: string,
    cursor?: string | null,
    units?: string[],
    q?: string,
    opts?: { mine?: boolean }
  ) =>
    api.get('/internal-requests/board', {
      params: {
        column,
        limit: 20,
        cursor: cursor || undefined,
        units: units?.length ? units.join(',') : undefined,
        q: q || undefined,
        mine: opts?.mine ? '1' : undefined,
      },
    }),
  listAssignees: (moduleId?: string) =>
    api.get('/internal-requests/assignees', { params: moduleId ? { moduleId } : undefined }),
  listMessages: (id: string) => api.get(`/internal-requests/${id}/messages`),
  postMessage: (id: string, body: string | FormData) =>
    typeof body === 'string'
      ? api.post(`/internal-requests/${id}/messages`, { body })
      : api.post(`/internal-requests/${id}/messages`, body),
};

export const smsSettingsApi = {
  get: () => api.get('/sms-settings'),
  update: (data: unknown) => api.put('/sms-settings', data),
  test: (to?: string) => api.post('/sms-settings/test', to ? { to } : {}),
};

export const auditApi = {
  getAll: (severity?: string) => api.get('/audit', { params: { severity } }),
};

// ─── Catalog (PDF) ────────────────────────────────────────────────────────────
export const catalogApi = {
  getAll: () => api.get('/catalog'),
  getMy: () => api.get('/catalog/my'),
  upload: (formData: FormData) =>
    api.post('/catalog', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (id: string) => api.delete(`/catalog/${id}`),
};

// ─── Currency (External) ──────────────────────────────────────────────────────
export const currencyApi = {
  getRates: async () => {
    try {
      return await api.get('/currency/rates', { timeout: 6000 });
    } catch {
      // Kur endpoint'i ulaşılamadığında UI fallback rate'lerle devam etsin.
      return { data: { success: false, rates: null } } as const;
    }
  },
};
