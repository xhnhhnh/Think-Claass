import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adoptPet: vi.fn(),
  getClassPets: vi.fn(),
  getStudentDashboard: vi.fn(),
  interact: vi.fn(),
  updatePet: vi.fn(),
}));

vi.mock('../api/petApi', () => ({
  petApi: {
    adoptPet: mocks.adoptPet,
    getClassPets: mocks.getClassPets,
    getStudentDashboard: mocks.getStudentDashboard,
    interact: mocks.interact,
    updatePet: mocks.updatePet,
  },
}));

import { petQueryKeys, useClassPets, usePetActionMutation, useStudentPetData, useTeacherPetMutation } from './usePet';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { Wrapper, invalidateSpy };
}

describe('pet feature hooks', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('loads student dashboard through the feature api', async () => {
    mocks.getStudentDashboard.mockResolvedValue({ success: true, data: { pet: null, availablePoints: 10, praises: [], records: [] } });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useStudentPetData(7), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.availablePoints).toBe(10);
    expect(mocks.getStudentDashboard).toHaveBeenCalledWith(7);
  });

  it('loads class pets through a fixed pet class key', async () => {
    mocks.getClassPets.mockResolvedValue({ success: true, data: { students: [{ student_id: 1, student_name: '学生', has_pet: false, pet: null }] } });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useClassPets(3), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mocks.getClassPets).toHaveBeenCalledWith(3);
  });

  it('routes student mutations and invalidates dashboard data', async () => {
    mocks.interact.mockResolvedValue({ success: true, pet: { id: 1 }, points: 40 });
    const { Wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => usePetActionMutation(7), { wrapper: Wrapper });
    await result.current.mutateAsync({ type: 'interact', actionType: '训练', cost: 60, expGain: 80, actionLogType: 'TRAIN' });

    expect(mocks.interact).toHaveBeenCalledWith(7, { actionType: '训练', cost: 60, expGain: 80, type: 'TRAIN' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: petQueryKeys.studentDashboard(7) });
  });

  it('routes teacher pet updates through feature api', async () => {
    mocks.updatePet.mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useTeacherPetMutation(), { wrapper: Wrapper });
    await result.current.mutateAsync({ studentId: 7, data: { level: 2 } });

    expect(mocks.updatePet).toHaveBeenCalledWith(7, { level: 2 });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pet', 'class-pets'] });
  });
});
