export function getRankTier(points: number) {
  if (points >= 500) return '远航';
  if (points >= 300) return '领航';
  if (points >= 150) return '探索';
  if (points >= 50) return '启程';
  return '萌芽';
}
