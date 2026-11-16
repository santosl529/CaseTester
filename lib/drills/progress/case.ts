// Case results → skill states and prescriptions (docs/prd-drills.md
// "Prescription rules", "Updating skill state from cases"). Pure code, no AI.
import { DRILLS_CONFIG, getMistakeTag, getSkill } from '../config';
import type { CaseResultPayload } from '../case-result';
import { caseReason } from '../reason';
import {
  hasLiveDrill, newProgress, skillCatalogIndex, stateRank, type Context, type ProgressMap, type SkillStateName,
  type Transition,
} from './engine';

export interface CasePrescription {
  skill_id: string;
  priority: number;
  focus_tag: string | null;
  reason: string;
  evidence: string;
}

export interface CaseUpdate {
  progress: ProgressMap;
  transitions: Transition[];
  prescriptions: CasePrescription[];
  // Skills that reached Mastered earlier and were flagged again.
  regressions: string[];
}

type Finding = CaseResultPayload['findings'][number];

// Rule 1: each tag counts once per case, major if any report of it is major.
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byTag = new Map<string, Finding>();
  for (const f of findings) {
    const prior = byTag.get(f.tag);
    if (!prior || (prior.severity === 'minor' && f.severity === 'major')) byTag.set(f.tag, f);
  }
  return [...byTag.values()];
}

const skillOf = (tag: string) => getMistakeTag(tag)!.skill;

