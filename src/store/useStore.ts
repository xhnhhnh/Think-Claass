import { create } from 'zustand';

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

export const useStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user: user ? { ...user, classFeatures: user.classFeatures ?? defaultClassFeatures } : null }),
  logout: () => set({ user: null }),
}));
