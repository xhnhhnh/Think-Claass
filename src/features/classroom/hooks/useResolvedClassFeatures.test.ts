/**
 * The feature-flag resolver: "we cannot answer" is not "everything is off".
 *
 * Every consumer of class feature flags goes through this hook, so the states it reports are the
 * contract the layouts and the route guard depend on. The cases below are the ones that were wrong
 * before it existed:
 *
 *   - a class id with a snapshot and a request still in flight → decidable on the snapshot, and
 *     `isError` false;
 *   - a class id with neither → NOT decidable, and NOT all-off-therefore-closed;
 *   - a class id, a failed request, no snapshot → NOT decidable but `isError` set, so the consumer
 *     can offer a retry instead of a locked page;
 *   - no class id → the snapshot is the answer and it is immediately decidable.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useResolvedClassFeatures } from './useResolvedClassFeatures';
import type { ClassFeatures } from '@/lib/classFeatures';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useClassFeatures: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({ useStore: mocks.useStore }));

vi.mock('@/hooks/queries/useClassFeatures', () => ({ useClassFeatures: mocks.useClassFeatures }));

const SNAPSHOT: ClassFeatures = { enable_shop: true } as ClassFeatures;

/** The login snapshot a student's payload carries. `undefined` models an account with no class. */
function mockUser(classFeatures?: ClassFeatures) {
  mocks.useStore.mockImplementation((selector: any) => selector({ user: { id: 1, classFeatures } }));
}

/** A React Query result shape, narrowed to the fields the hook reads. */
function mockQuery(partial: Record<string, unknown>) {
  mocks.useClassFeatures.mockReturnValue({ refetch: vi.fn(), isError: false, ...partial });
}

describe('useResolvedClassFeatures', () => {
  beforeEach(() => {
    mockUser(SNAPSHOT);
    mockQuery({});
  });

  it('decides on the login snapshot while the class request is still in flight', () => {
    const { result } = renderHook(() => useResolvedClassFeatures(3));

    expect(result.current.canDecide).toBe(true);
    expect(result.current.source).toBe('login-snapshot');
    expect(result.current.features.enable_shop).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('cannot decide when a class is given and there is no snapshot either', () => {
    mockUser(undefined);
    mockQuery({});

    const { result } = renderHook(() => useResolvedClassFeatures(3));

    // This is the state that used to render every feature as switched off.
    expect(result.current.canDecide).toBe(false);
    expect(result.current.source).toBe('unknown');
    expect(result.current.isError).toBe(false);
  });

  it('uses the live class answer once it arrives, and prefers it to the snapshot', () => {
    mockQuery({ data: { features: { enable_shop: false } as ClassFeatures }, isFetched: true });

    const { result } = renderHook(() => useResolvedClassFeatures(3));

    expect(result.current.source).toBe('class');
    expect(result.current.canDecide).toBe(true);
    expect(result.current.features.enable_shop).toBe(false);
  });

  it('reports a failed request without falling back to "all off"', () => {
    mockQuery({ isError: true, isFetched: true });

    const { result } = renderHook(() => useResolvedClassFeatures(3));

    expect(result.current.isError).toBe(true);
    // The snapshot still answers, so the page is usable AND the failure is surfaced.
    expect(result.current.canDecide).toBe(true);
    expect(result.current.source).toBe('login-snapshot');
    expect(result.current.features.enable_shop).toBe(true);
  });

  it('cannot decide after a failure with no snapshot, which is what drives the retry state', () => {
    mockUser(undefined);
    mockQuery({ isError: true, isFetched: true });

    const { result } = renderHook(() => useResolvedClassFeatures(3));

    expect(result.current.canDecide).toBe(false);
    expect(result.current.isError).toBe(true);
  });

  it('exposes a refetch that reaches the query', () => {
    const refetch = vi.fn();
    mockQuery({ isError: true, refetch });

    const { result } = renderHook(() => useResolvedClassFeatures(3));
    result.current.refetch();

    expect(refetch).toHaveBeenCalled();
  });

  it('treats a missing class id as a real answer taken from the snapshot', () => {
    const { result } = renderHook(() => useResolvedClassFeatures(null));

    expect(result.current.canDecide).toBe(true);
    expect(result.current.source).toBe('login-snapshot');
    expect(result.current.features.enable_shop).toBe(true);
  });

  it('treats a missing class id and no snapshot as a known-but-empty answer', () => {
    mockUser(undefined);

    const { result } = renderHook(() => useResolvedClassFeatures(null));

    // An account not yet bound to a class genuinely has no features; that is not a pending state,
    // so the empty state the UI shows for it is honest rather than a premature "feature off".
    expect(result.current.canDecide).toBe(true);
    expect(result.current.source).toBe('empty');
    expect(result.current.features.enable_shop).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