// `retake`: the student has finished this case before. A retake can log
// findings and make a review due, but can't validate a skill or count as the
// second case of a repeat: the student may remember the case (Matt,
// 2026-10-11; 15 Nov). `previous`: the last earlier case that was neither a
// retake nor ended early.
export function applyCase(before: ProgressMap, payload: CaseResultPayload, previous: CaseResultPayload | null, ctx: Context, retake = false): CaseUpdate {
  const isLive = ctx.isLive ?? undefined;
  const progress: ProgressMap = new Map([...before].map(([k, v]) => [k, { ...v }]));
  const get = (id: string) => {
    let p = progress.get(id);
    if (!p) progress.set(id, (p = newProgress(id)));
    return p;
  };
  const transitions: Transition[] = [];
  const move = (id: string, to: SkillStateName, reason: string) => {
    const p = get(id);
    if (p.state !== to) transitions.push({ skill_id: id, from: p.state, to, reason });
    p.state = to;
  };

  const findings = dedupeFindings(payload.findings);
  const flagged = new Map<string, Finding[]>();
  for (const f of findings) flagged.set(skillOf(f.tag), [...(flagged.get(skillOf(f.tag)) ?? []), f]);
  const stateBefore = (id: string) => before.get(id)?.state ?? 'not_started';

  // Case skill states (Matt, 15 Nov, D3; docs/prd-drills.md "Updating skill state from cases"). "Twice in a row":
  // the skill was also flagged in the previous case that was neither a retake nor ended early (`previous` is that
  // case), and this case is neither either.
  const previouslyFlagged = new Set((previous?.findings ?? []).map(f => skillOf(f.tag)));
  const countsAsRepeat = !retake && !payload.partial;
  const regressions: string[] = [];
  const DAY = 86_400_000;
  const reviewDays = DRILLS_CONFIG.rules.spaced_review.eligible_after_days;
  const transferRetry = DRILLS_CONFIG.rules.transfer.retry_after_days;
  for (const [id, fs] of flagged) {
    const s = stateBefore(id);
    if (s !== 'practiced' && s !== 'mastered' && s !== 'validated') continue;
    if (s !== 'practiced') regressions.push(id);
    const tags = fs.map(f => f.tag).join(', ');
    const repeat = countsAsRepeat && previouslyFlagged.has(id);
    const p = get(id);
    if (s === 'practiced' && repeat) {
      // Down to Recognizes, as a failed transfer check: Repair (or Construct) next.
      move(id, 'recognizes', `case ${payload.case_id} flagged ${tags} again`);
      const drills = DRILLS_CONFIG.rules.skill_drills[id];
      p.stage = drills?.repair ? 'repair' : drills?.l2 ? 'construct' : 'recognize';
      p.l1_streak = 0; p.l2_streak = 0; p.repair_sets = 0;
      p.transfer_due_at = null; p.next_review_at = null;
    } else if (s === 'practiced') {
      // Stays Practiced; the transfer check waits 2 more days.
      const later = new Date(ctx.now.getTime() + transferRetry * DAY);
      p.transfer_due_at = p.transfer_due_at && p.transfer_due_at > later ? p.transfer_due_at : later;
    } else if (repeat) {
      // Mastered or Validated, flagged twice in a row: one step down, its transfer check due now.
      move(id, 'practiced', `case ${payload.case_id} flagged ${tags} again`);
      p.transfer_due_at = ctx.now; p.next_review_at = null;
    } else {
      // Once: a review comes due now; a Validated skill steps back to Mastered.
      if (s === 'validated') move(id, 'mastered', `case ${payload.case_id} flagged ${tags}`);
      p.next_review_at = ctx.now;
    }
  }
  // A Mastered skill observed with no findings becomes Validated: not on a retake, and not when the case rated its
  // dimension Needs work. A Validated one observed cleanly has its review clock reset.
  const dimensionOf = (id: string) => DRILLS_CONFIG.taxonomy.areas.find(a => a.code === getSkill(id).area)!.rubric_dimension;
  for (const id of retake ? [] : payload.skills_observed) {
    if (flagged.has(id) || payload.rubric_scores[dimensionOf(id)] === 'needs_work') continue;
    if (stateBefore(id) === 'mastered') move(id, 'validated', `case ${payload.case_id} used it with no mistakes`);
    if (stateBefore(id) === 'mastered' || stateBefore(id) === 'validated') get(id).next_review_at = new Date(ctx.now.getTime() + reviewDays * DAY);
  }

  // Rules 2–4: score, drop skills with no live drill, take the top 3 with at
  // most 2 from one skill area.
  const w = DRILLS_CONFIG.rules.prescriptions.weights;
  const scored = [...flagged].filter(([id]) => hasLiveDrill(id, isLive)).map(([id, fs]) => ({
    id, fs,
    priority: fs.reduce((s, f) => s + (f.severity === 'major' ? w.major : w.minor), 0)
      + (previouslyFlagged.has(id) ? w.repeat_previous_case : 0)
      + (regressions.includes(id) ? w.regression : 0),
  }));
  // Ties: the skill in the lower state (after this case), then catalog order.
  scored.sort((a, b) => b.priority - a.priority
    || stateRank(get(a.id).state) - stateRank(get(b.id).state)
    || skillCatalogIndex(a.id, isLive) - skillCatalogIndex(b.id, isLive));
  const perArea = new Map<string, number>();
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.length >= DRILLS_CONFIG.rules.prescriptions.max_per_case) break;
    const area = getSkill(s.id).area;
    if ((perArea.get(area) ?? 0) >= 2) continue;
    perArea.set(area, (perArea.get(area) ?? 0) + 1);
    picked.push(s);
  }

  const prescriptions = picked.map(({ id, fs, priority }) => {
    const lead = fs.find(f => f.severity === 'major') ?? fs[0];
    if (get(id).state === 'not_started') move(id, 'learning', 'first prescription');
    const focusable = DRILLS_CONFIG.rules.focusable_tags[lead.tag] ? lead.tag : null;
    return { skill_id: id, priority, focus_tag: focusable, reason: caseReason(lead), evidence: lead.evidence };
  });
  return { progress, transitions, prescriptions, regressions };
}

// Rule 6: the reason quotes the student, then says what went wrong in plain
// English (lib/drills/reason.ts).
export { caseReason } from '../reason';
