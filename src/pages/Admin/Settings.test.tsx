import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminSettings from './Settings';

const mocks = vi.hoisted(() => ({
  useAdminSystemSettingsQuery: vi.fn(),
  useUpdateAdminSystemSettingsMutation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/hooks/useAdminSystem', () => ({
  useAdminSystemSettingsQuery: mocks.useAdminSystemSettingsQuery,
  useUpdateAdminSystemSettingsMutation: mocks.useUpdateAdminSystemSettingsMutation,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('AdminSettings', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();

    mocks.useAdminSystemSettingsQuery.mockReturnValue({
      data: {
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
        payment_enable_wechat: '1',
        payment_enable_alipay: '1',
      },
      isPending: false,
    });
    mocks.useUpdateAdminSystemSettingsMutation.mockReturnValue({
      mutateAsync,
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
        site_title: 'Think-Class',
        site_favicon: '/favicon.svg',
        allow_teacher_registration: '1',
        revenue_enabled: '0',
        revenue_mode: 'activation_code',
        enable_teacher_analytics: '1',
        enable_parent_report: '0',
        payment_price: '99.00',
        payment_currency: 'CNY',
        payment_description: 'Think-Class 平台激活',
        payment_environment: 'mock',
        payment_enable_wechat: '1',
        payment_enable_alipay: '1',
      });
    });
  });

  it('renders the phase-one module notice instead of calling missing update endpoints', async () => {
    render(<AdminSettings />);

    expect(await screen.findByText('管理后台核心设置链路已迁移到新架构')).toBeInTheDocument();
    expect(screen.getByText(/不再主动请求不存在的升级接口/)).toBeInTheDocument();
  });
});
