// The tagging step's gate (Matt, 15 Nov, D2), pure so it is tested:
//   - tag agreement ≥ 90% in every rubric dimension, and for the top
//     improvement (a point and its label agree when both are the same tag, or
//     both "none");
//   - wrong skill ≤ 5% overall: the model gave a tag whose skill differs from
//     the label's skill, or gave a tag where the label is "none". Either would
//     send a student to a drill the rules don't support. A missed tag (the
//     model says "none" where the label has one) costs agreement only.
import { getMistakeTag } from '@/lib/drills/config';

export const GATE_AGREEMENT = 0.9;
export const GATE_WRONG_SKILL = 0.05;

export type GatePoint = { id: string; group: string; label: string | null; tag: string | null };
export type GateResult = {
  groups: { group: string; agree: number; total: number; rate: number; pass: boolean }[];
  wrongSkill: { count: number; total: number; rate: number; pass: boolean; ids: string[] };
  pass: boolean;
};

const skillOf = (tag: string | null) => (tag ? getMistakeTag(tag)?.skill ?? null : null);

export function isWrongSkill(label: string | null, tag: string | null): boolean {
  return tag !== null && skillOf(tag) !== skillOf(label);
}

export function gateResult(points: GatePoint[]): GateResult {
  const order = [...new Set(points.map(p => p.group))];
  const groups = order.map(group => {
    const ps = points.filter(p => p.group === group);
    const agree = ps.filter(p => p.label === p.tag).length;
    const rate = agree / ps.length;
    return { group, agree, total: ps.length, rate, pass: rate >= GATE_AGREEMENT - 1e-9 };
  });
  const wrong = points.filter(p => isWrongSkill(p.label, p.tag));
  const rate = points.length ? wrong.length / points.length : 0;
  const wrongSkill = { count: wrong.length, total: points.length, rate, pass: rate <= GATE_WRONG_SKILL + 1e-9, ids: wrong.map(p => p.id) };
  return { groups, wrongSkill, pass: groups.every(g => g.pass) && wrongSkill.pass };
}
