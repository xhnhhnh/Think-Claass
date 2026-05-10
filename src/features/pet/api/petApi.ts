import { apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  AdoptPetInput,
  ClassPetStudentDto,
  PetActionInput,
  PetActionResult,
  PetBattleInput,
  PetBattleResult,
  PetDto,
  StudentPetDashboardDto,
  UpdatePetInput,
} from '../types';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export const petApi = {
  getStudentPet: (studentId: number) =>
    apiGet<ApiSuccess<{ pet: PetDto | null; hasParentBuff: boolean }> & { pet: PetDto | null; has_parent_buff: boolean }>(
      `/api/pet/students/${studentId}`,
    ),

  getStudentDashboard: (studentId: number) =>
    apiGet<ApiSuccess<StudentPetDashboardDto>>(`/api/pet/students/${studentId}/dashboard`),

  getClassPets: (classId: number | string) =>
    apiGet<ApiSuccess<{ students: ClassPetStudentDto[] }> & { students: ClassPetStudentDto[] }>(`/api/pet/classes/${classId}`),

  getClassmates: (studentId: number) =>
    apiGet<ApiSuccess<{ classmatesPets: Array<PetDto & { student_name: string }> }> & { classmatesPets: Array<PetDto & { student_name: string }> }>(
      `/api/pet/students/${studentId}/classmates`,
    ),

  getLeaderboard: (classId: number | string) =>
    apiGet<ApiSuccess<{ leaderboard: Array<PetDto & { student_name: string }> }> & { leaderboard: Array<PetDto & { student_name: string }> }>(
      `/api/pet/classes/${classId}/leaderboard`,
    ),

  adoptPet: (studentId: number, payload: AdoptPetInput) =>
    apiPost<ApiSuccess<{ petId: number; pet: PetDto | null }> & { petId: number; pet: PetDto | null }>(
      `/api/pet/students/${studentId}/adoptions`,
      payload,
    ),

  updatePet: (studentId: number, payload: UpdatePetInput | Record<string, unknown>) =>
    apiPut<ApiSuccess<{ pet: PetDto | null }> & { pet?: PetDto | null }>(`/api/pet/students/${studentId}`, payload),

  interact: (studentId: number, payload: PetActionInput) =>
    apiPost<ApiSuccess<PetActionResult> & PetActionResult>(`/api/pet/students/${studentId}/actions`, payload),

  battle: (payload: PetBattleInput) =>
    apiPost<ApiSuccess<{ result: PetBattleResult }> & { result: PetBattleResult }>('/api/pet/battles', payload),
};
