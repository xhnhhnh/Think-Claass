import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminSettings from './Settings';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPut: mocks.apiPut,
  apiPost: mocks.apiPost,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
  },
}));

describe('AdminSettings', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiPost.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.toastInfo.mockReset();

    mocks.apiGet
      .mockResolvedValueOnce({
        success: true,
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
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          currentVersion: '1.0.0',
          latestVersion: '1.0.0',
          hasUpdate: false,
          platform: 'win32',
        },
      });
  });

  it('saves the expanded settings payload', async () => {
    mocks.apiPut.mockResolvedValue({ success: true });

    render(<AdminSettings />);

    const reportToggle = await screen.findByLabelText('开启家长成长报告');
    fireEvent.click(reportToggle);
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith('/api/admin/settings', {
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

  it('sends update confirmation token when executing update', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    mocks.apiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        hasUpdate: true,
        releaseNotes: 'bug fixes',
        publishedAt: '2026-04-11T00:00:00.000Z',
        platform: 'linux',
      },
    });
    mocks.apiPost.mockResolvedValue({ success: true, message: 'ok' });

    render(<AdminSettings />);

    const checkButtons = await screen.findAllByRole('button', { name: '检查更新' });
    fireEvent.click(checkButtons[0]);
    await screen.findByText('发现新版本可用');

    fireEvent.change(screen.getByPlaceholderText('输入 UPDATE 以确认'), {
      target: { value: 'UPDATE' },
    });
    fireEvent.click(screen.getByRole('button', { name: '一键更新并重启' }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/admin/system/update/execute', {
        confirmation: 'UPDATE',
      });
    });
  });
});
