import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Payment from './Payment';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({
    user: { id: 1, role: 'student', username: 'student01', is_activated: false },
    setUser: mocks.setUser,
  }),
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: () => ({ data: { revenue_mode: 'activation_code' } }),
}));

vi.mock('@/hooks/queries/usePayment', () => ({
  usePaymentOrderStatus: () => ({ data: null, isLoading: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe('Payment', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.setUser.mockReset();
  });

  it('shows scan payment as delayed and routes users to card-key activation', () => {
    render(<Payment />);

    expect(screen.getByText('扫码支付稍后开发')).toBeInTheDocument();
    expect(screen.getByText('本轮请使用卡密/激活码完成账号开通。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '前往输入卡密' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/activate');
  });
});
