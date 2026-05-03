import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { GachaCollectionResponse, GachaDrawPayload, GachaDrawResponse, GachaPoolsResponse } from '@/shared/gacha/contracts';

export const gachaApi = {
  getPools: (classId: number) => apiGet<GachaPoolsResponse & { pools?: GachaPoolsResponse['data']['pools'] }>(`/api/gacha/classes/${classId}/pools`),
  draw: (studentId: number, payload: GachaDrawPayload) =>
    apiPost<GachaDrawResponse & { results?: GachaDrawResponse['data']['results'] }>(`/api/gacha/students/${studentId}/draws`, payload),
  getCollection: (studentId: number) =>
    apiGet<GachaCollectionResponse & { collection?: GachaCollectionResponse['data']['collection'] }>(`/api/gacha/students/${studentId}/collection`),
  setActivePet: (studentId: number, instanceId: number) =>
    apiPut<{ success: true; data: { activePetId: number } }>(`/api/gacha/students/${studentId}/active-pet/${instanceId}`),
};

export type { GachaDrawPayload, GachaPool, PetCollectionItem as StudentPetCollectionItem, PetDictionaryEntry as GachaPetResult } from '@/shared/gacha/contracts';
