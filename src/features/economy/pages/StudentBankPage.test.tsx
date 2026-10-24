import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useEconomyData: vi.fn(),
  useEconomyBankMutation: vi.fn(),
  useEconomyTradeMutation: vi.fn(),
  getSummary: vi.fn(),
  deposit: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/economy/hooks/useEconomy', () => ({
  useEconomyData: mocks.useEconomyData,
  useEconomyBankMutation: mocks.useEconomyBankMutation,
  useEconomyTradeMutation: mocks.useEconomyTradeMutation,
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { getSummary: mocks.getSummary },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      // The login-time snapshot deliberately disagrees with the live summary; the dialog must not
      // show this number.
      user: { id: 5, role: 'student', studentId: 101, available_points: 999 },
    }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

import StudentBankPage from './StudentBankPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StudentBankPage />
    </QueryClientProvider>,
  );
}

/**
 * 银行股市 - the wallet in the dialog must be the live number, and 确认 must lock while pending.
 *
 * The dialog used to print `user.available_points` (the login snapshot) after every transaction,
 * and the two submit buttons had no pending state - a double tap withdrew twice. A refusal also
 * ended in a second 「网络错误」 toast over the server's 存款不足/持仓不足.
 */
describe('StudentBankPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useEconomyData.mockReturnValue({
      data: {
        bank: { id: 1, student_id: 101, deposit_amount: 100, interest_rate: 0.01 },
        stocks: [],
        portfolio: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useEconomyBankMutation.mockReturnValue({ mutateAsync: mocks.deposit, isPending: false });
    mocks.useEconomyTradeMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.getSummary.mockResolvedValue({
      success: true,
      summary: { studentId: 101, availableCredits: 42 },
    });
  });

  it('shows the live wallet balance, not the login snapshot', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '存入积分' }));

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
  });

  it('locks the confirm button while the bank mutation is pending', async () => {
    mocks.useEconomyBankMutation.mockReturnValue({ mutateAsync: mocks.deposit, isPending: true });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '存入积分' }));

    const confirm = await screen.findByRole('button', { name: '处理中...' });
    expect(confirm).toBeDisabled();
  });

  it('leaves the refusal to the api layer instead of claiming 网络错误', async () => {
    mocks.deposit.mockRejectedValueOnce(new Error('存款不足'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '存入积分' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(mocks.deposit).toHaveBeenCalledWith({ action: 'deposit', amount: 10 }));
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
