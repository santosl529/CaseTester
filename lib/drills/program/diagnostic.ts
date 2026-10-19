// The diagnostic's rules (docs/prd-drills.md "Onboarding and diagnostic").
// Pure code. Each finished part stores its totals; placement and the
// diagnostic's prescriptions are worked out from whatever parts are finished,
// so a student who stops partway is placed from what they did.
import { DRILLS_CONFIG, getMistakeTag, getSkill } from '../config';
import { hasLiveDrill, lowerName, skillCatalogIndex, stageDrills } from '../progress/engine';
import { scoresFromTotals, type SkillTotals } from '../sets/summary';

const d = DRILLS_CONFIG.programs.diagnostic;

export interface DiagnosticPart {
  drill_id: string;
  size: number;
  set_id: string | null;
  // Filled in when the part's set is scored.
  done?: boolean;
  totals?: Record<string, { sum: number; weight: number; count: number }>;
  item_scores?: number[];
  miss_tags?: string[];
}

// recognize: Recognize tier 1 · recognize_t2: Recognize tier 2 (50–79%, no
// Repair drill yet) · repair · test_out: Construct tier 2 (or Recognize tier 2
// for skills with no live Construct drill).
export type Place = 'recognize' | 'recognize_t2' | 'repair' | 'test_out';

export function diagnosticParts(): DiagnosticPart[] {
  return d.parts.map(p => ({ drill_id: p.drill, size: p.items, set_id: null }));
}

export function combinedTotals(parts: DiagnosticPart[]): SkillTotals {
  const acc: SkillTotals = new Map();
  for (const p of parts.filter(x => x.done && x.totals)) {
    for (const [skill, t] of Object.entries(p.totals!)) {
      const a = acc.get(skill) ?? { sum: 0, weight: 0, count: 0 };
      acc.set(skill, { sum: a.sum + t.sum, weight: a.weight + t.weight, count: a.count + t.count });
    }
  }
  return acc;
}

export function placeFor(skillId: string, score: number, isLive?: (id: string) => boolean): Place {
  if (score >= d.construct_at_or_above - 1e-9) return 'test_out';
  if (score >= d.recognize_below - 1e-9) return stageDrills(skillId, isLive).repair ? 'repair' : 'recognize_t2';
  return 'recognize';
}

// Per skill with at least 2 items or checks: its score and placement.
export function placements(parts: DiagnosticPart[], isLive?: (id: string) => boolean): Record<string, { score: number; count: number; place: Place }> {
  const scores = scoresFromTotals(combinedTotals(parts), d.min_items_or_checks);
  return Object.fromEntries(Object.entries(scores)
    .filter(([id]) => hasLiveDrill(id, isLive))
    .map(([id, s]) => [id, { ...s, place: placeFor(id, s.score, isLive) }]));
}

export function overallScore(parts: DiagnosticPart[]): number | null {
  const scores = parts.filter(p => p.done).flatMap(p => p.item_scores ?? []);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

// "Diagnostic mistake tags create up to 3 prescriptions (+1 per tag)": +1 per
// distinct tag missed on a skill, top 3, at most 2 from one skill area.
export function diagnosticPrescriptions(parts: DiagnosticPart[], skip: Set<string>, isLive?: (id: string) => boolean) {
  const bySkill = new Map<string, Set<string>>();
  for (const tag of parts.flatMap(p => p.miss_tags ?? [])) {
    const t = getMistakeTag(tag);
    if (!t || skip.has(t.skill) || !hasLiveDrill(t.skill, isLive)) continue;
    bySkill.set(t.skill, (bySkill.get(t.skill) ?? new Set()).add(tag));
  }
  const ranked = [...bySkill].sort((a, b) => b[1].size - a[1].size || skillCatalogIndex(a[0], isLive) - skillCatalogIndex(b[0], isLive));
  const perArea = new Map<string, number>();
  const out: { skill_id: string; priority: number; reason: string }[] = [];
  for (const [skill, tags] of ranked) {
    if (out.length >= d.max_prescriptions) break;
    const area = getSkill(skill).area;
    if ((perArea.get(area) ?? 0) >= 2) continue;
    perArea.set(area, (perArea.get(area) ?? 0) + 1);
    const labels = [...tags].map(t => getMistakeTag(t)!.label);
    out.push({ skill_id: skill, priority: tags.size, reason: `In the diagnostic: ${labels.join(', ')}. This set practices ${lowerName(skill)}.` });
  }
  return out;
}
