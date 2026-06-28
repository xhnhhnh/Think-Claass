import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';
import { LegacyPetsController, PetController } from './pet.controllers';

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toEqual({ success: false, message });
}

describe('Pet Nest controllers', () => {
  it('keeps module-style /api/pet response data and legacy payloads', () => {
    const service = {
      getStudentPet: vi.fn().mockReturnValue({ pet: { id: 1 }, hasParentBuff: true }),
      getStudentDashboard: vi.fn().mockReturnValue({ pet: { id: 1 }, availablePoints: 20 }),
      listClassmates: vi.fn().mockReturnValue([{ id: 2 }]),
      adoptPet: vi.fn().mockReturnValue({ petId: 3, pet: { id: 3 } }),
      interact: vi.fn().mockReturnValue({ pet: { id: 1 }, points: 15 }),
      updatePet: vi.fn().mockReturnValue({ pet: { id: 1, level: 2 } }),
      listClassPets: vi.fn().mockReturnValue([{ student_id: 1 }]),
      listLeaderboard: vi.fn().mockReturnValue([{ student_id: 1 }]),
      battle: vi.fn().mockReturnValue({ isWin: true }),
    };
    const controller = new PetController(service as any);

    expect(controller.getStudentPet('1')).toEqual({
      success: true,
      data: { pet: { id: 1 }, hasParentBuff: true },
      pet: { id: 1 },
      has_parent_buff: true,
    });
    expect(controller.getStudentDashboard('1')).toEqual({
      success: true,
      data: { pet: { id: 1 }, availablePoints: 20 },
    });
    expect(controller.getClassmates('1')).toEqual({
      success: true,
      data: { classmatesPets: [{ id: 2 }] },
      classmatesPets: [{ id: 2 }],
    });
    expect(controller.adoptPet('1', { elementType: 'fire' })).toMatchObject({ success: true, petId: 3, pet: { id: 3 } });
    expect(controller.interact('1', { actionType: 'feed' })).toMatchObject({ success: true, pet: { id: 1 }, points: 15 });
    expect(controller.updatePet('1', { level: 2 })).toMatchObject({ success: true, message: 'Pet updated successfully', pet: { id: 1, level: 2 } });
    expect(controller.listClassPets('4')).toMatchObject({ success: true, students: [{ student_id: 1 }] });
    expect(controller.listLeaderboard('4')).toMatchObject({ success: true, leaderboard: [{ student_id: 1 }] });
    expect(controller.battle({ studentId: 1, opponentId: 2 })).toMatchObject({ success: true, result: { isWin: true } });
  });

  it('keeps legacy /api/pets shapes and maps ApiError', () => {
    const service = {
      getStudentPet: vi.fn().mockImplementation(() => {
        throw new ApiError(404, 'Student not found');
      }),
      listClassPets: vi.fn().mockReturnValue([{ student_id: 1 }]),
      listClassmates: vi.fn().mockReturnValue([{ id: 2 }]),
      listLeaderboard: vi.fn().mockReturnValue([{ id: 3 }]),
      battle: vi.fn().mockReturnValue({ isWin: true }),
      adoptPet: vi.fn().mockReturnValue({ petId: 4, pet: { id: 4 } }),
      interact: vi.fn().mockReturnValue({ pet: { id: 4 }, points: 5 }),
      updatePet: vi.fn().mockReturnValue({ pet: { id: 4 } }),
    };
    const controller = new LegacyPetsController(service as any);

    expect(controller.listClassPets('1')).toEqual({ success: true, students: [{ student_id: 1 }] });
    expect(controller.listClassmates('1')).toEqual({ success: true, classmatesPets: [{ id: 2 }] });
    expect(controller.listLeaderboard('1')).toEqual({ success: true, leaderboard: [{ id: 3 }] });
    expect(controller.battle({ studentId: 1, opponentId: 2 })).toEqual({ success: true, result: { isWin: true } });
    expect(controller.adoptPet({ studentId: 1, elementType: 'fire' })).toEqual({ success: true, petId: 4, pet: { id: 4 } });
    expect(controller.interact({ studentId: 1, actionType: 'feed' })).toEqual({ success: true, pet: { id: 4 }, points: 5 });
    expect(controller.updatePet('1', {})).toEqual({ success: true, message: 'Pet updated successfully', pet: { id: 4 } });

    try {
      controller.getStudentPet('99');
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 404, 'Student not found');
    }
  });
});
