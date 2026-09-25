import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminSettings from './AdminSettingsPage';
import { DEFAULT_SYSTEM_SETTINGS } from '@/lib/systemSettings.js';

const mocks = vi.hoisted(() => ({
  useAdminSystemSettingsQuery: vi.fn(),
  useUpdateAdminSystemSettingsMutation: vi.fn(),
  useAdminReleaseUpdateStatusQuery: vi.fn(),
  useCheckLatestReleaseMutation: vi.fn(),
  useStartReleaseUpdateMutation: vi.fn(),
  useTestAiConnectionMutation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/hooks/useAdminSystem', () => ({
  useAdminSystemSettingsQuery: mocks.useAdminSystemSettingsQuery,
  useUpdateAdminSystemSettingsMutation: mocks.useUpdateAdminSystemSettingsMutation,
  useAdminReleaseUpdateStatusQuery: mocks.useAdminReleaseUpdateStatusQuery,
  useCheckLatestReleaseMutation: mocks.useCheckLatestReleaseMutation,
  useStartReleaseUpdateMutation: mocks.useStartReleaseUpdateMutation,
  useTestAiConnectionMutation: mocks.useTestAiConnectionMutation,
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
  const testAiMutateAsync = vi.fn();
  const baseSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    site_title: 'Think-Class',
    site_favicon: '',
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
    testAiMutateAsync.mockReset();

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
    mocks.useTestAiConnectionMutation.mockReturnValue({
      mutateAsync: testAiMutateAsync,
      isPending: false,
    });
  });

  it('saves the expanded settings payload through the admin system mutation', async () => {
    mutateAsync.mockResolvedValue({});

    render(<AdminSettings />);

    const reportToggle = await screen.findByRole('checkbox', { name: '开启家长成长报告' });
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

  /**
   * The AI section is the whole point of the round: the five `ai_*` keys were already persisted by
   * `PUT /api/admin/system/settings`, but no page ever rendered a control for them, so `ai_provider`
   * was frozen at its `mock` default on every real deployment.
   */
  describe('the AI provider section', () => {
    it('renders a control for every ai_ key, seeded from the saved settings', async () => {
      render(<AdminSettings />);

      // The five settings are themselves the assertion: a key in the schema with no control is
      // exactly the defect this section fixes, so each one is looked up by its label.
      expect(await screen.findByLabelText('判分方式')).toHaveValue('mock');
      expect(screen.getByLabelText('接口地址')).toHaveValue('');
      expect(screen.getByLabelText('模型名称')).toHaveValue('deepseek-chat');
      expect(screen.getByLabelText('超时时间')).toHaveValue(20000);
      // The key is read back as the server's mask, never as the secret.
      expect(screen.getByLabelText('API 密钥')).toHaveValue('');
    });

    it('saves the whole AI configuration through the same settings mutation', async () => {
      mutateAsync.mockResolvedValue({});
      render(<AdminSettings />);

      fireEvent.change(await screen.findByLabelText('判分方式'), { target: { value: 'http' } });
      fireEvent.change(screen.getByLabelText('接口地址'), {
        target: { value: 'https://api.deepseek.com/v1' },
      });
      fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'sk-new' } });
      fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          ...baseSettings,
          ai_provider: 'http',
          ai_base_url: 'https://api.deepseek.com/v1',
          ai_api_key: 'sk-new',
        });
      });
    });

    it('shows the connection result in place, including the provider that actually answered', async () => {
      // A half-configured `http` provider: the homework plugin keeps working on the mock and says
      // why, and the operator has to be able to read that sentence rather than a bare failure.
      testAiMutateAsync.mockResolvedValue({
        state: { provider: 'mock', available: true, reason: 'AI 服务未配置：缺少 ai_base_url', message: 'x' },
        ok: false,
        message: 'AI 服务未配置：缺少 ai_base_url',
      });
      render(<AdminSettings />);

      fireEvent.click(await screen.findByRole('button', { name: '测试连接' }));

      await waitFor(() => {
        expect(testAiMutateAsync).toHaveBeenCalledTimes(1);
      });
      expect(await screen.findByText('连接未通过')).toBeInTheDocument();
      expect(screen.getByText('当前生效：mock')).toBeInTheDocument();
      expect(screen.getByText('AI 服务未配置：缺少 ai_base_url')).toBeInTheDocument();
      // The message the server wrote is what the operator is told, not a generic failure string.
      expect(mocks.toastError).toHaveBeenCalledWith('AI 服务未配置：缺少 ai_base_url');
    });

    it('reports a working mock as a pass rather than as a missing model', async () => {
      testAiMutateAsync.mockResolvedValue({
        state: { provider: 'mock', available: true, reason: null, message: '当前未接入外部模型' },
        ok: true,
        message: '当前未接入外部模型：客观题自动判分，简答题按评分要点匹配，拍照题需老师批改。',
      });
      render(<AdminSettings />);

      fireEvent.click(await screen.findByRole('button', { name: '测试连接' }));

      expect(await screen.findByText('连接正常')).toBeInTheDocument();
      expect(mocks.toastSuccess).toHaveBeenCalled();
    });
  });
});
