import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStudentPetData: vi.fn(),
  usePetActionMutation: vi.fn(),
  petAction: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  user: { id: 5, role: 'student', studentId: 101, classId: 1 },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/features/pet/hooks/usePet', () => ({
  useStudentPetData: mocks.useStudentPetData,
  usePetActionMutation: mocks.usePetActionMutation,
}));

vi.mock('@/hooks/queries/useClassFeatures', () => ({
  useClassFeatures: () => ({ data: { features: { enable_danmaku: false } } }),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.user }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/confetti', () => ({ launchConfetti: vi.fn() }));
vi.mock('@/components/DanmakuOverlay', () => ({ default: () => null }));

import StudentPetPage from './StudentPetPage';

function petData() {
  return {
    pet: {
      id: 3,
      student_id: 101,
      element_type: 'fire',
      level: 3,
      experience: 40,
      attack_power: 12,
      has_parent_buff: false,
      stage_images: null,
      custom_image: null,
    },
    availablePoints: 100,
    praises: [],
    records: [],
  };
}

function renderPage() {
  return render(<StudentPetPage />);
}

/**
 * 我的学习精灵 - two controls that used to lie by omission.
 *
 * 「去赚积分」 had no `onClick` at all, and the four interact buttons had no pending state, so a
 * double tap spent the points twice. The link now navigates to 答题挑战 (which actually awards
 * points) and the buttons lock while a mutation is in flight.
 */
describe('StudentPetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useStudentPetData.mockReturnValue({ data: petData(), isLoading: false, isError: false, refetch: vi.fn() });
    mocks.usePetActionMutation.mockReturnValue({ mutateAsync: mocks.petAction, isPending: false });
    mocks.petAction.mockResolvedValue({ pet: petData().pet, points: 90 });
  });

  it('sends 去赚积分 to the challenge page instead of doing nothing', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /去赚积分/ }));

    expect(mocks.navigate).toHaveBeenCalledWith('/student/challenge');
  });

  it('locks the interact buttons while the pet mutation is pending', () => {
    mocks.usePetActionMutation.mockReturnValue({ mutateAsync: mocks.petAction, isPending: true });

    renderPage();

    expect(screen.getByRole('button', { name: /喂食/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /特训/ })).toBeDisabled();
  });

  it('does not replace an interact refusal with 网络错误', async () => {
    mocks.petAction.mockRejectedValueOnce(new Error('Not enough points'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /喂食/ }));

    await waitFor(() => expect(mocks.petAction).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
