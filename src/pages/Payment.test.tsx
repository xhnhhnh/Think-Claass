import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Payment from './Payment';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useStore: vi.fn(),
  createOrder: vi.fn(),
  usePaymentOrderStatus: vi.fn(),
  useSettings: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/api/payment', () => ({
  paymentApi: {
    createOrder: mocks.createOrder,
  },
}));

vi.mock('@/hooks/queries/usePayment', () => ({
  usePaymentOrderStatus: mocks.usePaymentOrderStatus,
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: mocks.useSettings,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('Payment', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.createOrder.mockReset();
    mocks.useStore.mockImplementation((selector: any) =>
      selector({
        user: { id: 8, is_activated: false, role: 'parent' },
        setUser: vi.fn(),
      }),
    );
    mocks.useSettings.mockReturnValue({
      data: {
        payment_price: '99.00',
        payment_description: 'Think-Class 平台激活',
        payment_environment: 'mock',
        payment_enable_wechat: '1',
        payment_enable_alipay: '1',
      },
    });
    mocks.usePaymentOrderStatus.mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  const renderPage = () => {
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <Payment />
      </QueryClientProvider>,
    );
  };

  it('creates order through payment api', async () => {
    mocks.createOrder.mockResolvedValue({
      success: true,
      data: {
        orderNo: 'ORD-001',
        status: 'AWAITING_PAYMENT',
        amount: 99,
        currency: 'CNY',
        qrCodeUrl: 'mock://qr',
        paymentUrl: 'mock://pay',
        expiresAt: null,
        environment: 'mock',
        providerMode: 'mock',
      },
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '立即支付' }));

    await waitFor(() => {
      expect(mocks.createOrder).toHaveBeenCalledWith('wechat', expect.anything());
    });
  });

  it('shows order status content after order creation', async () => {
    mocks.createOrder.mockResolvedValue({
      success: true,
      data: {
        orderNo: 'ORD-001',
        status: 'AWAITING_PAYMENT',
        amount: 99,
        currency: 'CNY',
        qrCodeUrl: 'mock://qr',
        paymentUrl: 'mock://pay',
        expiresAt: null,
        environment: 'mock',
        providerMode: 'mock',
      },
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '立即支付' }));

    expect(await screen.findByText('订单号：ORD-001')).toBeInTheDocument();
    expect(screen.getByText('打开支付链接')).toBeInTheDocument();
    expect(screen.getByText('渠道适配器：mock')).toBeInTheDocument();
  });
});
