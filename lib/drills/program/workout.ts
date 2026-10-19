// Daily workouts (docs/prd-drills.md "Workouts", "How the plan drives
// practice"): 2–4 sets, about 20 minutes, 50% weak spots, 25% spaced review,
// 25% unfamiliar material, ordered review → weak spots → unfamiliar. Plus the
// plan's own prescriptions and the weekly milestones. Pure code.
import { DRILLS_CONFIG, getDrill, getSkill } from '../config';
import { defendRuns, defendSeconds, setSizeAt } from '../defend';
import {
  nextSetFor, stageDrills, stateRank, type Context, type NextSet, type ProgressMap, type SkillProgress,
  newProgress, lowerName,
} from '../progress/engine';
import type { Milestone, PlanWeek, SprintDay, Track } from './plan';

const programs = DRILLS_CONFIG.programs;
const rules = DRILLS_CONFIG.rules;

export type Slot = 'review' | 'weak' | 'unfamiliar';

export interface OpenPrescription {
  id: string;
  skill_id: string;
  priority: number;
  source: 'case' | 'drill' | 'diagnostic' | 'plan' | 'questionnaire';
  reason: string;
  created_at: Date;
}

export interface WorkoutBlock {
  slot: Slot;
  skill_id: string;
  drill_id: string;
  stage: NextSet['stage'];
  tier: number;
  kind: NextSet['kind'];
  size: number;
  minutes: number;
  reason: string;
  prescription_id: string | null;
  set_id: string | null;
  // A short check of a questionnaire placement (D6 round 2): its score
  // re-places the skill.
  check?: boolean;
}

export interface WorkoutInput {
  track: Exclude<Track, 'self_directed'>;
  week: PlanWeek | null;            // six-week tracks
  sprint_day: SprintDay | null;     // Sprint
  interview_days_out: number | null;
  progress: ProgressMap;
  tiers: Record<string, number>;
  prescriptions: OpenPrescription[];
  missed_milestone_skills: string[];
  time_multiplier: number;
  ctx: Context;
  // Questionnaire placements still to confirm, one skill per area, in order.
  checks?: string[];
}

export interface Workout {
  target_minutes: number;
  review_only: boolean;
  blocks: WorkoutBlock[];
}

// "A set's time is estimated as items × the tier's time limit × 0.8", with
// the Defend follow-up's time where the set runs it.
export function setMinutes(drillId: string, tier: number, size: number, multiplier = 1): number {
  const d = getDrill(drillId);
  const perItem = (d.time_limits_s?.[tier - 1]
    ?? Object.values(d.stage_time_limits_s ?? {}).reduce((s, t) => s + t[tier - 1], 0))
    + (defendRuns(d, tier, null) ? defendSeconds(tier) : 0);
  return (size * perItem * multiplier * programs.workout.minutes_per_item_factor) / 60;
}

// Sets that run Defend are one item shorter at T2 and T3.
const fullSize = (drillId: string, tier: number) => setSizeAt(getDrill(drillId), tier, defendRuns(getDrill(drillId), tier, null));
const reviewSize = (drillId: string, tier: number) => {
  const size = fullSize(drillId, tier);
  const r = rules.spaced_review;
  return size > r.full_size_at_or_below ? Math.ceil(size * r.size_fraction) : size;
};

// A quick check's size: the half-size set a review uses.
export const checkSize = (drillId: string, tier: number) => reviewSize(drillId, tier);

const SOURCE_ORDER = { case: 0, diagnostic: 1, questionnaire: 2, plan: 3, drill: 4 } as const;
export const CHECKS_PER_WORKOUT = 2;

function inFocus(skillId: string, week: PlanWeek | null): boolean {
  if (!week) return false;
  return week.focus_skills.includes(skillId) || week.focus_areas.includes(getSkill(skillId).area);
}

