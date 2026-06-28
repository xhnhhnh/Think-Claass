import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminClient, type AdminCredentials } from '@/features/admin/api/adminClient';
import type {
  AdminSession,
  DatabaseImportResult,
  DatabaseResetResult,
  ReleaseUpdateStatus,
  SystemSettings,
  SystemStatsResponse,
} from '@/shared/admin/contracts';

export const adminQueryKeys = {
  stats: ['admin', 'system', 'stats'] as const,
  settings: ['admin', 'system', 'settings'] as const,
  updateStatus: ['admin', 'system', 'update', 'status'] as const,
};

export function useAdminSessionMutation() {
  return useMutation<AdminSession, Error, AdminCredentials>({
    mutationFn: (credentials: AdminCredentials) => adminClient.createSession(credentials),
  });
}

export function useAdminStatsQuery() {
  return useQuery<SystemStatsResponse>({
    queryKey: adminQueryKeys.stats,
    queryFn: () => adminClient.getSystemStats(),
    refetchInterval: 30_000,
  });
}

export function useAdminSystemSettingsQuery() {
  return useQuery<SystemSettings>({
    queryKey: adminQueryKeys.settings,
    queryFn: () => adminClient.getSystemSettings(),
  });
}

export function useUpdateAdminSystemSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation<SystemSettings, Error, Partial<SystemSettings>>({
    mutationFn: (input: Partial<SystemSettings>) => adminClient.updateSystemSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(adminQueryKeys.settings, settings);
    },
  });
}

export function useDatabaseImportMutation() {
  const queryClient = useQueryClient();

  return useMutation<DatabaseImportResult, Error, FormData>({
    mutationFn: (formData: FormData) => adminClient.importDatabase(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.stats });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.settings });
    },
  });
}

export function useDatabaseResetMutation() {
  const queryClient = useQueryClient();

  return useMutation<DatabaseResetResult, Error, void>({
    mutationFn: () => adminClient.resetDatabase(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.stats });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.settings });
    },
  });
}

export function useAdminReleaseUpdateStatusQuery() {
  return useQuery<ReleaseUpdateStatus>({
    queryKey: adminQueryKeys.updateStatus,
    queryFn: () => adminClient.getReleaseUpdateStatus(),
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 2_000 : false),
  });
}

export function useCheckLatestReleaseMutation() {
  const queryClient = useQueryClient();

  return useMutation<ReleaseUpdateStatus, Error, void>({
    mutationFn: () => adminClient.checkLatestRelease(),
    onSuccess: (status) => {
      queryClient.setQueryData(adminQueryKeys.updateStatus, status);
    },
  });
}

export function useStartReleaseUpdateMutation() {
  const queryClient = useQueryClient();

  return useMutation<ReleaseUpdateStatus, Error, void>({
    mutationFn: () => adminClient.startReleaseUpdate(),
    onSuccess: (status) => {
      queryClient.setQueryData(adminQueryKeys.updateStatus, status);
    },
  });
}
