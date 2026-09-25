import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultClassFeatures, type ClassFeatures } from '@/lib/classFeatures';
import { revokeSession } from '@/lib/session';

export interface User {
  id: number;
  role: 'admin' | 'superadmin' | 'teacher' | 'student' | 'parent';
  username: string;
  name?: string;
  studentId?: number;
  classId?: number;
  parentId?: number;
  is_activated?: boolean;
  class_id?: number;
  available_points?: number;
  classFeatures?: ClassFeatures;
}

interface AppState {
  user: User | null;
  /**
   * Opaque session token issued by the kernel at login.
   *
   * The server used to accept the client's own `x-user-role` / `x-user-id`
   * headers, which meant anyone could become a superadmin by editing a header.
   * The token is the verified replacement; the headers survive only as a migration
   * bridge for sessions established before the token existed, so a persisted user
   * with no token keeps working until the next login.
   */
  token: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  /**
   * Sign out: revoke the server session, then forget it locally.
   *
   * Clearing the store was the whole of it, which left the kernel session valid for its full TTL -
   * a copied token kept working after a logout. `revokeSession()` is fire-and-forget so the UI
   * never waits on the network to sign somebody out.
   */
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user: user ? { ...user, classFeatures: user.classFeatures ?? defaultClassFeatures } : null }),
      setToken: (token) => set({ token }),
      logout: () => {
        void revokeSession();
        set({ user: null, token: null });
      },
    }),
    {
      name: 'thinkclass-user',
      partialize: (state) => ({ user: state.user, token: state.token }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;
        const user = persisted?.user
          ? { ...persisted.user, classFeatures: persisted.user.classFeatures ?? defaultClassFeatures }
          : null;
        return { ...currentState, ...persisted, user, token: persisted?.token ?? null };
      },
    }
  )
);
