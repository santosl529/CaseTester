// The progress engine (docs/prd-drills.md "Mastery and adaptive progression",
// "Skill tree"). Pure code: given a student's skill progress and a finished
// set or case, it returns the new progress, the state changes and the
// prescriptions to write. The database layer (./store.ts) loads and saves;
// every rule lives here so scripted scenarios can test it exactly.
import { DRILLS_CONFIG, getDrill, getMistakeTag, getSkill } from '../config';

export const SKILL_STATES = ['not_started', 'learning', 'recognizes', 'practiced', 'mastered', 'validated'] as const;
export type SkillStateName = (typeof SKILL_STATES)[number];
export type Stage = 'recognize' | 'repair' | 'construct';
export type SetKind = 'normal' | 'review' | 'transfer';

export const stateRank = (s: SkillStateName) => SKILL_STATES.indexOf(s);
const atLeast = (s: SkillStateName, min: SkillStateName) => stateRank(s) >= stateRank(min);

export interface SkillProgress {
  skill_id: string;
  state: SkillStateName;
  stage: Stage | null;
  l1_streak: number;
  l2_streak: number;
  last_skill_score: number | null;
  last_practiced_at: Date | null;
  practiced_at: Date | null;
  transfer_due_at: Date | null;
  next_review_at: Date | null;
  low_streak: number;
  repair_sets: number;
  paused_for_prereq: string | null;
  prereq_sets: number;
  next_focus_tag: string | null;
}

export type ProgressMap = Map<string, SkillProgress>;

export function newProgress(skillId: string): SkillProgress {
  return {
    skill_id: skillId, state: 'not_started', stage: null, l1_streak: 0, l2_streak: 0, last_skill_score: null,
    last_practiced_at: null, practiced_at: null, transfer_due_at: null, next_review_at: null, low_streak: 0,
    repair_sets: 0, paused_for_prereq: null, prereq_sets: 0, next_focus_tag: null,
  };
}

export interface Transition {
  skill_id: string;
  from: SkillStateName;
  to: SkillStateName;
  reason: string;
}

// What the database layer should do with prescriptions after a set or case.
export type PrescriptionIntent =
  // A mistake from another skill turned up in a drill (PRD "Prescriptions inside drills").
  | { type: 'drill'; skill_id: string; tag: string; reason: string }
  // Transfer check at 60–79%: "one Construct set goes into the weak-spot pool".
  | { type: 'transfer_retry'; skill_id: string; reason: string }
  // The stuck rule: prescribe the prerequisite, pause the stuck skill.
  | { type: 'prerequisite'; skill_id: string; for_skill: string; reason: string }
  | { type: 'resume'; skill_id: string }
  // "A prescription stays open until its skill reaches Mastered."
  | { type: 'complete'; skill_id: string };

export interface Context {
  now: Date;
  // Days until the interview, if the student set a date.
  interviewDaysOut?: number | null;
  sprint?: boolean;
  isLive?: (drillId: string) => boolean;
}

const rules = DRILLS_CONFIG.rules;
const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const defaultLive = (id: string) => getDrill(id).live;
const catalogIndex = new Map(DRILLS_CONFIG.drills.drills.map((d, i) => [d.id, i]));

// The live drill for each stage of a skill's chain.
export function stageDrills(skillId: string, isLive = defaultLive): Record<Stage, string | null> {
  const map = rules.skill_drills[skillId];
  const live = (id: string | null | undefined) => (id && isLive(id) ? id : null);
  return { recognize: live(map?.l1), repair: live(map?.repair), construct: live(map?.l2) };
}

export const hasLiveDrill = (skillId: string, isLive = defaultLive) =>
  Object.values(stageDrills(skillId, isLive)).some(Boolean);

export function stageOfDrill(drillId: string, skillId: string): Stage {
  const map = rules.skill_drills[skillId];
  if (map?.repair === drillId) return 'repair';
  return getDrill(drillId).level === 1 ? 'recognize' : 'construct';
}

