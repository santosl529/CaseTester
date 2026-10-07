// Set-level results (docs/prd-drills.md "Set results screen", "Skill score
// from a set", "Difficulty tiers"): set score, pass, per-skill scores, the
// mistake summary and the next tier. Pure code.
import { DRILLS_CONFIG, type Drill } from '../config';
import type { Tier } from '../item-schema';
import { tagLabel, type ItemResult } from './scoring';

export function setScore(results: ItemResult[]): number {
  return results.length ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;
}

export function passed(drill: Drill, score: number): boolean {
  return score >= drill.pass_bar - 1e-9;
}

// A set's score for a skill is the weighted average of the items (or steps)
// tied to it, and counts only with at least 3 of them (PRD). Skipped items
// count as 0 for every skill the item trains.
export function skillScores(attempts: { skills: string[]; result: ItemResult }[]): Record<string, { score: number; count: number }> {
  const acc = new Map<string, { sum: number; weight: number; count: number }>();
  const add = (skill: string, score: number, weight: number) => {
    const a = acc.get(skill) ?? { sum: 0, weight: 0, count: 0 };
    acc.set(skill, { sum: a.sum + score * weight, weight: a.weight + weight, count: a.count + 1 });
  };
  for (const { skills, result } of attempts) {
    if (result.skipped || result.steps.length === 0) for (const s of skills) add(s, 0, 1);
    else for (const step of result.steps) for (const s of step.skills) add(s, step.score, step.weight);
  }
  const min = DRILLS_CONFIG.rules.mastery.min_items_or_checks_per_skill;
  return Object.fromEntries([...acc]
    .filter(([, a]) => a.count >= min)
    .map(([skill, a]) => [skill, { score: Number((a.sum / a.weight).toFixed(4)), count: a.count }]));
}

// "2 of your 3 misses were unit errors": the most common mistake among
// misses. Skips are left out of mistake analysis.
export function mistakeSummary(results: ItemResult[]): { text: string; top: { tag: string; count: number }[]; misses: number } | null {
  const misses = results.filter(r => !r.skipped && r.score < 1);
  if (misses.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of misses) for (const t of r.mistake_tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  if (top.length === 0) return null;
  const [first] = top;
  const text = first.count === misses.length
    ? `${misses.length === 1 ? 'Your one miss' : `All ${misses.length} misses`}: ${tagLabel(first.tag)}.`
    : `Most common mistake: ${tagLabel(first.tag)} (${first.count} of your ${misses.length} misses).`;
  return { text, top, misses: misses.length };
}

export function nextTier(tier: Tier, score: number): Tier {
  const t = DRILLS_CONFIG.rules.tiers;
  if (score >= t.up_at_or_above - 1e-9) return Math.min(t.max, tier + 1) as Tier;
  if (score < t.down_below - 1e-9) return Math.max(t.min, tier - 1) as Tier;
  return tier;
}

export function timeLimitMs(drill: Drill, tier: Tier, multiplier: number): number {
  if (!drill.time_limits_s) throw new Error(`${drill.id} has no per-item time limit`);
  return drill.time_limits_s[tier - 1] * 1000 * multiplier;
}
