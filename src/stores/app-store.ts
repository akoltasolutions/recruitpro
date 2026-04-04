import { create } from 'zustand';

export type AdminPage = 'dashboard' | 'team-performance' | 'team-monitoring' | 'dispositions' | 'call-lists' | 'templates' | 'clients' | 'users' | 'approvals';
export type RecruiterPage = 'home' | 'create-list' | 'pending' | 'history' | 'scheduled' | 'pipeline' | 'settings';
export type AuthPage = 'login' | 'signup';

interface AppState {
  // Navigation
  authPage: AuthPage;
  setAuthPage: (page: AuthPage) => void;
  adminPage: AdminPage;
  setAdminPage: (page: AdminPage) => void;
  recruiterPage: RecruiterPage;
  setRecruiterPage: (page: RecruiterPage) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  // Refresh triggers
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  authPage: 'login',
  setAuthPage: (page) => set({ authPage: page }),
  adminPage: 'dashboard',
  setAdminPage: (page) => set({ adminPage: page }),
  recruiterPage: 'home',
  setRecruiterPage: (page) => set({ recruiterPage: page }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
}));
