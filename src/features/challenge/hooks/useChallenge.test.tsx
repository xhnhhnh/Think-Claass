import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  attackBoss: vi.fn(),
  getActiveBoss: vi.fn(),
  getQuestions: vi.fn(),
  submitAnswers: vi.fn(),
}));

vi.mock('../api/challengeApi', () => ({
  challengeApi: {
    attackBoss: mocks.attackBoss,
    getActiveBoss: mocks.getActiveBoss,
    getQuestions: mocks.getQuestions,
    submitAnswers: mocks.submitAnswers,
  },
}));

import { challengeQueryKeys, useActiveBoss, useAttackBossMutation, useChallengeQuestions, useChallengeSubmitMutation } from './useChallenge';

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

describe('challenge feature hooks', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('loads questions with student context', async () => {
    mocks.getQuestions.mockResolvedValue({ success: true, data: { questions: [{ id: 1, title: '题目' }] } });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useChallengeQuestions(7, 5), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.getQuestions).toHaveBeenCalledWith(7, 5);
    expect(result.current.data).toEqual([{ id: 1, title: '题目' }]);
  });

  it('submits answers through challengeApi', async () => {
    mocks.submitAnswers.mockResolvedValue({ success: true });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useChallengeSubmitMutation(7), { wrapper: Wrapper });

    await result.current.mutateAsync({ 1: 'A' });

    expect(mocks.submitAnswers).toHaveBeenCalledWith({ studentId: 7, answers: { 1: 'A' } });
  });

  it('loads and invalidates active boss data', async () => {
    mocks.getActiveBoss.mockResolvedValue({ success: true, data: { boss: { id: 2, name: 'Boss' } } });
    mocks.attackBoss.mockResolvedValue({ success: true });
    const { Wrapper, invalidateSpy } = createWrapper();
    const query = renderHook(() => useActiveBoss(3), { wrapper: Wrapper });

    await waitFor(() => expect(query.result.current.isSuccess).toBe(true));

    const mutation = renderHook(() => useAttackBossMutation(7, 3), { wrapper: Wrapper });
    await mutation.result.current.mutateAsync(2);

    expect(mocks.attackBoss).toHaveBeenCalledWith(2, 7);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: challengeQueryKeys.activeBoss(3) });
  });
});
