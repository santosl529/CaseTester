// Turns a checklist grade into an item score (docs/prd-drills.md "Item scoring
// rules"). Code computes every score: the AI only answers yes/no checks with
// quoted evidence. Pure.
//
// Each step's share of the score is the weighted share of its checks passed;
// a red flag caps its step's share; the item score adds the steps by their
// weights. HY-2's update decision (stage 2) is scored here from the family the
// grader put the stage 1 hypothesis in.
import { getDrill, getMistakeTag } from '../config';
import type { Item, RepairExtras } from '../item-schema';
import { hy2DecisionTag, PS3_INJECTION_FAILS, PS3_NO_OVERLAP_MIN_BUCKETS, REPAIR_DRILLS, REPAIR_INJECTION_FAILS, SY2_OFF_TOPIC_SUPPRESSES, type Hy2Content, type RepairDrillId } from '../checklists';
import { parseFramework } from '../content-import';
import { challengeTag, defendParts } from '../defend';
import { parseNumericInput } from '../numeric';
import { answerText, itemSteps, type ItemResult, type StepResult } from '../sets/scoring';
import { quoteFound } from './quotes';
import { addressedToGrader } from './injection';

export interface CheckVerdict { pass: boolean; evidence: string }
export interface ItemGrade {
  checks: Record<string, CheckVerdict>;
  red_flags: Record<string, CheckVerdict>;   // pass = the red flag is present
  family: string | null;
  backup_family?: string | null;             // HY-2: family of a stage 1 backup cause
  new_flaw_tag?: string | null;              // Repair: the kind of new flaw the edit added
  new_flaw_quote?: string | null;            // Repair: where the grader says that flaw is
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
  // Defend Challenge: the Hold/Update choice and whether it was right.
  defend_decision?: { chose: string; right: boolean } | null;
  // Repair: the answer came back as the flawed original, so code scored it 0.
  unchanged?: boolean;
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
  if (item.drill_id === 'PS-3' && item.checks.some(c => c.check_id === 'no_overlap')) {
    // "No overlap" earns credit only with 3+ buckets that have sub-points;
    // above that, the AI judges overlap.
    const r = steps[0]?.response;
    const full = r?.type === 'buckets' ? r.buckets.filter(b => b.title.trim() && b.points.some(p => p.trim())).length : 0;
    if (full < PS3_NO_OVERLAP_MIN_BUCKETS) checks.no_overlap = { pass: false, evidence: '' };
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

// Repair pre-check (PRD "Repair drills"): an answer that is still the flawed
// original, once whitespace is normalized, scores 0 with no AI call.
export function unchangedRepair(item: Item, steps: StepResult[]): boolean {
  if (getDrill(item.drill_id).stage !== 'repair') return false;
  const flawed = (item.extras as RepairExtras).flawed_answer;
  const original = item.input.type === 'structured_buckets' ? answerText(parseFramework(flawed)) : flawed;
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  return norm(answerText(steps[0]?.response ?? { type: 'empty' })) === norm(original);
}

// Content words, for matching a quoted part of an edit with the original.
const partWords = (t: string) => new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).map(w => w.replace(/s$/, '')));
const shareOf = (a: Set<string>, b: Set<string>) => (a.size ? [...a].filter(w => b.has(w)).length / a.size : 0);
// Buckets (one per line) or sentences.
const partsOf = (text: string) => text.split(/\n|(?<=[.!?])\s+/).map(p => p.trim()).filter(Boolean);
export const CARRIED_OVER_MIN = 0.5;

// Repair: is the grader's "new" flaw a planted flaw the edit left in place?
// Its kind must be an unfixed planted flaw's, and its quote must come from a
// bucket or sentence of the edit that is mostly the original's own words.
export function plantedFlawLeftInPlace(item: Item, checks: { check_id: string; pass: boolean }[], grade: ItemGrade | null, edited: string): boolean {
  const flaws = (item.extras as RepairExtras).flaws ?? [];
  const unfixed = flaws.filter((_, i) => checks.find(c => c.check_id === `fix_${i + 1}`)?.pass === false).map(f => f.tag);
  const quote = grade?.new_flaw_quote?.trim();
  if (!grade?.new_flaw_tag || !unfixed.includes(grade.new_flaw_tag) || !quote || !quoteFound(quote, edited)) return false;
  const flawed = (item.extras as RepairExtras).flawed_answer;
  const original = partsOf(item.input.type === 'structured_buckets' ? answerText(parseFramework(flawed)) : flawed).map(partWords);
  const part = partsOf(edited).find(p => quoteFound(quote, p));
  const candidates = [partWords(quote), ...(part ? [partWords(part)] : [])];
  return candidates.some(c => original.some(o => shareOf(c, o) >= CARRIED_OVER_MIN));
}

// Up to the first sentence break (., ! or ? followed by a space).
export const firstSentence = (text: string) => text.trim().split(/(?<=[.!?])\s+/)[0] ?? '';

const skillOf = (tag: string) => getMistakeTag(tag)?.skill;