// The set a skill gets in a workout, with the track's start and gate rules:
// Foundations starts new skills at Recognize tier 1 and serves Construct only
// once the skill's prerequisites reach Recognizes; Sprint uses tiers 2–3 only.
export function blockFor(p: SkillProgress, input: WorkoutInput, slot: Slot): Omit<WorkoutBlock, 'reason' | 'prescription_id' | 'set_id' | 'slot'> | null {
  const isLive = input.ctx.isLive;
  let next = nextSetFor(p, input.tiers, { ...input.ctx, sprint: input.track === 'sprint' });
  if (!next) return null;
  const d = stageDrills(p.skill_id, isLive);
  const fresh = p.stage === null && (p.state === 'not_started' || p.state === 'learning');
  if (input.track === 'foundations' && next.kind === 'normal' && d.recognize) {
    const gated = getSkill(p.skill_id).prerequisites.some(pre => {
      const s = input.progress.get(pre)?.state ?? 'not_started';
      return stateRank(s) < stateRank('recognizes') && Object.values(stageDrills(pre, isLive)).some(Boolean);
    });
    if (fresh || (next.stage === 'construct' && gated)) {
      next = { drill_id: d.recognize, stage: 'recognize', tier: fresh ? programs.tracks.foundations.start_tier : (input.tiers[d.recognize] ?? 1), kind: 'normal', test_out: false };
    }
  }
  let tier = next.tier;
  if (input.track === 'sprint') tier = Math.max(tier, Math.min(...programs.tracks.sprint.tiers));
  // Week 5 (Interview performance): timed tier 3 sets on skills already Practiced.
  if (slot === 'weak' && input.week?.prefer_tier && stateRank(p.state) >= stateRank('practiced')) tier = Math.max(tier, input.week.prefer_tier);
  const size = next.kind === 'review' || (slot !== 'weak' && next.kind === 'normal') ? reviewSize(next.drill_id, tier) : fullSize(next.drill_id, tier);
  return { skill_id: p.skill_id, drill_id: next.drill_id, stage: next.stage, tier, kind: next.kind, size, minutes: setMinutes(next.drill_id, tier, size, input.time_multiplier) };
}

export function targetMinutes(input: Pick<WorkoutInput, 'track' | 'sprint_day' | 'interview_days_out'>): number {
  const w = programs.workout;
  if (input.interview_days_out === 1) return w.day_before_interview_minutes;
  if (input.track === 'sprint') return input.sprint_day?.workout_minutes || w.sprint_target_minutes;
  return w.target_minutes;
}

