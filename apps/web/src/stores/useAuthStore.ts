import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';

export type PortalMode = 'birim' | 'staff';

interface JwtPayload {
  id: string;
  email: string;
  role: 'ADMIN' | 'PURCHASING' | 'SUPPLIER' | 'DEPARTMENT';
  name: string;
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
  portal?: PortalMode;
  exp: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'PURCHASING' | 'SUPPLIER' | 'DEPARTMENT';
  moduleId?: string;
  subRole?: string;
  isExecutive?: boolean;
  phone?: string | null;
  portal?: PortalMode;
  vendor?: { id: string; name: string };
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  /** birim = Taleplerim B2B; staff = yönetici paneli */
  portalMode: PortalMode;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isTokenExpired: () => boolean;
}

const portalFromDecoded = (decoded: JwtPayload, role: User['role']): PortalMode => {
  if (decoded.portal === 'birim' || decoded.portal === 'staff') return decoded.portal;
  return role === 'DEPARTMENT' ? 'birim' : 'staff';
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      portalMode: 'staff',

      setToken: (token: string) => {
        try {
          const decoded = jwtDecode<JwtPayload>(token);
          const portalMode = portalFromDecoded(decoded, decoded.role);
          const user: User = {
            id: decoded.id,
            name: decoded.name,
            email: decoded.email,
            role: decoded.role,
            moduleId: decoded.moduleId,
            subRole: decoded.subRole,
            isExecutive: Boolean(decoded.isExecutive),
            portal: portalMode,
          };
          set({ token, user, isAuthenticated: true, portalMode });
        } catch {
          console.error('Invalid token');
        }
      },

      setUser: (user: User) => {
        const portalMode =
          user.portal === 'birim' || user.portal === 'staff'
            ? user.portal
            : get().portalMode || (user.role === 'DEPARTMENT' ? 'birim' : 'staff');
        set({ user: { ...user, portal: portalMode }, portalMode });
      },

      logout: () => set({ token: null, user: null, isAuthenticated: false, portalMode: 'staff' }),

      isTokenExpired: () => {
        const { token } = get();
        if (!token) return true;
        try {
          const decoded = jwtDecode<JwtPayload>(token);
          return decoded.exp * 1000 < Date.now();
        } catch {
          return true;
        }
      },
    }),
    {
      name: 'vendor-portal-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        portalMode: state.portalMode,
      }),
    }
  )
);

/** Birim kapısı oturumu: Taleplerim B2B kabuğu (yönetici menüsü yok). */
export const isBirimPortalSession = (state: {
  portalMode?: PortalMode;
  user?: { role?: string; portal?: PortalMode } | null;
}) =>
  state.portalMode === 'birim' ||
  state.user?.portal === 'birim' ||
  state.user?.role === 'DEPARTMENT';
