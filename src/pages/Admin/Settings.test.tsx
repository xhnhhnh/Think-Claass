import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminSettings from './Settings';
import { DEFAULT_SYSTEM_SETTINGS } from '@/shared/admin/contracts';

const mocks = vi.hoisted(() => ({
  useAdminSystemSettingsQuery: vi.fn(),
  useUpdateAdminSystemSettingsMutation: vi.fn(),
  useAdminReleaseUpdateStatusQuery: vi.fn(),
  useCheckLatestReleaseMutation: vi.fn(),
  useStartReleaseUpdateMutation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/hooks/useAdminSystem', () => ({
  useAdminSystemSettingsQuery: mocks.useAdminSystemSettingsQuery,
  useUpdateAdminSystemSettingsMutation: mocks.useUpdateAdminSystemSettingsMutation,
  useAdminReleaseUpdateStatusQuery: mocks.useAdminReleaseUpdateStatusQuery,
  useCheckLatestReleaseMutation: mocks.useCheckLatestReleaseMutation,
  useStartReleaseUpdateMutation: mocks.useStartReleaseUpdateMutation,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('AdminSettings', () => {
  const mutateAsync = vi.fn();
  const checkLatestMutateAsync = vi.fn();
  const startUpdateMutateAsync = vi.fn();
  const refetchUpdateStatus = vi.fn();
  const baseSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    site_title: 'Think-Class',
    site_favicon: '/favicon.svg',
    allow_teacher_registration: '1',
    revenue_enabled: '0',
    revenue_mode: 'activation_code',
    enable_teacher_analytics: '1',
    enable_parent_report: '1',
    payment_price: '99.00',
    payment_currency: 'CNY',
    payment_description: 'Think-Class 平台激活',
    payment_environment: 'mock',
    payment_enable_wechat: '0',
    payment_enable_alipay: '0',
  };

  beforeEach(() => {
    mutateAsync.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    checkLatestMutateAsync.mockReset();
    startUpdateMutateAsync.mockReset();
    refetchUpdateStatus.mockReset();

    mocks.useAdminSystemSettingsQuery.mockReturnValue({
      data: baseSettings,
      isPending: false,
    });
    mocks.useUpdateAdminSystemSettingsMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    mocks.useAdminReleaseUpdateStatusQuery.mockReturnValue({
      data: {
        repo: 'xhnhhnh/Think-Claass',
        supported: true,
        platform: 'linux',
        state: 'idle',
        message: '尚未执行网站更新。',
        currentVersion: 'v1.6.7',
        latestVersion: '',
        hasUpdate: null,
        releaseUrl: 'https://github.com/xhnhhnh/Think-Claass/releases/latest',
        downloadUrl: 'https://github.com/xhnhhnh/Think-Claass/releases/latest/download/think-class-release.zip',
        startedAt: null,
        updatedAt: null,
        log: '',
      },
      isPending: false,
      refetch: refetchUpdateStatus,
    });
    mocks.useCheckLatestReleaseMutation.mockReturnValue({
      mutateAsync: checkLatestMutateAsync,
      isPending: false,
    });
    mocks.useStartReleaseUpdateMutation.mockReturnValue({
      mutateAsync: startUpdateMutateAsync,
      isPending: false,
    });
  });

  it('saves the expanded settings payload through the admin system mutation', async () => {
    mutateAsync.mockResolvedValue({});

    render(<AdminSettings />);

    const reportToggle = await screen.findByLabelText('开启家长成长报告');
    fireEvent.click(reportToggle);
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        ...baseSettings,
        enable_parent_report: '0',
      });
    });
  });

  it('keeps direct scan payment visible as a delayed option and prevents selecting it', async () => {
    render(<AdminSettings />);

    const directPaymentOption = await screen.findByRole('option', { name: '直接支付（稍后开发）' });

    expect(directPaymentOption).toBeDisabled();
    expect(screen.getByText('扫码支付暂未开放，本轮请使用卡密/激活码开通。')).toBeInTheDocument();
  });

  it('checks the GitHub release and renders the Linux update log panel', async () => {
    checkLatestMutateAsync.mockResolvedValue({
      currentVersion: 'v1.6.7',
      latestVersion: 'v1.6.8',
      hasUpdate: true,
    });
    render(<AdminSettings />);

    fireEvent.click(await screen.findByRole('button', { name: '检查更新' }));

    await waitFor(() => {
      expect(checkLatestMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Linux 更新日志')).toBeInTheDocument();
    expect(screen.getByText('暂无更新日志。')).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('发现新版本 v1.6.8');
  });
});
