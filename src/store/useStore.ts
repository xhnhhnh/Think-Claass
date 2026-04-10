import { create } from 'zustand';

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
}

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
