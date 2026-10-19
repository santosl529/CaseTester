// Which tiers a student may pick on a drill in Browse drills
// (docs/prd-drills.md "Browse drills"): "any level up to one above the
// student's current tier on that drill (first time: tier 1 or 2), so nobody
// starts at the hardest level cold."
import { DRILLS_CONFIG } from '../config';

export function allowedTiers(currentTier: number | undefined): number[] {
  const t = DRILLS_CONFIG.rules.tiers;
  const max = currentTier === undefined ? 2 : Math.min(t.max, currentTier + 1);
  return Array.from({ length: max - t.min + 1 }, (_, i) => t.min + i);
}
