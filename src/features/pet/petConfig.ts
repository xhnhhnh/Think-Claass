import dragonStage1 from '@/assets/pets/dragon/stage-1-cutout.png';
import dragonStage2 from '@/assets/pets/dragon/stage-2-cutout.png';
import dragonStage3 from '@/assets/pets/dragon/stage-3-cutout.png';
import dragonStage4 from '@/assets/pets/dragon/stage-4-cutout.png';
import dragonStage5 from '@/assets/pets/dragon/stage-5-cutout.png';
import dragonStage6 from '@/assets/pets/dragon/stage-6-cutout.png';
import electricStage1 from '@/assets/pets/electric/stage-1-cutout.png';
import electricStage2 from '@/assets/pets/electric/stage-2-cutout.png';
import electricStage3 from '@/assets/pets/electric/stage-3-cutout.png';
import electricStage4 from '@/assets/pets/electric/stage-4-cutout.png';
import electricStage5 from '@/assets/pets/electric/stage-5-cutout.png';
import electricStage6 from '@/assets/pets/electric/stage-6-cutout.png';
import fireStage1 from '@/assets/pets/fire/stage-1-cutout.png';
import fireStage2 from '@/assets/pets/fire/stage-2-cutout.png';
import fireStage3 from '@/assets/pets/fire/stage-3-cutout.png';
import fireStage4 from '@/assets/pets/fire/stage-4-cutout.png';
import fireStage5 from '@/assets/pets/fire/stage-5-cutout.png';
import fireStage6 from '@/assets/pets/fire/stage-6-cutout.png';
import grassStage1 from '@/assets/pets/grass/stage-1-cutout.png';
import grassStage2 from '@/assets/pets/grass/stage-2-cutout.png';
import grassStage3 from '@/assets/pets/grass/stage-3-cutout.png';
import grassStage4 from '@/assets/pets/grass/stage-4-cutout.png';
import grassStage5 from '@/assets/pets/grass/stage-5-cutout.png';
import grassStage6 from '@/assets/pets/grass/stage-6-cutout.png';
import iceStage1 from '@/assets/pets/ice/stage-1-cutout.png';
import iceStage2 from '@/assets/pets/ice/stage-2-cutout.png';
import iceStage3 from '@/assets/pets/ice/stage-3-cutout.png';
import iceStage4 from '@/assets/pets/ice/stage-4-cutout.png';
import iceStage5 from '@/assets/pets/ice/stage-5-cutout.png';
import iceStage6 from '@/assets/pets/ice/stage-6-cutout.png';
import waterStage1 from '@/assets/pets/water/stage-1-cutout.png';
import waterStage2 from '@/assets/pets/water/stage-2-cutout.png';
import waterStage3 from '@/assets/pets/water/stage-3-cutout.png';
import waterStage4 from '@/assets/pets/water/stage-4-cutout.png';
import waterStage5 from '@/assets/pets/water/stage-5-cutout.png';
import waterStage6 from '@/assets/pets/water/stage-6-cutout.png';

export const PET_ELEMENTS = [
  { id: 'fire', name: '火系', color: 'bg-red-500', bg: 'bg-red-50', icon: '🔥' },
  { id: 'water', name: '水系', color: 'bg-blue-500', bg: 'bg-blue-50', icon: '💧' },
  { id: 'grass', name: '草系', color: 'bg-green-500', bg: 'bg-green-50', icon: '🌿' },
  { id: 'electric', name: '电系', color: 'bg-yellow-400', bg: 'bg-yellow-50', icon: '⚡' },
  { id: 'ice', name: '冰系', color: 'bg-cyan-300', bg: 'bg-cyan-50', icon: '❄️' },
  { id: 'dragon', name: '龙系', color: 'bg-purple-500', bg: 'bg-purple-50', icon: '🐉' },
] as const;

export type PetElementId = (typeof PET_ELEMENTS)[number]['id'];

const defaultPetStageImages: Record<PetElementId, string[]> = {
  fire: [fireStage1, fireStage2, fireStage3, fireStage4, fireStage5, fireStage6],
  water: [waterStage1, waterStage2, waterStage3, waterStage4, waterStage5, waterStage6],
  grass: [grassStage1, grassStage2, grassStage3, grassStage4, grassStage5, grassStage6],
  electric: [electricStage1, electricStage2, electricStage3, electricStage4, electricStage5, electricStage6],
  ice: [iceStage1, iceStage2, iceStage3, iceStage4, iceStage5, iceStage6],
  dragon: [dragonStage1, dragonStage2, dragonStage3, dragonStage4, dragonStage5, dragonStage6],
};

function normalizeLevel(level: number | null | undefined) {
  return Math.min(Math.max(Number(level) || 1, 1), 6);
}

function normalizeElement(elementType: unknown): PetElementId {
  return PET_ELEMENTS.some((element) => element.id === elementType) ? elementType as PetElementId : 'fire';
}

export function getDefaultPetStageImage(level: number | null | undefined, elementType: unknown = 'fire') {
  return defaultPetStageImages[normalizeElement(elementType)][normalizeLevel(level) - 1];
}

export function getPetDisplayImage(pet: Record<string, unknown> | null | undefined) {
  if (!pet) return null;
  const level = normalizeLevel(Number(pet.level));
  const defaultImage = getDefaultPetStageImage(level, pet.element_type);
  const stageImage = pet[`image_stage${level}`];
  return typeof stageImage === 'string' && stageImage
    ? stageImage
    : typeof pet.custom_image === 'string' && pet.custom_image
      ? pet.custom_image
      : defaultImage;
}

export function getEvolutionStage(level: number) {
  if (level === 1) return '萌蛋期';
  if (level === 2) return '幼年期';
  if (level === 3) return '成长期';
  if (level === 4) return '成熟期';
  if (level === 5) return '完全体';
  return '究极体';
}

export function getPetIcon(level: number) {
  if (level === 1) return '🥚';
  if (level === 2) return '🐣';
  if (level === 3) return '🐥';
  if (level === 4) return '🦅';
  if (level === 5) return '🐉';
  return '👑';
}

export function getPetElement(elementType: string) {
  return PET_ELEMENTS.find((element) => element.id === elementType) ?? PET_ELEMENTS[0];
}