export function buildWorkout(input: WorkoutInput): Workout {
  const w = programs.workout;
  const target = targetMinutes(input);
  const now = input.ctx.now.getTime();
  const state = (id: string) => input.progress.get(id) ?? newProgress(id);
  const used = new Set<string>();
  const blocks: WorkoutBlock[] = [];
  const take = (slot: Slot, p: SkillProgress, reason: string, prescription_id: string | null = null) => {
    const b = blockFor(p, input, slot);
    if (!b) return null;
    used.add(p.skill_id);
    const block = { ...b, slot, reason, prescription_id, set_id: null };
    blocks.push(block);
    return block;
  };

  // Within 2 days of the interview (or Sprint days 6–7): short reviews of
  // Practiced and Mastered skills only.
  const reviewOnly = (input.interview_days_out != null && input.interview_days_out <= programs.tracks.sprint.review_only_within_days)
    || Boolean(input.sprint_day?.activities.some(a => a === 'review' || a === 'light_review'));
  const strong = [...input.progress.values()]
    .filter(p => stateRank(p.state) >= stateRank('practiced'))
    .sort((a, b) => (a.last_practiced_at?.getTime() ?? 0) - (b.last_practiced_at?.getTime() ?? 0));
  if (reviewOnly) {
    let minutes = 0;
    for (const p of strong) {
      if (blocks.length >= w.max_sets || minutes >= target) break;
      const b = take('review', { ...p, transfer_due_at: null }, `Light review of ${lowerName(p.skill_id)} before your interview.`);
      if (b) minutes += b.minutes;
    }
    return { target_minutes: target, review_only: true, blocks };
  }

  // Slots are filled in priority order (weak spots, then a due transfer
  // check, then review, then other unfamiliar material) and shown in the
  // PRD's order: review → weak spots → unfamiliar.

  // Weak spots (50%): highest-priority open prescriptions, +2 for the week's
  // focus, +1 for a missed milestone; at most one set per skill. A skill whose
  // transfer check is due takes the unfamiliar slot instead.
  const ranked = rankPrescriptions(input.prescriptions, input.week, input.missed_milestone_skills);
  const weakBudget = target * w.mix.weak;
  let weakMinutes = 0;
  let weakSets = 0;
  // Quick checks of a questionnaire placement come first: up to 2, half size.
  for (const skillId of (input.checks ?? []).slice(0, CHECKS_PER_WORKOUT)) {
    if (used.has(skillId)) continue;
    const b = take('weak', state(skillId), `Quick check: confirms where you start in ${lowerName(skillId)}.`);
    if (!b) continue;
    b.size = checkSize(b.drill_id, b.tier);
    b.minutes = setMinutes(b.drill_id, b.tier, b.size, input.time_multiplier);
    b.check = true;
    weakMinutes += b.minutes;
    weakSets++;
  }
  for (const { rx } of ranked) {
    if (weakSets >= 2 || (weakSets >= 1 && weakMinutes >= weakBudget)) break;
    if (used.has(rx.skill_id) || transferDue(state(rx.skill_id), input)) continue;
    const b = take('weak', state(rx.skill_id), rx.reason, rx.id);
    if (b) { weakMinutes += b.minutes; weakSets++; }
  }

  // Unfamiliar (25%): a due transfer check (it may run long).
  const transfer = [...input.progress.values()].filter(p => !used.has(p.skill_id) && transferDue(p, input))
    .sort((a, b) => (a.transfer_due_at?.getTime() ?? 0) - (b.transfer_due_at?.getTime() ?? 0))[0];
  if (transfer) {
    take('unfamiliar', { ...transfer, transfer_due_at: new Date(Math.min(now, transfer.transfer_due_at?.getTime() ?? now)) },
      `Transfer check: ${lowerName(transfer.skill_id)} on cases you haven't seen.`);
  }

  // Review (25%): the most overdue Mastered or Validated skill; else the
  // Practiced or Mastered skill practiced longest ago.
  const due = strong.filter(p => !used.has(p.skill_id) && (p.state === 'mastered' || p.state === 'validated') && p.next_review_at && p.next_review_at.getTime() <= now)
    .sort((a, b) => a.next_review_at!.getTime() - b.next_review_at!.getTime());
  const reviewPick = due[0] ?? strong.find(p => !used.has(p.skill_id) && !transferDue(p, input));
  if (reviewPick) take('review', reviewPick, due[0] ? `Time to review ${lowerName(reviewPick.skill_id)}: ${daysSince(reviewPick, now)} days since you last practiced it.` : `Keeping ${lowerName(reviewPick.skill_id)} fresh.`);

  // Unfamiliar, when no transfer check is due: a half-size set on a skill at
  // Recognizes or above, from case types the student hasn't seen on it
  // (chosen when the set starts).
  if (!transfer) {
    const fresh = [...input.progress.values()]
      .filter(p => !used.has(p.skill_id) && stateRank(p.state) >= stateRank('recognizes'))
      .sort((a, b) => (a.last_practiced_at?.getTime() ?? 0) - (b.last_practiced_at?.getTime() ?? 0))[0];
    if (fresh) take('unfamiliar', fresh, `${getSkill(fresh.skill_id).name} on a new kind of case.`);
  }

  // Fewer than 2 sets: more weak spots.
  for (const { rx } of ranked) {
    if (blocks.length >= w.min_sets) break;
    if (!used.has(rx.skill_id)) take('weak', state(rx.skill_id), rx.reason, rx.id);
  }
  const order: Slot[] = ['review', 'weak', 'unfamiliar'];
  blocks.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return { target_minutes: target, review_only: false, blocks: blocks.slice(0, w.max_sets) };
}

// Week 6 (Readiness) runs a transfer check on every prescribed skill still
// at Practiced, without waiting for the unlock date.
function transferDue(p: SkillProgress, input: WorkoutInput): boolean {
  if (p.state !== 'practiced') return false;
  if (input.week?.transfer_all && input.prescriptions.some(rx => rx.skill_id === p.skill_id)) return true;
  return p.transfer_due_at !== null && p.transfer_due_at.getTime() <= input.ctx.now.getTime();
}

const daysSince = (p: SkillProgress, now: number) =>
  p.last_practiced_at ? Math.round((now - p.last_practiced_at.getTime()) / 86_400_000) : rules.spaced_review.eligible_after_days;

// ------------------------------------------------------------- the plan's own prescriptions