// The order the PRD's tie-breaks call "catalog order": a skill's first live
// drill in drills.v1.json.
export function skillCatalogIndex(skillId: string, isLive = defaultLive): number {
  const drills = Object.values(stageDrills(skillId, isLive)).filter((d): d is string => d !== null);
  return drills.length ? Math.min(...drills.map(d => catalogIndex.get(d)!)) : Number.MAX_SAFE_INTEGER;
}

// Sprint, and an interview 7 or fewer days away: Recognize is never served
// (except for skills with no live Construct drill).
function skipRecognize(ctx: Context): boolean {
  return Boolean(ctx.sprint) || (ctx.interviewDaysOut != null && ctx.interviewDaysOut <= rules.interview_mode.intense_within_days);
}

// "Once a skill reaches Recognizes, the next set is Repair"; skills with no
// Repair drill skip that stage.
function stageAfterRecognizes(skillId: string, isLive: (id: string) => boolean): Stage {
  const d = stageDrills(skillId, isLive);
  return d.repair ? 'repair' : d.construct ? 'construct' : 'recognize';
}

// ------------------------------------------------------------ after a set

export interface SetOutcome {
  set_id: string;
  drill_id: string;
  tier: number;
  kind: SetKind;
  // The skill the set was for (prescription, review, transfer check or the
  // skill picked in Practice something specific); null for a plain retry.
  target_skill: string | null;
  // Per-skill scores; only skills with at least 3 items or checks are listed
  // (lib/drills/sets/summary.ts skillScores).
  skill_scores: Record<string, { score: number; count: number }>;
  // Mistake tags on missed items (skips excluded), one entry per miss per tag.
  miss_tags: string[];
  misses: number;
}

export interface Update {
  progress: ProgressMap;
  transitions: Transition[];
  intents: PrescriptionIntent[];
}

function clone(progress: ProgressMap): ProgressMap {
  return new Map([...progress].map(([k, v]) => [k, { ...v }]));
}

function get(progress: ProgressMap, skillId: string): SkillProgress {
  let p = progress.get(skillId);
  if (!p) progress.set(skillId, (p = newProgress(skillId)));
  return p;
}

function move(p: SkillProgress, to: SkillStateName, reason: string, out: Transition[]) {
  if (p.state === to) return;
  out.push({ skill_id: p.skill_id, from: p.state, to, reason });
  p.state = to;
}

function toPracticed(p: SkillProgress, reason: string, ctx: Context, out: Transition[]) {
  move(p, 'practiced', reason, out);
  p.practiced_at = ctx.now;
  p.transfer_due_at = ctx.sprint ? ctx.now : addDays(ctx.now, rules.transfer.unlock_after_days);
}

// Practiced, Mastered or Validated → Recognizes: a case finding, a failed
// transfer check or a failed review. The next set is Repair (or Construct).
function demote(p: SkillProgress, reason: string, isLive: (id: string) => boolean, out: Transition[]) {
  move(p, 'recognizes', reason, out);
  p.stage = stageAfterRecognizes(p.skill_id, isLive);
  p.l1_streak = 0;
  p.l2_streak = 0;
  p.repair_sets = 0;
  p.transfer_due_at = null;
  p.next_review_at = null;
}

function toMastered(progress: ProgressMap, p: SkillProgress, reason: string, ctx: Context, isLive: (id: string) => boolean, out: Update) {
  move(p, 'mastered', reason, out.transitions);
  p.transfer_due_at = null;
  p.next_review_at = addDays(ctx.now, rules.spaced_review.eligible_after_days);
  out.intents.push({ type: 'complete', skill_id: p.skill_id });
  // Credit down: prerequisites at Not started or Learning move to Recognizes.
  for (const pre of getSkill(p.skill_id).prerequisites) {
    const q = get(progress, pre);
    if (q.state === 'not_started' || q.state === 'learning') {
      move(q, 'recognizes', `credit down: ${p.skill_id} reached Mastered`, out.transitions);
      q.stage = stageAfterRecognizes(pre, isLive);
    }
  }
}