export function applyGrade(item: Item, steps: StepResult[], timedOut: boolean, grade: ItemGrade | null): ItemResult & { check_results: CheckResults } {
  const spec = itemSteps(item);
  const written = steps.map(s => answerText(s.response));
  // The Defend steps, if the set ran them; the main answer is everything before.
  const defend = defendParts(item);
  const mainSteps = defend ? defend.start : spec.length;
  const blank = written.every((w, i) => i >= mainSteps || (!w && spec[i].type !== 'single_choice'));
  // A skipped or empty follow-up scores 0 and logs M.skipped or M.timeout,
  // not its checks' tags (PRD "Defend step screen").
  const defendEmpty = defend !== null && !written[defend.reply];
  const unchanged = unchangedRepair(item, steps);
  const code = codeChecks(item, steps);
  // Text addressed to the grader, failed by code only on a high-confidence
  // match (./injection.ts). PS-3: it sits in a bucket that is neither
  // case-specific nor concrete (grading guide rule 9). Repair: the edit
  // earns nothing for what it kept or didn't add (REPAIR_INJECTION_FAILS).
  // Defend: in a 40-word reply the instruction is the reply, so it earns
  // nothing. When only the grader suspects one, the answer is graded
  // normally and flagged for a human to review.
  const mainText = written.slice(0, mainSteps).join('\n');
  const mainMatch = addressedToGrader(mainText);
  const replyMatch = defend !== null && addressedToGrader(written[defend.reply] ?? '');
  const failsOnInjection = new Set([
    ...(item.drill_id === 'PS-3' && mainMatch ? PS3_INJECTION_FAILS : []),
    ...(getDrill(item.drill_id).stage === 'repair' && mainMatch ? REPAIR_INJECTION_FAILS : []),
    ...(replyMatch && defend ? item.checks.filter(c => c.step >= defend.start).map(c => c.check_id) : []),
  ]);
  const injectionReview = Boolean(grade?.injection_suspected) && !mainMatch && !replyMatch;
  const verdict = (id: string) => (failsOnInjection.has(id) ? { pass: false, evidence: '' } : null)
    ?? code.checks[id] ?? grade?.checks[id] ?? { pass: false, evidence: '' };
  const flagged = (id: string) => code.red_flags[id] ?? grade?.red_flags[id] ?? { pass: false, evidence: '' };

  const repairSpec = REPAIR_DRILLS[item.drill_id as RepairDrillId];
  const checks = item.checks.map(c => {
    // A blank step can't pass anything, whatever the grader said; nor can an
    // unchanged Repair answer.
    let v = written[c.step] && !unchanged ? verdict(c.check_id) : { pass: false, evidence: '' };
    // SY-2: the recommendation must be in the first sentence, so the quote
    // that shows it must come from there.
    if (c.check_id === 'recommendation_first' && v.pass && !quoteFound(v.evidence, firstSentence(written[c.step]))) v = { pass: false, evidence: '' };
    // Repair: a new flaw logs the kind the grader named, if it is one of the drill's.
    const tag = c.check_id === 'no_new_flaw' && repairSpec && grade?.new_flaw_tag && (repairSpec.flaw_tags as readonly string[]).includes(grade.new_flaw_tag)
      ? grade.new_flaw_tag : c.fail_tag;
    return { check_id: c.check_id, pass: v.pass, evidence: v.pass ? v.evidence : '', by: unchanged ? 'code' as const : c.detection, weight: c.weight, step: c.step, fail_tag: tag };
  });
  // Repair: one slip counts once (grading guide rule 3). When keeps-right
  // fails, no-new-flaw passes by code, unless the answer addressed the grader
  // or was left unchanged.
  const keeps = checks.find(c => c.check_id === 'keeps_right');
  const noNew = checks.find(c => c.check_id === 'no_new_flaw');
  if (repairSpec && keeps && noNew && !keeps.pass && !noNew.pass && !unchanged && !failsOnInjection.has('no_new_flaw')) {
    Object.assign(noNew, { pass: true, evidence: '', by: 'code' as const });
  }
  // Repair: a planted flaw left in place isn't new (rule 3). When the grader
  // names a new flaw of the same kind as a planted flaw the edit didn't fix,
  // and quotes it from a bucket or sentence carried over from the original,
  // it is that planted flaw: no-new-flaw passes by code. A flaw quoted from a
  // part the student added (a second irrelevant bucket) still fails.
  if (repairSpec && noNew && !noNew.pass && !unchanged && !failsOnInjection.has('no_new_flaw')
    && plantedFlawLeftInPlace(item, checks, grade, written[0] ?? '')) {
    Object.assign(noNew, { pass: true, evidence: '', by: 'code' as const });
  }
  // SY-2: an off-topic answer isn't also flagged for its position (rule 8).
  const offTopic = item.drill_id === 'SY-2' && grade?.red_flags.off_topic?.pass;
  const redFlags = item.red_flags.map(f => {
    // PS-3 / CL-3: missing the critical area or driver(s) is read off their
    // checks; covering any one of a CL-3 item's critical drivers is enough.
    const criticalChecks = (item.extras.critical_checks as string[] | undefined) ?? [item.extras.critical_check as string];
    const missedCritical = f.id === 'missed_critical_area' || f.id === 'missed_critical_driver'
      ? !criticalChecks.some(id => checks.find(c => c.check_id === id)?.pass) : null;
    const v = !written[f.step] ? { pass: false, evidence: '' }
      : missedCritical !== null ? { pass: missedCritical, evidence: '' }
      : offTopic && SY2_OFF_TOPIC_SUPPRESSES.includes(f.id) ? { pass: false, evidence: '' } : flagged(f.id);
    return { id: f.id, present: v.pass, evidence: v.evidence, cap: f.cap, step: f.step, tag: f.tag };
  });

  // HY-2's decision step: right action for the stage 1 hypothesis's family.
  let decisionTag: string | null = null;
  let decision: CheckResults['decision'] = null;
  const choiceStep = spec.findIndex(s => s.type === 'single_choice' && s.choices && !s.defend);
  if (item.drill_id === 'HY-2' && choiceStep >= 0) {
    const chose = steps[choiceStep]?.response.type === 'choice' ? (steps[choiceStep].response as { option_id: string }).option_id : null;
    decisionTag = chose ? hy2DecisionTag(item.extras.families as Hy2Content['families'], grade?.family ?? null, chose, grade?.backup_family ?? null) : 'M.timeout';
    if (chose) decision = { chose, right: decisionTag === null };
  }

  // Defend Challenge: Update is right when the pushback is valid, Hold when not.
  let defendTag: string | null = null;
  let defendDecision: CheckResults['defend_decision'] = null;
  if (defend && defend.decision >= 0 && item.defend?.valid !== undefined) {
    const r = steps[defend.decision]?.response;
    if (r?.type === 'choice') {
      defendTag = challengeTag(item.defend.valid, r.option_id);
      defendDecision = { chose: r.option_id, right: defendTag === null };
    } else defendTag = steps[defend.decision]?.tag ?? 'M.timeout';
  }

  const stepScores = spec.map((s, i) => {
    if (i === choiceStep && item.drill_id === 'HY-2') return decisionTag ? 0 : 1;
    if (defend && i === defend.decision) return defendTag ? 0 : 1;
    const mine = checks.filter(c => c.step === i);
    const total = mine.reduce((a, c) => a + c.weight, 0);
    let share = total ? mine.reduce((a, c) => a + (c.pass ? c.weight : 0), 0) / total : 0;
    for (const f of redFlags.filter(f => f.present && f.step === i)) share = Math.min(share, f.cap);
    return share;
  });
  const score = blank || unchanged ? 0 : spec.reduce((a, s, i) => a + s.weight * stepScores[i], 0);

  const inDefend = (step: number) => defend !== null && step >= defend.start;
  const emptyDefendTag = defend ? (steps[defend.reply]?.tag === 'M.skipped' ? 'M.skipped' : 'M.timeout') : null;
  const tags = blank ? ['M.timeout']
    // Unchanged Repair answer: the planted flaws are still there.
    : unchanged ? [...new Set((item.extras as RepairExtras).flaws.map(f => f.tag))]
    : [...new Set([
      ...checks.filter(c => !c.pass && !(defendEmpty && inDefend(c.step))).map(c => c.fail_tag),
      ...redFlags.filter(f => f.present).map(f => f.tag),
      ...(decisionTag ? [decisionTag] : []),
      ...(defendTag && !defendEmpty ? [defendTag] : []),
      ...(defendEmpty ? [emptyDefendTag!] : []),
      ...(timedOut && written.some((w, i) => !w && !inDefend(i)) ? ['M.timeout'] : []),
    ])];

  // How each check counts toward skills: through its failure tag. Repair's
  // no-new-flaw and keeps-right checks judge the whole edit, so they count
  // toward every skill the item trains. Defend checks count toward the item's
  // skills and toward CL.pushback (PRD "Defend step").
  const known = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const skillsFor = (c: (typeof checks)[number]) => inDefend(c.step) ? known([...item.skills, skillOf(c.fail_tag), 'CL.pushback'])
    : repairSpec && (c.check_id === 'no_new_flaw' || c.check_id === 'keeps_right') ? [...item.skills]
    : known([skillOf(c.fail_tag)]);
  const contributions = [
    ...checks.map(c => ({ skills: skillsFor(c), score: c.pass ? 1 : 0, weight: c.weight })),
    ...(item.drill_id === 'HY-2' && choiceStep >= 0 ? [{ skills: ['HY.update'], score: decisionTag ? 0 : 1, weight: spec[choiceStep].weight }] : []),
    ...(defend && defend.decision >= 0 ? [{ skills: known([...item.skills, 'CL.pushback']), score: defendTag ? 0 : 1, weight: spec[defend.decision].weight }] : []),
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
      injection_suspected: (grade?.injection_suspected ?? false) || mainMatch || replyMatch,
      qa_flags: [...(grade?.qa_flags ?? []), ...(injectionReview ? ['injection_review'] : [])],
      decision,
      ...(defend && { defend_decision: defendDecision }),
      ...(unchanged && { unchanged: true }),
      contributions,
    },
  };
}
