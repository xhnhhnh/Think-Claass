import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultClassFeatures, type ClassFeatures } from '@/lib/classFeatures';

export interface User {
  id: number;
  role: 'admin' | 'superadmin' | 'teacher' | 'student' | 'parent';
  username: string;
  name?: string;
  studentId?: number;
  parentId?: number;
  is_activated?: boolean;
  class_id?: number;
  available_points?: number;
  classFeatures?: ClassFeatures;
}

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user: user ? { ...user, classFeatures: user.classFeatures ?? defaultClassFeatures } : null }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'thinkclass-user',
      partialize: (state) => ({ user: state.user }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;
        const user = persisted?.user
          ? { ...persisted.user, classFeatures: persisted.user.classFeatures ?? defaultClassFeatures }
          : null;
        return { ...currentState, ...persisted, user };
      },
    }
  )
);
