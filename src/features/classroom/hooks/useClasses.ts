import { useQuery } from '@tanstack/react-query';

import { useStore } from '@/store/useStore';
import { defaultClassFeatures } from '@/lib/classFeatures';
import { classroomApi } from '../api/classesApi';
import type { ClassDto, GroupDto, PresetDto } from '@thinkclass/contracts/domains/classroom';

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

/**
 * The classes this account can see.
 *
 * `enabled` is for callers that only sometimes need the answer - the opening guide asks for it only
 * on a teacher's first day, to decide whether to hand over to `FirstRunWizard`. A disabled query
 * shares the key and the cache entry with the enabled ones, so the request is never sent twice and
 * an account that will never ask costs nothing. Note that a disabled query reports `isPending`,
 * not `isLoading`, so `isLoading` stays the right "the answer is not ready" test for both.
 */
export function useClasses(options: { enabled?: boolean } = {}) {
  const user = useStore((state) => state.user);
  return useQuery({
    queryKey: classQueryKeys.classes(user?.id, user?.role),
    queryFn: async () => {
      const teacherId = user?.role === 'teacher' ? user.id : undefined;
      const data = await classroomApi.getClasses(teacherId);
      return data.classes;
    },
    enabled: options.enabled ?? true,
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

export function useClassFeatures(
  classId: number | null,
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: classQueryKeys.features(classId),
    queryFn: async () => {
      if (!classId) return { features: defaultClassFeatures, pet_selection_mode: 'random' };
      const data = await classroomApi.getFeatures(classId);
      return { features: data.features, pet_selection_mode: data.pet_selection_mode };
    },
    enabled: !!classId,
    refetchInterval: options.refetchInterval,
  });
}
