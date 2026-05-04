import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminClient } from '../api/adminClient';
import type { AuditLogQuery, UpsertAdminAnnouncementInput, UpsertTeacherInput } from '@/shared/admin/contracts';

export const adminCmsKeys = {
  teachers: ['admin', 'teachers'] as const,
  codes: ['admin', 'codes'] as const,
  announcements: ['admin', 'announcements'] as const,
  auditLogs: (query: AuditLogQuery) => ['admin', 'audit-logs', query] as const,
  openApiKeys: ['admin', 'openapi', 'keys'] as const,
  schools: ['admin', 'openapi', 'schools'] as const,
};

export function useAdminTeachers() {
  return useQuery({ queryKey: adminCmsKeys.teachers, queryFn: () => adminClient.getTeachers() });
}

export function useAdminTeacherMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { type: 'create'; data: UpsertTeacherInput } | { type: 'update'; id: number; data: UpsertTeacherInput } | { type: 'delete'; id: number }) => {
      if (payload.type === 'create') return adminClient.createTeacher(payload.data);
      if (payload.type === 'update') return adminClient.updateTeacher(payload.id, payload.data);
      return adminClient.deleteTeacher(payload.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminCmsKeys.teachers }),
  });
}

export function useActivationCodes() {
  return useQuery({ queryKey: adminCmsKeys.codes, queryFn: () => adminClient.getActivationCodes() });
}

export function useGenerateActivationCodesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminClient.generateActivationCodes,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminCmsKeys.codes }),
  });
}

export function useAdminAnnouncements() {
  return useQuery({ queryKey: adminCmsKeys.announcements, queryFn: () => adminClient.getAnnouncements() });
}

export function useAdminAnnouncementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      payload:
        | { type: 'create'; data: UpsertAdminAnnouncementInput }
        | { type: 'update'; id: number; data: UpsertAdminAnnouncementInput }
        | { type: 'delete'; id: number },
    ) => {
      if (payload.type === 'create') return adminClient.createAnnouncement(payload.data);
      if (payload.type === 'update') return adminClient.updateAnnouncement(payload.id, payload.data);
      return adminClient.deleteAnnouncement(payload.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminCmsKeys.announcements }),
  });
}

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({ queryKey: adminCmsKeys.auditLogs(query), queryFn: () => adminClient.getAuditLogs(query) });
}

export function useOpenApiKeys() {
  return useQuery({ queryKey: adminCmsKeys.openApiKeys, queryFn: () => adminClient.getOpenApiKeys() });
}

export function useSchools() {
  return useQuery({ queryKey: adminCmsKeys.schools, queryFn: () => adminClient.getSchools() });
}
