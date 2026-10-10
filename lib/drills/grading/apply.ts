// Turns a checklist grade into an item score (docs/prd-drills.md "Item scoring
// rules"). Code computes every score: the AI only answers yes/no checks with
// quoted evidence. Pure.
//
// Each step's share of the score is the weighted share of its checks passed;
// a red flag caps its step's share; the item score adds the steps by their
// weights. HY-2's update decision (stage 2) is scored here from the family the
// grader put the stage 1 hypothesis in.
import { getMistakeTag } from '../config';
import type { Item } from '../item-schema';
import { hy2DecisionTag, type Hy2Content } from '../checklists';
import { parseNumericInput } from '../numeric';
import { answerText, itemSteps, type ItemResult, type StepResult } from '../sets/scoring';

export interface CheckVerdict { pass: boolean; evidence: string }
export interface ItemGrade {
  checks: Record<string, CheckVerdict>;
  red_flags: Record<string, CheckVerdict>;   // pass = the red flag is present
  family: string | null;
  injection_suspected: boolean;
  qa_flags: string[];                        // checks whose quote never verified
}

export interface CheckResults {
  checks: { check_id: string; pass: boolean; evidence: string; by: 'ai' | 'code' }[];
  red_flags: { id: string; present: boolean; evidence: string }[];
  family: string | null;
  injection_suspected: boolean;
  qa_flags: string[];
  // HY-2: the keep/revise/drop choice and whether it was right for the family.
  decision: { chose: string; right: boolean } | null;
  // Per-skill contributions for the set's skill scores (PRD: checks map to
  // skills through their failure tag).
  contributions: { skills: string[]; score: number; weight: number }[];
}

// Numbers as values, so "$400M", "400 million" and "400,000,000" match.
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /\$?\d[\d,]*(?:\.\d+)?\s*(?:%|percent|k|thousand|mm|mn|m|million|bn|b|billion)?(?![a-z])/gi;
  for (const m of text.match(re) ?? []) {
    const p = parseNumericInput(m.replace(/\s+/g, ' '));
    if (p.ok) out.push(p.value);
  }
  return out;
}

// Checks settled by code before (and instead of) the AI.
export function codeChecks(item: Item, steps: StepResult[]): { checks: Record<string, CheckVerdict>; red_flags: Record<string, CheckVerdict> } {
  const checks: Record<string, CheckVerdict> = {};
  const red_flags: Record<string, CheckVerdict> = {};
  for (const check of item.checks.filter(c => c.detection === 'code')) {
    if (check.check_id === 'cites_numbers') {
      // SY-2: at least one number from the relevant facts appears in the answer.
      const facts = (item.extras.facts as { fact: string; relevant: boolean }[]).filter(f => f.relevant);
      const sheet = facts.flatMap(f => numbersIn(f.fact));
      const answer = numbersIn(answerText(steps[check.step]?.response ?? { type: 'empty' }));
      const hit = answer.find(a => sheet.some(s => Math.abs(a - s) <= Math.abs(s) * 0.005));
      checks[check.check_id] = { pass: hit !== undefined, evidence: hit !== undefined ? String(hit) : '' };
    }
  }
  for (const flag of item.red_flags.filter(f => f.detection === 'code')) {
    if (flag.id === 'fewer_than_two_buckets') {
      const r = steps[flag.step]?.response;
      const buckets = r?.type === 'buckets' ? r.buckets.filter(b => b.title.trim()).length : 0;
      red_flags[flag.id] = { pass: buckets < 2, evidence: '' };
    }
  }
  return { checks, red_flags };
}

const skillOf = (tag: string) => getMistakeTag(tag)?.skill;

export function applyGrade(item: Item, steps: StepResult[], timedOut: boolean, grade: ItemGrade | null): ItemResult & { check_results: CheckResults } {
  const spec = itemSteps(item);
  const written = steps.map(s => answerText(s.response));
  const blank = written.every((w, i) => !w && spec[i].type !== 'single_choice');
  const code = codeChecks(item, steps);
  const verdict = (id: string) => code.checks[id] ?? grade?.checks[id] ?? { pass: false, evidence: '' };
  const flagged = (id: string) => code.red_flags[id] ?? grade?.red_flags[id] ?? { pass: false, evidence: '' };

  const checks = item.checks.map(c => {
    // A blank step can't pass anything, whatever the grader said.
    const v = written[c.step] ? verdict(c.check_id) : { pass: false, evidence: '' };
    return { check_id: c.check_id, pass: v.pass, evidence: v.pass ? v.evidence : '', by: c.detection, weight: c.weight, step: c.step, fail_tag: c.fail_tag };
  });
  const redFlags = item.red_flags.map(f => {
    const v = written[f.step] ? flagged(f.id) : { pass: false, evidence: '' };
    return { id: f.id, present: v.pass, evidence: v.evidence, cap: f.cap, step: f.step, tag: f.tag };
  });

  // HY-2's decision step: right action for the stage 1 hypothesis's family.
  let decisionTag: string | null = null;
  let decision: CheckResults['decision'] = null;
  const choiceStep = spec.findIndex(s => s.type === 'single_choice' && s.choices);
  if (item.drill_id === 'HY-2' && choiceStep >= 0) {
    const chose = steps[choiceStep]?.response.type === 'choice' ? (steps[choiceStep].response as { option_id: string }).option_id : null;
    decisionTag = chose ? hy2DecisionTag(item.extras.families as Hy2Content['families'], grade?.family ?? null, chose) : 'M.timeout';
    if (chose) decision = { chose, right: decisionTag === null };
  }

  const stepScores = spec.map((s, i) => {
    if (i === choiceStep && item.drill_id === 'HY-2') return decisionTag ? 0 : 1;
    const mine = checks.filter(c => c.step === i);
    const total = mine.reduce((a, c) => a + c.weight, 0);
    let share = total ? mine.reduce((a, c) => a + (c.pass ? c.weight : 0), 0) / total : 0;
    for (const f of redFlags.filter(f => f.present && f.step === i)) share = Math.min(share, f.cap);
    return share;
  });
  const score = blank ? 0 : spec.reduce((a, s, i) => a + s.weight * stepScores[i], 0);

  const tags = blank ? ['M.timeout'] : [...new Set([
    ...checks.filter(c => !c.pass).map(c => c.fail_tag),
    ...redFlags.filter(f => f.present).map(f => f.tag),
    ...(decisionTag ? [decisionTag] : []),
    ...(timedOut && written.some(w => !w) ? ['M.timeout'] : []),
  ])];

  const contributions = [
    ...checks.map(c => ({ skills: [skillOf(c.fail_tag)].filter((x): x is string => Boolean(x)), score: c.pass ? 1 : 0, weight: c.weight })),
    ...(item.drill_id === 'HY-2' && choiceStep >= 0 ? [{ skills: ['HY.update'], score: decisionTag ? 0 : 1, weight: spec[choiceStep].weight }] : []),
  ];

  return {
    score: Number(score.toFixed(6)),
    steps: steps.map((s, i) => ({ ...s, pending: false, score: stepScores[i] })),
    mistake_tags: tags,
    skipped: false,
    timed_out: timedOut,
    pending: false,
    check_results: {
      checks: checks.map(({ check_id, pass, evidence, by }) => ({ check_id, pass, evidence, by })),
      red_flags: redFlags.map(({ id, present, evidence }) => ({ id, present, evidence })),
      family: grade?.family ?? null,
      injection_suspected: grade?.injection_suspected ?? false,
      qa_flags: grade?.qa_flags ?? [],
      decision,
      contributions,
    },
  };
}
