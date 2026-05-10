import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { petApi } from './petApi';

describe('petApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
  });

  it('uses new student pet paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: { pet: null, hasParentBuff: false } });

    await petApi.getStudentPet(9);
    await petApi.getStudentDashboard(9);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/pet/students/9');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/pet/students/9/dashboard');
  });

  it('uses new class and battle paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: { students: [] } });
    mocks.apiPost.mockResolvedValue({ success: true, data: { result: { isWin: true } } });

    await petApi.getClassPets(3);
    await petApi.getLeaderboard(3);
    await petApi.getClassmates(9);
    await petApi.battle({ studentId: 9, opponentId: 10 });

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/pet/classes/3');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/pet/classes/3/leaderboard');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/pet/students/9/classmates');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/pet/battles', { studentId: 9, opponentId: 10 });
  });

  it('uses write verbs for adoption, actions, and teacher update', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });

    await petApi.adoptPet(9, { elementType: 'fire' });
    await petApi.interact(9, { actionType: '训练', cost: 60, expGain: 80, type: 'TRAIN' });
    await petApi.updatePet(9, { level: 2 });

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/pet/students/9/adoptions', { elementType: 'fire' });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/pet/students/9/actions', { actionType: '训练', cost: 60, expGain: 80, type: 'TRAIN' });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/pet/students/9', { level: 2 });
  });
});