export function applySet(before: ProgressMap, set: SetOutcome, ctx: Context): Update {
  const isLive = ctx.isLive ?? defaultLive;
  const progress = clone(before);
  const out: Update = { progress, transitions: [], intents: [] };
  const m = rules.mastery;
  const counts = set.tier >= m.min_counting_tier;

  // Only the drill's primary skills move (PRD "Skill states and transitions"):
  // QN-4's arithmetic score counts toward the skill score, but only QN-3 can
  // make arithmetic Practiced.
  for (const skillId of primarySkills(set)) {
    const { score } = set.skill_scores[skillId];
    const p = get(progress, skillId);
    const stage = stageOfDrill(set.drill_id, skillId);
    const passed = score >= m.passing_score - 1e-9;
    if (p.state === 'not_started') move(p, 'learning', 'first set completed', out.transitions);
    p.last_skill_score = score;
    p.last_practiced_at = ctx.now;
    p.low_streak = score < rules.stuck.low_score_below - 1e-9 ? p.low_streak + 1 : 0;
    if (p.next_focus_tag && set.target_skill === skillId) p.next_focus_tag = null;   // the focus was served

    const targeted = set.target_skill === skillId;
    if (set.kind === 'transfer' && targeted && p.state === 'practiced') {
      const t = rules.transfer;
      if (score >= t.pass_at_or_above - 1e-9) toMastered(progress, p, `transfer check ${pct(score)}`, ctx, isLive, out);
      else if (score < t.demote_below - 1e-9) demote(p, `transfer check ${pct(score)}`, isLive, out.transitions);
      else {
        p.transfer_due_at = addDays(ctx.now, t.retry_after_days);
        out.intents.push({ type: 'transfer_retry', skill_id: skillId, reason: `Transfer check scored ${pct(score)}; one more practice set before the next check.` });
      }
    } else if (set.kind === 'review' && targeted && (p.state === 'mastered' || p.state === 'validated')) {
      const r = rules.spaced_review;
      if (score >= r.reset_at_or_above - 1e-9) p.next_review_at = addDays(ctx.now, r.eligible_after_days);
      else if (score < r.demote_below - 1e-9) demote(p, `spaced review ${pct(score)}`, isLive, out.transitions);
      else p.next_review_at = addDays(ctx.now, r.retry_after_days);
    } else if (stage === 'recognize') {
      if (counts) p.l1_streak = passed ? p.l1_streak + 1 : 0;
      if (p.l1_streak >= m.consecutive_sets && (p.state === 'learning' || p.state === 'recognizes')) {
        // Skills with no live Construct drill: Level 1 criteria grant Practiced.
        if (!stageDrills(skillId, isLive).construct) toPracticed(p, `${m.consecutive_sets} Recognize sets ≥ ${pct(m.passing_score)} (no Construct drill)`, ctx, out.transitions);
        else if (p.state === 'learning') {
          move(p, 'recognizes', `${m.consecutive_sets} Recognize sets ≥ ${pct(m.passing_score)}`, out.transitions);
          p.stage = stageAfterRecognizes(skillId, isLive);
          p.repair_sets = 0;
        }
      }
    } else if (stage === 'repair') {
      // Repair sets never change states; they move the student to Construct.
      const s = rules.stages;
      p.repair_sets += 1;
      if (score >= s.repair_to_construct_at_or_above - 1e-9 || p.repair_sets >= s.max_repair_sets) {
        p.stage = 'construct';
        p.repair_sets = 0;
      }
    } else {
      if (counts) p.l2_streak = passed ? p.l2_streak + 1 : 0;
      if (!atLeast(p.state, 'practiced')) {
        if (p.l2_streak >= m.consecutive_sets) toPracticed(p, `${m.consecutive_sets} Construct sets ≥ ${pct(m.passing_score)}`, ctx, out.transitions);
        else p.stage = stageAfterConstruct(skillId, score, ctx, isLive);
      }
    }
    // Practicing a Mastered or Validated skill restarts its review clock.
    if ((p.state === 'mastered' || p.state === 'validated') && !(set.kind === 'review' && targeted)) {
      p.next_review_at = addDays(ctx.now, rules.spaced_review.eligible_after_days);
    }
  }

  applyStuckRule(progress, set, isLive, out);
  inDrillPrescriptions(progress, set, isLive, out);
  return out;
}

