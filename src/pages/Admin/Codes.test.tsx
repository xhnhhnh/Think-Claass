import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminCodes from './Codes';

const mocks = vi.hoisted(() => ({
  getActivationCodes: vi.fn(),
  generateActivationCodes: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: {
    getActivationCodes: mocks.getActivationCodes,
    generateActivationCodes: mocks.generateActivationCodes,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
  },
}));

describe('AdminCodes', () => {
  beforeEach(() => {
    mocks.getActivationCodes.mockReset();
    mocks.generateActivationCodes.mockReset();
    mocks.toastError.mockReset();
  });

  it('renders activation code usage and source from the admin contract fields', async () => {
    mocks.getActivationCodes.mockResolvedValue([
      {
        id: 1,
        code: 'TC-ABCD1234',
        status: 'used',
        usedByUserId: 12,
        usedByUsername: 'student01',
        createdAt: '2026-05-01T08:00:00.000Z',
        usedAt: '2026-05-02T09:30:00.000Z',
        activationSource: 'activation_code',
        activationRemark: '通过激活码完成开通',
      },
    ]);

    render(<AdminCodes />);

    expect(await screen.findByText('TC-ABCD1234')).toBeInTheDocument();
    expect(screen.getByText('student01')).toBeInTheDocument();
    expect(screen.getByText('activation_code')).toBeInTheDocument();
    expect(screen.getByText('通过激活码完成开通')).toBeInTheDocument();

    await waitFor(() => expect(mocks.toastError).not.toHaveBeenCalled());
  });
});
