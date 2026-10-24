import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStudentShopData: vi.fn(),
  useBuyShopItemMutation: vi.fn(),
  useBuyBlindBoxMutation: vi.fn(),
  getStudents: vi.fn(),
  buy: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/queries/useShop', () => ({
  useStudentShopData: mocks.useStudentShopData,
  useBuyShopItemMutation: mocks.useBuyShopItemMutation,
  useBuyBlindBoxMutation: mocks.useBuyBlindBoxMutation,
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { getStudents: mocks.getStudents },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 5, role: 'student', studentId: 101 } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/confetti', () => ({ launchConfetti: vi.fn() }));

import StudentShopPage from './StudentShopPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StudentShopPage />
    </QueryClientProvider>,
  );
}

/**
 * 积分商城 - a purchase is one click, not one per tap.
 *
 * The 立即兑换 button only looked at affordability, so a double tap sent two purchases. It now
 * carries the mutation's pending state, and a refusal is reported with the server's own message
 * (the api layer) instead of a duplicate 「网络错误」 that contradicted it.
 */
describe('StudentShopPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStudents.mockResolvedValue({
      success: true,
      students: [{ id: 101, available_points: 100 }],
    });
    mocks.useStudentShopData.mockReturnValue({
      data: {
        items: [{ id: 1, name: '魔法贴纸', description: '好看', price: 10, stock: 5 }],
        boxes: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useBuyShopItemMutation.mockReturnValue({ mutateAsync: mocks.buy, isPending: false });
    mocks.useBuyBlindBoxMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('disables the兑换 button and labels it while the purchase is in flight', async () => {
    mocks.useBuyShopItemMutation.mockReturnValue({ mutateAsync: mocks.buy, isPending: true });

    renderPage();

    const button = await screen.findByRole('button', { name: '兑换中...' });
    expect(button).toBeDisabled();
  });

  it('does not replace a refused purchase with 「网络错误」', async () => {
    mocks.buy.mockRejectedValueOnce(new Error('Item out of stock'));

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '立即兑换' }));

    await waitFor(() => expect(mocks.buy).toHaveBeenCalledWith(1));
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
