import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminAuditLogs from './AdminAuditLogsPage';

const mocks = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: { getAuditLogs: mocks.getAuditLogs },
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

/**
 * 审计日志 - the filter controls.
 *
 * 重置 cleared the three fields and then called the *previous* render's fetch through a
 * `setTimeout`, so the cleared values only reached the API if the page number happened to change
 * with them. "Reset the filter" is a promise a button makes, and this is what keeps it.
 */
describe('AdminAuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuditLogs.mockResolvedValue({ success: true, data: [], total: 0 });
  });

  it('asks for the unfiltered first page when 重置 is pressed', async () => {
    render(<AdminAuditLogs />);
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('教师 ID'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText('例如: LOGIN, UPDATE_USER'), { target: { value: 'LOGIN' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() =>
      expect(mocks.getAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 0, teacherId: 5, userId: 8, action: 'LOGIN' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '重置' }));

    await waitFor(() =>
      expect(mocks.getAuditLogs).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 0,
        teacherId: undefined,
        userId: undefined,
        action: undefined,
      }),
    );
  });

  it('says the read failed instead of showing an empty log', async () => {
    mocks.getAuditLogs.mockRejectedValueOnce(new Error('offline'));
    render(<AdminAuditLogs />);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('网络错误，无法获取审计日志'));

    // The table's own empty state is the one sentence an audit page must never say on a failed read.
    expect(await screen.findByText('数据加载失败')).toBeInTheDocument();
    expect(screen.queryByText('没有找到符合条件的审计日志')).not.toBeInTheDocument();
  });
});
