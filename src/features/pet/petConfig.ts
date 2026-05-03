export const PET_ELEMENTS = [
  { id: 'fire', name: '火系', color: 'bg-red-500', bg: 'bg-red-50', icon: '🔥' },
  { id: 'water', name: '水系', color: 'bg-blue-500', bg: 'bg-blue-50', icon: '💧' },
  { id: 'grass', name: '草系', color: 'bg-green-500', bg: 'bg-green-50', icon: '🌿' },
  { id: 'electric', name: '电系', color: 'bg-yellow-400', bg: 'bg-yellow-50', icon: '⚡' },
  { id: 'ice', name: '冰系', color: 'bg-cyan-300', bg: 'bg-cyan-50', icon: '❄️' },
  { id: 'dragon', name: '龙系', color: 'bg-purple-500', bg: 'bg-purple-50', icon: '🐉' },
] as const;

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
