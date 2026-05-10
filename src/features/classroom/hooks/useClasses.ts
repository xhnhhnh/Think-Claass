import { useQuery } from '@tanstack/react-query';

import { useStore } from '@/store/useStore';
import { defaultClassFeatures } from '@/lib/classFeatures';
import { classroomApi } from '../api/classesApi';
import type { ClassDto, GroupDto, PresetDto } from '@/shared/classroom/contracts';

export type ClassItem = ClassDto;
export type Group = GroupDto;
export type Preset = PresetDto;

export const classQueryKeys = {
  classes: (userId?: number, role?: string) => ['classes', userId, role] as const,
  groups: (classId: number | null) => ['groups', classId] as const,
  presets: (userId?: number, role?: string) => ['presets', userId, role] as const,
  features: (classId: number | null) => ['class-features', classId] as const,
  bigscreen: (classId: number | null) => ['class-bigscreen', classId] as const,
  guildRanking: (classId: number | null) => ['guild-ranking', classId] as const,
};

export function useClasses() {
  const user = useStore((state) => state.user);
  return useQuery({
    queryKey: classQueryKeys.classes(user?.id, user?.role),
    queryFn: async () => {
      const teacherId = user?.role === 'teacher' ? user.id : undefined;
      const data = await classroomApi.getClasses(teacherId);
      return data.classes;
    },
  });
}

export function useGroups(classId: number | null) {
  return useQuery({
    queryKey: classQueryKeys.groups(classId),
    queryFn: async () => {
      if (!classId) return [];
      const data = await classroomApi.getGroups(classId);
      return data.groups;
    },
    enabled: !!classId,
  });
}

export function usePresets() {
  const user = useStore((state) => state.user);
  return useQuery({
    queryKey: classQueryKeys.presets(user?.id, user?.role),
    queryFn: async () => {
      const teacherId = user?.role === 'teacher' ? user.id : undefined;
      const data = await classroomApi.getPresets(teacherId);
      return data.presets;
    },
  });
}

export function useClassFeatures(classId: number | null) {
  return useQuery({
    queryKey: classQueryKeys.features(classId),
    queryFn: async () => {
      if (!classId) return { features: defaultClassFeatures, pet_selection_mode: 'random' };
      const data = await classroomApi.getFeatures(classId);
      return { features: data.features, pet_selection_mode: data.pet_selection_mode };
    },
    enabled: !!classId,
  });
}
