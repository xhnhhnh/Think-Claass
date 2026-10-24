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
  /** The console's role: 系统更新 is a superadmin surface. */
  role: { current: 'superadmin' as string },
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

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: { id: 1, role: mocks.role.current, username: 'admin1' } }),
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
  const refetchSettings = vi.fn();
  const testAiMutateAsync = vi.fn();

  /**
   * The five settings the server only ever answers as `'********'`.
   *
   * The page must not put the mask (or an empty string) back on the wire for them: blank means
   * "keep what is stored", so the field is omitted from the payload entirely.
   */
  const SECRET_KEYS = [
    'payment_wechat_private_key',
    'payment_wechat_api_v3_key',
    'payment_alipay_private_key',
    'payment_alipay_public_key',
    'ai_api_key',
  ] as const;

  /** The settings object a save posts, with the blank secrets omitted. */
  const withoutSecrets = <T extends Record<string, unknown>>(settings: T): Record<string, unknown> => {
    const copy: Record<string, unknown> = { ...settings };
    for (const key of SECRET_KEYS) delete copy[key];
    return copy;
  };

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
    mocks.role.current = 'superadmin';
    checkLatestMutateAsync.mockReset();
    startUpdateMutateAsync.mockReset();
    refetchUpdateStatus.mockReset();
    refetchSettings.mockReset();
    testAiMutateAsync.mockReset();

    mocks.useAdminSystemSettingsQuery.mockReturnValue({
      data: baseSettings,
      isPending: false,
      isError: false,
      refetch: refetchSettings,
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
      expect(mutateAsync).toHaveBeenCalledWith(
        withoutSecrets({ ...baseSettings, enable_parent_report: '0' }),
      );
    });
  });

  /**
   * The read-failure guard.
   *
   * The form is prefilled from the server and `PUT` upserts every field it holds, so rendering a
   * default-valued form after a broken read turns "the settings request failed" into "the operator
   * silently replaced the deployment's configuration with empty values". Only a retry may be offered.
   */
  it('does not render the form when the settings read failed, and retries from the error card', async () => {
    mocks.useAdminSystemSettingsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: refetchSettings,
    });

    render(<AdminSettings />);

    expect(await screen.findByText('系统设置没有加载成功')).toBeInTheDocument();
    expect(screen.getByText(/直接保存会用默认值覆盖线上配置/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存设置' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetchSettings).toHaveBeenCalledTimes(1);
  });

  it('leaves the save error to the api layer instead of stacking a generic network toast', async () => {
    mutateAsync.mockRejectedValue(new Error('保存被拒绝'));
    render(<AdminSettings />);

    fireEvent.click(await screen.findByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // `@/lib/api` already showed the server's sentence; the page must not replace it with
    // 「网络错误」 or show both.
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  /**
   * The secrets contract.
   *
   * The server answers a configured secret as `'********'`; the form must start those inputs empty
   * and only send a sensitive key when the operator actually typed a new value. Sending the mask
   * back is a no-op server-side, but sending `''` used to erase the stored secret.
   */
  it('keeps configured secrets out of the form and omits untouched ones from the save payload', async () => {
    const masked = {
      ...baseSettings,
      payment_wechat_private_key: '********',
      payment_wechat_api_v3_key: '********',
      payment_alipay_private_key: '********',
      payment_alipay_public_key: '********',
      ai_api_key: '********',
    };
    mocks.useAdminSystemSettingsQuery.mockReturnValue({
      data: masked,
      isPending: false,
      isError: false,
      refetch: refetchSettings,
    });

    render(<AdminSettings />);

    // The value is blank, not the mask, and the field says what blank means.
    expect(await screen.findByLabelText('API 密钥')).toHaveValue('');
    expect(screen.getAllByText('已配置，留空保持不变。').length).toBeGreaterThanOrEqual(5);

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    const payload = mutateAsync.mock.calls[0][0] as Record<string, unknown>;
    for (const key of SECRET_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('hides the release-update panel from a plain admin, and says why', async () => {
    mocks.role.current = 'admin';
    render(<AdminSettings />);

    // All three release routes are superadmin-only; before this the panel queried anyway and a plain
    // admin saw 「读取中...」 forever plus a "无法获取 GitHub Release" toast on 检查更新.
    expect(await screen.findByText(/仅超级管理员可见/)).toBeInTheDocument();
    expect(screen.getByText(/需要超级管理员权限/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /检查更新/ })).not.toBeInTheDocument();
    expect(mocks.useAdminReleaseUpdateStatusQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('lets the operator choose direct payment, and offers a control for every payment key', async () => {
    render(<AdminSettings />);

    // The option used to be `disabled` *and* rewritten back to `activation_code` on load, so
    // `direct_payment` could not be saved and `PrivateRoute`'s branch for it was dead code.
    const directPaymentOption = await screen.findByRole('option', { name: '直接支付' });
    expect(directPaymentOption).toBeEnabled();

    // ...and the channel configuration those orders need is reachable. `admin-settings-coverage`
    // asserts the set of controls; this asserts the two an operator meets first.
    expect(screen.getByText('支付渠道')).toBeInTheDocument();
    expect(screen.getByLabelText('支付环境')).toBeInTheDocument();
    expect(screen.getByLabelText('回调地址')).toBeInTheDocument();
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
          ...withoutSecrets({
            ...baseSettings,
            ai_provider: 'http',
            ai_base_url: 'https://api.deepseek.com/v1',
          }),
          // The one secret the operator did type is sent; the untouched ones are omitted.
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
