export function getRankTier(points: number) {
  const level = Math.floor(points / 100) + 1;
  const tiers = ['青铜', '白银', '黄金', '铂金', '钻石', '战神'];
  const tierIndex = Math.min(Math.floor((level - 1) / 5), 5);
  return `${tiers[tierIndex]} Lv.${level}`;
}
