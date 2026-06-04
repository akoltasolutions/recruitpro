import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'ADMIN' | 'USER' | 'RECRUITER';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  isActive: boolean;
  subscriptionStatus: string;
  maxUsers: number;
  maxNumbers: number;
  dailyUploadLimit: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string;
  callModeOn: boolean;
  whatsappAccess: boolean;
  uploadPermission: boolean;
  createListPermission: boolean;
  organizationId?: string;
  designation?: string;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string, organization?: Organization | null) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  updateOrganization: (org: Partial<Organization>) => void;
}

/**
 * Create an authenticated fetch that includes the auth token
 * in the Authorization header automatically.
 * Uses Zustand's getState() for reliable token access.
 * Automatically logs out the user on 401 (stale/invalid token).
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });

  // Auto-logout on 401: token is stale or user was deleted/invalidated (deduplicated)
  if (res.status === 401 && useAuthStore.getState().isAuthenticated) {
    if (!useAuthStore.getState().token) return res // already logged out
    useAuthStore.getState().logout();
  }

  return res;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      organization: null,
      token: null,
      isAuthenticated: false,
      login: (user, token, organization = null) =>
        set({
          user,
          organization,
          token,
          isAuthenticated: true,
        }),
      logout: () =>
        set({
          user: null,
          organization: null,
          token: null,
          isAuthenticated: false,
        }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      updateOrganization: (updates) =>
        set((state) => ({
          organization: state.organization ? { ...state.organization, ...updates } : null,
        })),
    }),
    {
      name: 'auth-storage',
    }
  )
);
