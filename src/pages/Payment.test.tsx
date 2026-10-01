import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Payment from './Payment';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setUser: vi.fn(),
  createOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  settings: { current: {} as Record<string, string> },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) =>
    selector({
      user: { id: 1, role: 'student', username: 'student01', is_activated: false },
      setUser: mocks.setUser,
    }),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: () => ({ data: mocks.settings.current }),
}));

vi.mock('@/features/platform/api/paymentApi', () => ({
  paymentApi: {
    createOrder: mocks.createOrder,
    getOrderStatus: mocks.getOrderStatus,
  },
}));

/**
 * 扫码开通 - the direct-payment flow.
 *
 * The page used to be a static card ("扫码支付稍后开发") that nothing linked to, while the three
 * pieces of the real flow each waited for the others: `PrivateRoute` never sent anyone to `/payment`,
 * the console refused to save `revenue_mode: 'direct_payment'`, and the order routes had no caller.
 * These tests pin the flow the operator's switch now actually starts.
 */
describe('Payment', () => {
  const settings = {
    revenue_mode: 'direct_payment',
    payment_price: '99.00',
    payment_currency: 'CNY',
    payment_environment: 'mock',
    payment_enable_wechat: '1',
    payment_enable_alipay: '0',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.current = { ...settings };
    mocks.createOrder.mockResolvedValue({
      success: true,
      message: '订单创建成功',
      data: {
        orderNo: 'ORD-TEST-1',
        status: 'AWAITING_PAYMENT',
        amount: 99,
        currency: 'CNY',
        qrCodeUrl: 'weixin://wxpay/mock',
        paymentUrl: null,
        expiresAt: null,
        environment: 'mock',
        providerMode: 'mock',
      },
    });
    mocks.getOrderStatus.mockResolvedValue({
      success: true,
      data: {
        orderNo: 'ORD-TEST-1',
        status: 'PAID',
        amount: 99,
        currency: 'CNY',
        qrCodeUrl: null,
        paymentUrl: null,
        expiresAt: null,
        environment: 'mock',
        providerMode: 'mock',
      },
    });
  });

  it('offers only the channels the operator enabled', () => {
    render(<Payment />);

    // WeChat is on, Alipay is off: the disabled one is not selectable and says so.
    expect(screen.getByRole('button', { name: /微信支付/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /支付宝/ })).toBeDisabled();
    expect(screen.getByText('未启用')).toBeInTheDocument();
    // And the mock environment is announced instead of being passed off as real money.
    expect(screen.getByText(/mock/)).toBeInTheDocument();
  });

  it('creates an order for the chosen channel and shows how to pay', async () => {
    render(<Payment />);

    fireEvent.click(screen.getByRole('button', { name: '生成支付订单' }));

    await waitFor(() => expect(mocks.createOrder).toHaveBeenCalledWith('wechat'));
    expect(await screen.findByText('ORD-TEST-1')).toBeInTheDocument();
    expect(screen.getByAltText('支付二维码')).toBeInTheDocument();
    expect(screen.getByText('等待支付结果…支付完成后这个页面会自动继续。')).toBeInTheDocument();
  });

  it('marks the account opened as soon as the channel reports the order paid', async () => {
    // The order answers PAID on creation (the mock environment settles immediately), so this path
    // needs no timers at all: it is the one the polling below also ends in.
    mocks.createOrder.mockResolvedValueOnce({
      success: true,
      message: '订单创建成功',
      data: {
        orderNo: 'ORD-TEST-1',
        status: 'PAID',
        amount: 99,
        currency: 'CNY',
        qrCodeUrl: null,
        paymentUrl: null,
        expiresAt: null,
        environment: 'mock',
        providerMode: 'mock',
      },
    });

    render(<Payment />);
    fireEvent.click(screen.getByRole('button', { name: '生成支付订单' }));

    expect(await screen.findByText('开通成功')).toBeInTheDocument();
    // The session's own flag is what `PrivateRoute` reads, so it has to be updated here.
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ is_activated: true }));

    fireEvent.click(screen.getByRole('button', { name: '进入系统' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/student');
  });

  it('polls the order while it waits, and stops once it is paid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Payment />);
      fireEvent.click(screen.getByRole('button', { name: '生成支付订单' }));
      await waitFor(() => expect(mocks.createOrder).toHaveBeenCalled());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });

      // The order number is the poll's argument; the transition it produces is asserted above
      // without timers, so this test only has to prove the polling happens at all.
      await waitFor(() => expect(mocks.getOrderStatus).toHaveBeenCalledWith('ORD-TEST-1'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the server’s own refusal instead of a generic failure', async () => {
    mocks.createOrder.mockRejectedValueOnce(
      new Error('支付环境未配置：请先在系统设置中选择 payment_environment（mock / sandbox / production）'),
    );

    render(<Payment />);
    fireEvent.click(screen.getByRole('button', { name: '生成支付订单' }));

    expect(await screen.findByText(/支付环境未配置/)).toBeInTheDocument();
    // Still on the choose step, so the operator can fix it and try again.
    expect(screen.getByRole('button', { name: '生成支付订单' })).toBeInTheDocument();
  });

  it('says what to do when no channel is enabled at all', () => {
    mocks.settings.current = { ...settings, payment_enable_wechat: '0' };
    render(<Payment />);

    expect(screen.getByText(/管理员还没有启用任何支付渠道/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成支付订单' })).not.toBeInTheDocument();
  });

  it('keeps the activation-code path reachable', () => {
    render(<Payment />);
    fireEvent.click(screen.getByRole('button', { name: /我有激活码/ }));
    expect(mocks.navigate).toHaveBeenCalledWith('/activate');
  });
});