// "If no open prescription is in the week's focus areas, the plan creates one
// for the next focus skill below Practiced, in prerequisite order."
export function planPrescriptionSkill(week: PlanWeek | null, progress: ProgressMap, open: OpenPrescription[], isLive?: (id: string) => boolean): string | null {
  if (!week || (week.focus_areas.length === 0 && week.focus_skills.length === 0)) return null;
  if (open.some(rx => inFocus(rx.skill_id, week))) return null;
  const focus = DRILLS_CONFIG.taxonomy.skills.map(s => s.id)
    .filter(id => inFocus(id, week) && Object.values(stageDrills(id, isLive)).some(Boolean));
  for (const id of prerequisiteOrder(focus)) {
    if (stateRank(progress.get(id)?.state ?? 'not_started') < stateRank('practiced')) return id;
  }
  return null;
}

// Skills ordered so each comes after its prerequisites (catalog order otherwise).
export function prerequisiteOrder(skills: string[]): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    if (out.includes(id)) return;
    for (const pre of getSkill(id).prerequisites) if (skills.includes(pre)) visit(pre);
    out.push(id);
  };
  skills.forEach(visit);
  return out;
}

export const planReason = (skillId: string, week: PlanWeek) =>
  `This week's focus is ${week.theme.toLowerCase()}; ${lowerName(skillId)} comes next.`;

// ------------------------------------------------------------- milestones

export interface MilestoneFacts {
  progress: ProgressMap;
  prescribed_skills: string[];       // open prescriptions' skills
  tier3_passes: number;              // skills with a passing tier 3 set this week
  cases_this_week: number;
}

const reached = (progress: ProgressMap, id: string, s: 'practiced' | 'mastered') =>
  stateRank(progress.get(id)?.state ?? 'not_started') >= stateRank(s);

// The skills a milestone still needs (empty when met), for "milestones met"
// and for the +1 carried into the weak-spot pool at week rollover.
export function milestoneGaps(m: Milestone, facts: MilestoneFacts, earlier: Milestone[]): { met: boolean; skills: string[] } {
  if (m.type === 'plan_set') return { met: true, skills: [] };
  if (m.type === 'skills') {
    const skills = m.skills.filter(id => !reached(facts.progress, id, m.state));
    return { met: skills.length === 0, skills };
  }
  if (m.type === 'earlier_milestones') {
    const skills = [...new Set(earlier.flatMap(e => (e.type === 'skills' ? e.skills : [])))].filter(id => !reached(facts.progress, id, m.state));
    return { met: skills.length === 0, skills };
  }
  const skills = facts.prescribed_skills.filter(id => !reached(facts.progress, id, m.state));
  const tier3 = (m.tier3_passes ?? 0) <= facts.tier3_passes;
  const finalCase = !m.final_case || facts.cases_this_week > 0;
  return { met: skills.length === 0 && tier3 && finalCase, skills };
}

export function weekMilestones(week: PlanWeek, all: PlanWeek[], facts: MilestoneFacts) {
  const earlier = all.filter(w => w.week < week.week).flatMap(w => w.milestones);
  const results = week.milestones.map(m => milestoneGaps(m, facts, earlier));
  return { met: results.every(r => r.met), skills: [...new Set(results.flatMap(r => r.skills))] };
}

// Milestone skills from earlier weeks not yet met: +1 in the weak-spot pool.
// The weak-spot order (also Your progress's focus areas, so the two never
// disagree): priority, +2 for the week's focus, +1 for a missed milestone;
// ties go to the more reliable source, then the older prescription.
export function rankPrescriptions(prescriptions: OpenPrescription[], week: PlanWeek | null, missedMilestones: string[]) {
  return prescriptions
    .map(rx => ({ rx, score: rx.priority + (inFocus(rx.skill_id, week) ? programs.focus_priority_bonus : 0) + (missedMilestones.includes(rx.skill_id) ? programs.missed_milestone_bonus : 0) }))
    .sort((a, b) => b.score - a.score || SOURCE_ORDER[a.rx.source] - SOURCE_ORDER[b.rx.source] || a.rx.created_at.getTime() - b.rx.created_at.getTime());
}

export function missedMilestoneSkills(current: PlanWeek | null, all: PlanWeek[], progress: ProgressMap): string[] {
  if (!current) return [];
  const out = new Set<string>();
  for (const w of all.filter(x => x.week < current.week)) {
    for (const m of w.milestones) if (m.type === 'skills') for (const id of m.skills) if (!reached(progress, id, m.state)) out.add(id);
  }
  return [...out];
}
