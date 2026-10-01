import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminOpenApi from './AdminOpenApiPage';

const mocks = vi.hoisted(() => ({
  getOpenApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getSchools: vi.fn(),
  createSchool: vi.fn(),
  updateSchool: vi.fn(),
  deleteSchool: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: {
    getOpenApiKeys: mocks.getOpenApiKeys,
    createApiKey: mocks.createApiKey,
    deleteOpenApiKey: mocks.deleteApiKey,
    getSchools: mocks.getSchools,
    createSchool: mocks.createSchool,
    updateSchool: mocks.updateSchool,
    deleteSchool: mocks.deleteSchool,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

/**
 * 合作校园 - the edit half.
 *
 * The console could add a partner school and delete one, but not correct one, while
 * `PUT /api/openapi/schools/:id` sat there with no caller. A typo in a school's name or contact
 * therefore meant deleting the row - and its `id` is what the API keys reference.
 */
describe('AdminOpenApiPage schools', () => {
  // The shape `adminClient.getSchools()` answers with: camelCase, snake_case only on the wire.
  const school = {
    id: 4,
    name: '示范中学',
    description: '一所学校',
    contactInfo: '010-0000',
    createdAt: '2026-03-01 00:00:00',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOpenApiKeys.mockResolvedValue([]);
    mocks.getSchools.mockResolvedValue([school]);
    mocks.createSchool.mockResolvedValue({ success: true, school });
    mocks.updateSchool.mockResolvedValue({ success: true, school });
    mocks.deleteSchool.mockResolvedValue({ success: true });
  });

  const openSchools = async () => {
    render(<AdminOpenApi />);
    // The tab's accessible name includes its icon, so it is matched loosely.
    fireEvent.click(await screen.findByRole('button', { name: /合作校园/ }));
    await screen.findByText('示范中学');
  };

  it('loads a row into the dialog and saves it through the update route', async () => {
    await openSchools();

    fireEvent.click(screen.getByRole('button', { name: '编辑校园 示范中学' }));

    // The dialog opens as an edit, prefilled - not as an empty "add".
    expect(await screen.findByText('编辑合作校园')).toBeInTheDocument();
    expect(screen.getByDisplayValue('示范中学')).toBeInTheDocument();
    expect(screen.getByDisplayValue('010-0000')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('示范中学'), { target: { value: '示范中学（新校区）' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(mocks.updateSchool).toHaveBeenCalledWith(4, {
        name: '示范中学（新校区）',
        description: '一所学校',
        contactInfo: '010-0000',
      }),
    );
    expect(mocks.createSchool).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('入驻学校已更新');
  });

  it('still creates when the dialog is opened as an add', async () => {
    await openSchools();

    fireEvent.click(screen.getByRole('button', { name: /添加校园/ }));

    expect(await screen.findByText('添加合作校园')).toBeInTheDocument();
    // Nothing prefilled: the previous edit's values must not leak into a create.
    expect(screen.queryByDisplayValue('示范中学')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('请输入学校名称'), { target: { value: '第二中学' } });
    fireEvent.click(screen.getByRole('button', { name: '添加校园' }));

    await waitFor(() => expect(mocks.createSchool).toHaveBeenCalled());
    expect(mocks.updateSchool).not.toHaveBeenCalled();
  });

  it('does not delete a school that the dialog was only editing', async () => {
    await openSchools();

    fireEvent.click(screen.getByRole('button', { name: '编辑校园 示范中学' }));
    await screen.findByText('编辑合作校园');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByText('编辑合作校园')).not.toBeInTheDocument());
    expect(mocks.deleteSchool).not.toHaveBeenCalled();

    // And the next add starts empty rather than resuming the cancelled edit.
    fireEvent.click(screen.getByRole('button', { name: /添加校园/ }));
    expect(await screen.findByText('添加合作校园')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('示范中学')).not.toBeInTheDocument();
  });
});