const primarySkills = (set: SetOutcome) =>
  Object.keys(set.skill_scores).filter(id => getDrill(set.drill_id).primary_skills.includes(id));

function stageAfterConstruct(skillId: string, score: number, ctx: Context, isLive: (id: string) => boolean): Stage {
  const s = rules.stages;
  const d = stageDrills(skillId, isLive);
  if (score >= s.construct_to_repair_below - 1e-9) return 'construct';
  if (score >= s.construct_to_recognize_below - 1e-9) return d.repair ? 'repair' : 'construct';
  // Below 50%: back to Recognize (in Sprint, or close to the interview, Repair
  // instead). Skills with no Recognize drill stay put; the tier drops instead.
  if (d.recognize && !skipRecognize(ctx)) return 'recognize';
  return d.repair ? 'repair' : 'construct';
}

// The stuck rule (PRD "Skill tree"): 2 sets in a row below 50% with a
// prerequisite below Practiced → prescribe that prerequisite (lowest state
// first, then catalog order) and pause the stuck skill. The stuck skill
// resumes when the prerequisite reaches Practiced or after 3 of its sets.
function applyStuckRule(progress: ProgressMap, set: SetOutcome, isLive: (id: string) => boolean, out: Update) {
  const st = rules.stuck;
  const practicedSkills = primarySkills(set);
  for (const q of progress.values()) {
    if (!q.paused_for_prereq || !practicedSkills.includes(q.paused_for_prereq)) continue;
    q.prereq_sets += 1;
    const pre = progress.get(q.paused_for_prereq)!;
    if (atLeast(pre.state, 'practiced') || q.prereq_sets >= st.resume_after_prereq_sets) {
      q.paused_for_prereq = null;
      q.prereq_sets = 0;
      q.low_streak = 0;
      out.intents.push({ type: 'resume', skill_id: q.skill_id });
    }
  }
  for (const skillId of practicedSkills) {
    const p = progress.get(skillId)!;
    if (p.paused_for_prereq || p.low_streak < st.consecutive_sets) continue;
    const below = getSkill(skillId).prerequisites
      .filter(pre => hasLiveDrill(pre, isLive))
      .map(pre => get(progress, pre))
      .filter(q => !atLeast(q.state, 'practiced'))
      .sort((a, b) => stateRank(a.state) - stateRank(b.state) || skillCatalogIndex(a.skill_id, isLive) - skillCatalogIndex(b.skill_id, isLive));
    if (!below.length) continue;
    const pre = below[0];
    p.paused_for_prereq = pre.skill_id;
    p.prereq_sets = 0;
    out.intents.push({
      type: 'prerequisite', skill_id: pre.skill_id, for_skill: skillId,
      reason: `${getSkill(skillId).name} builds on ${lowerName(pre.skill_id)}; practicing that first should help.`,
    });
  }
}

// PRD "Prescriptions inside drills": a tag that is 40%+ of a set's misses
// becomes the focus of the skill's next set (where the drill can focus on it),
// and a mistake from another skill gets that skill a prescription.
function inDrillPrescriptions(progress: ProgressMap, set: SetOutcome, isLive: (id: string) => boolean, out: Update) {
  const p = rules.prescriptions;
  if (set.misses > 0) {
    const counts = new Map<string, number>();
    for (const t of set.miss_tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    const [top] = [...counts].sort((a, b) => b[1] - a[1]);
    if (top && top[1] / set.misses >= p.focus_when_tag_share_at_least - 1e-9 && rules.focusable_tags[top[0]]) {
      const skill = getMistakeTag(top[0])?.skill;
      if (skill) get(progress, skill).next_focus_tag = top[0];
    }
  }
  if (!set.target_skill) return;
  // Weighted as in a case: a major miss is 2, a minor one 1, and another
  // skill is prescribed at 2 or more (one major miss, or two minor ones).
  const w = p.weights;
  const weight = new Map<string, { total: number; tag: string; top: number }>();
  for (const tag of set.miss_tags) {
    const t = getMistakeTag(tag);
    if (!t || t.skill === set.target_skill || !hasLiveDrill(t.skill, isLive)) continue;
    const add = t.severity === 'major' ? w.major : w.minor;
    const cur = weight.get(t.skill) ?? { total: 0, tag, top: 0 };
    weight.set(t.skill, { total: cur.total + add, tag: add > cur.top ? tag : cur.tag, top: Math.max(cur.top, add) });
  }
  for (const [skill, { total, tag }] of weight) {
    if (total < w.major) continue;
    out.intents.push({
      type: 'drill', skill_id: skill, tag,
      reason: `Your last ${getDrill(set.drill_id).name} set showed a ${getMistakeTag(tag)!.label}.`,
    });
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

// A skill's name mid-sentence: "math setup", but "MECE structure".
export function lowerName(skillId: string): string {
  const name = getSkill(skillId).name;
  return /^[A-Z]{2}/.test(name) ? name : name[0].toLowerCase() + name.slice(1);
}

// ------------------------------------------------------------ the next set

export interface NextSet {
  drill_id: string;
  stage: Stage;
  tier: number;
  kind: SetKind;
  test_out: boolean;
}

// Which set a skill gets next (PRD "Where a student starts and how they move
// between stages", "Transfer check", "Spaced review"). `tiers` holds the
// student's current tier per drill.
export function nextSetFor(p: SkillProgress, tiers: Record<string, number>, ctx: Context): NextSet | null {
  const isLive = ctx.isLive ?? defaultLive;
  const d = stageDrills(p.skill_id, isLive);
  if (!d.recognize && !d.repair && !d.construct) return null;
  const tierOf = (drill: string) => tiers[drill] ?? rules.tiers.start;
  const now = ctx.now.getTime();

  if (p.state === 'practiced' && p.transfer_due_at && p.transfer_due_at.getTime() <= now) {
    const drill = d.construct ?? d.recognize!;
    const tier = d.construct ? rules.transfer.tier : rules.transfer.level1_tier;
    return { drill_id: drill, stage: d.construct ? 'construct' : 'recognize', tier, kind: 'transfer', test_out: false };
  }
  if ((p.state === 'mastered' || p.state === 'validated') && p.next_review_at && p.next_review_at.getTime() <= now) {
    const drill = d.construct ?? d.recognize!;
    return { drill_id: drill, stage: d.construct ? 'construct' : 'recognize', tier: tierOf(drill), kind: 'review', test_out: false };
  }
  if (p.stage === null && (p.state === 'not_started' || p.state === 'learning')) {
    // The test-out: Construct at tier 2 (or the student's tier on that drill,
    // if higher). Skills with no live Construct drill start at Recognize, tier 2.
    const drill = d.construct ?? d.recognize ?? d.repair!;
    const stage: Stage = d.construct ? 'construct' : d.recognize ? 'recognize' : 'repair';
    return { drill_id: drill, stage, tier: Math.max(tierOf(drill), rules.test_out.tier), kind: 'normal', test_out: stage === 'construct' };
  }
  let stage: Stage = p.stage ?? stageAfterRecognizes(p.skill_id, isLive);
  if (stage === 'recognize' && (!d.recognize || (skipRecognize(ctx) && d.construct))) stage = d.repair ? 'repair' : 'construct';
  if (stage === 'repair' && !d.repair) stage = d.construct ? 'construct' : 'recognize';
  if (stage === 'construct' && !d.construct) stage = d.recognize ? 'recognize' : 'repair';
  const drill = d[stage]!;
  return { drill_id: drill, stage, tier: tierOf(drill), kind: 'normal', test_out: false };
}
