// The progress engine against the database (docs/prd-drills.md "Event flow
// after a set completes", "Case results ingestion"). Loads a student's skill
// progress, runs the pure engine (./engine.ts, ./case.ts), and writes the new
// states, the state-change history and the prescriptions in the caller's
// transaction. Events are returned for the caller to log once it commits.
import 'server-only';
import { and, desc, eq, getTableColumns, inArray, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, drillSets, drillTiers, prescriptions, skillStateEvents, skillStates, studentDrillSettings } from '@/db/schema';
import { DRILLS_CONFIG, TAXONOMY_VERSION, getDrill, getMistakeTag } from '../config';
import { CaseResultPayloadSchema, type CaseResultPayload } from '../case-result';
import type { DrillEvent } from '../events';
import { isLiveDrill } from '../live';
import type { ItemResult } from '../sets/scoring';
import {
  applySet, newProgress, nextSetFor, type Context, type ProgressMap, type SetKind, type SkillProgress, type Stage,
  type Transition,
} from './engine';
import { applyCase } from './case';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;
type SetRow = typeof drillSets.$inferSelect;
type StateRow = typeof skillStates.$inferSelect;
type PrescriptionSource = (typeof prescriptions.$inferInsert)['sourceType'];
export interface PendingEvent { type: DrillEvent; props: Record<string, unknown> }

const rules = DRILLS_CONFIG.rules;
const DAY = 86_400_000;

function toProgress(r: StateRow): SkillProgress {
  return {
    skill_id: r.skillId, state: r.state, stage: r.stage as Stage | null, l1_streak: r.l1PassingStreak,
    l2_streak: r.l2PassingStreak, last_skill_score: r.lastSkillScore, last_practiced_at: r.lastPracticedAt,
    practiced_at: r.practicedAt, transfer_due_at: r.transferDueAt, next_review_at: r.nextReviewAt,
    low_streak: r.lowStreak, repair_sets: r.repairSets, paused_for_prereq: r.pausedForPrereq,
    prereq_sets: r.prereqSets, next_focus_tag: r.nextFocusTag,
  };
}

function toRow(studentId: string, p: SkillProgress) {
  return {
    studentId, skillId: p.skill_id, state: p.state, stage: p.stage, l1PassingStreak: p.l1_streak,
    l2PassingStreak: p.l2_streak, lastSkillScore: p.last_skill_score, lastPracticedAt: p.last_practiced_at,
    practicedAt: p.practiced_at, transferDueAt: p.transfer_due_at, nextReviewAt: p.next_review_at,
    lowStreak: p.low_streak, repairSets: p.repair_sets, pausedForPrereq: p.paused_for_prereq,
    prereqSets: p.prereq_sets, nextFocusTag: p.next_focus_tag, taxonomyVersion: TAXONOMY_VERSION, updatedAt: new Date(),
  };
}

export async function loadProgress(x: Exec, studentId: string, forUpdate = false): Promise<ProgressMap> {
  const q = x.select().from(skillStates).where(eq(skillStates.studentId, studentId));
  const rows = forUpdate ? await q.for('update') : await q;
  return new Map(rows.map(r => [r.skillId, toProgress(r)]));
}

export async function loadTiers(x: Exec, studentId: string): Promise<Record<string, number>> {
  const rows = await x.select().from(drillTiers).where(eq(drillTiers.studentId, studentId));
  return Object.fromEntries(rows.map(r => [r.drillId, r.currentTier]));
}

export async function progressContext(x: Exec, studentId: string, now = new Date()): Promise<Context> {
  const [settings] = await x.select({ interviewDate: studentDrillSettings.interviewDate }).from(studentDrillSettings)
    .where(eq(studentDrillSettings.studentId, studentId));
  const date = settings?.interviewDate ? new Date(`${settings.interviewDate}T00:00:00Z`) : null;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return { now, interviewDaysOut: date ? Math.round((date.getTime() - today.getTime()) / DAY) : null, isLive: isLiveDrill };
}

const same = (a: SkillProgress | undefined, b: SkillProgress) => JSON.stringify(a) === JSON.stringify(b);
const STATE_COLUMNS = getTableColumns(skillStates);

async function saveProgress(x: Exec, studentId: string, before: ProgressMap, after: ProgressMap, transitions: Transition[],
  source: { type: 'set' | 'case' | 'review'; id: string }): Promise<PendingEvent[]> {
  const changed = [...after.values()].filter(p => !same(before.get(p.skill_id), p));
  if (changed.length) {
    await x.insert(skillStates).values(changed.map(p => toRow(studentId, p)))
      .onConflictDoUpdate({
        target: [skillStates.studentId, skillStates.skillId],
        set: Object.fromEntries(Object.keys(toRow(studentId, changed[0]))
          .filter(k => k !== 'studentId' && k !== 'skillId')
          .map(k => [k, sql.raw(`excluded.${STATE_COLUMNS[k as keyof typeof STATE_COLUMNS].name}`)])),
      });
  }
  if (transitions.length) {
    await x.insert(skillStateEvents).values(transitions.map(t => ({
      studentId, skillId: t.skill_id, fromState: t.from, toState: t.to, reason: t.reason,
      sourceType: source.type, sourceId: source.id, taxonomyVersion: TAXONOMY_VERSION,
    })));
  }
  return transitions.map(t => ({
    type: 'skill_state_changed' as const,
    props: { skill_id: t.skill_id, from_state: t.from, to_state: t.to, source_type: source.type, source_id: source.id },
  }));
}

// ------------------------------------------------------------ prescriptions

const ACTIVE = ['open', 'in_progress', 'paused'] as const;

async function activeFor(x: Exec, studentId: string, skillId: string) {
  return x.select().from(prescriptions)
    .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.skillId, skillId), inArray(prescriptions.status, [...ACTIVE])));
}

// "Dismissals are logged and the skill is not re-prescribed until another case flags it."
async function dismissedSinceLastCase(x: Exec, studentId: string, skillId: string): Promise<boolean> {
  const [latest] = await x.select({ status: prescriptions.status }).from(prescriptions)
    .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.skillId, skillId)))
    .orderBy(desc(prescriptions.createdAt)).limit(1);
  return latest?.status === 'dismissed';
}

async function createPrescription(x: Exec, studentId: string, progress: ProgressMap, tiers: Record<string, number>, ctx: Context, p: {
  skill_id: string; priority: number; reason: string; evidence?: string | null; focus_tag?: string | null;
  source_type: PrescriptionSource; source_id: string;
}): Promise<PendingEvent[]> {
  const sp = progress.get(p.skill_id) ?? newProgress(p.skill_id);
  const next = nextSetFor(sp, tiers, ctx);
  if (!next) return [];
  const [row] = await x.insert(prescriptions).values({
    studentId, skillId: p.skill_id, drillId: next.drill_id, level: getDrill(next.drill_id).level, stage: next.stage,
    tier: next.tier, focusTag: p.focus_tag ?? null, priority: p.priority, reasonText: p.reason,
    evidenceQuote: p.evidence ?? null, sourceType: p.source_type, sourceId: p.source_id,
    // A skill paused by the stuck rule waits for its prerequisite.
    status: sp.paused_for_prereq ? 'paused' : 'open', taxonomyVersion: TAXONOMY_VERSION,
  }).returning({ id: prescriptions.id });
  return [{ type: 'prescription_created', props: {
    prescription_id: row.id, skill_id: p.skill_id, drill_id: next.drill_id, source_type: p.source_type, priority: p.priority,
  } }];
}

async function closePrescriptions(x: Exec, studentId: string, where: ReturnType<typeof and>, status: 'completed' | 'superseded'): Promise<PendingEvent[]> {
  const closed = await x.update(prescriptions).set({ status, closedAt: new Date() })
    .where(and(eq(prescriptions.studentId, studentId), inArray(prescriptions.status, [...ACTIVE]), where))
    .returning({ id: prescriptions.id, skillId: prescriptions.skillId, drillId: prescriptions.drillId, sourceType: prescriptions.sourceType, priority: prescriptions.priority });
  if (status !== 'completed') return [];
  return closed.map(r => ({ type: 'prescription_completed' as const, props: {
    prescription_id: r.id, skill_id: r.skillId, drill_id: r.drillId, source_type: r.sourceType, priority: r.priority,
  } }));
}

// ------------------------------------------------------------ after a set

export interface SetProgressResult { transitions: Transition[]; events: PendingEvent[] }

// Runs inside finalizeSet's transaction, once the set is scored.
export async function applySetProgress(tx: Tx, set: SetRow, results: ItemResult[],
  skillScores: Record<string, { score: number; count: number }>): Promise<SetProgressResult> {
  const studentId = set.studentId;
  const [rx] = set.prescriptionId
    ? await tx.select({ skillId: prescriptions.skillId }).from(prescriptions).where(eq(prescriptions.id, set.prescriptionId))
    : [];
  const target = rx?.skillId ?? set.focusSkill ?? null;
  const kind: SetKind = set.isTransferCheck ? 'transfer' : set.source === 'review' ? 'review' : 'normal';
  const misses = results.filter(r => !r.skipped && r.score < 1);
  const missTags = misses.flatMap(r => r.mistake_tags.filter(t => getMistakeTag(t)));

  const before = await loadProgress(tx, studentId, true);
  const ctx = await progressContext(tx, studentId);
  const u = applySet(before, {
    set_id: set.id, drill_id: set.drillId, tier: set.tier, kind, target_skill: target, skill_scores: skillScores,
    miss_tags: missTags, misses: misses.length,
  }, ctx);
  const events = await saveProgress(tx, studentId, before, u.progress, u.transitions, { type: kind === 'review' ? 'review' : 'set', id: set.id });
  const tiers = await loadTiers(tx, studentId);
  const p = rules.prescriptions;

  for (const intent of u.intents) {
    if (intent.type === 'complete') {
      events.push(...await closePrescriptions(tx, studentId, eq(prescriptions.skillId, intent.skill_id), 'completed'));
    } else if (intent.type === 'resume') {
      await tx.update(prescriptions).set({ status: 'open' })
        .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.skillId, intent.skill_id), eq(prescriptions.status, 'paused')));
    } else if (intent.type === 'prerequisite') {
      const stuck = await activeFor(tx, studentId, intent.for_skill);
      const priority = Math.max(p.in_drill_priority, ...stuck.map(s => s.priority)) + 1;
      await tx.update(prescriptions).set({ status: 'paused' })
        .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.skillId, intent.for_skill), inArray(prescriptions.status, ['open', 'in_progress'])));
      if ((await activeFor(tx, studentId, intent.skill_id)).length === 0) {
        events.push(...await createPrescription(tx, studentId, u.progress, tiers, ctx, {
          skill_id: intent.skill_id, priority, reason: intent.reason, source_type: 'drill', source_id: set.id,
        }));
      }
      events.push({ type: 'prerequisite_prescribed', props: { skill_id: intent.for_skill, prerequisite_id: intent.skill_id } });
    } else {
      // A mistake from another skill, or a transfer check at 60–79%.
      if ((await activeFor(tx, studentId, intent.skill_id)).length) continue;
      if (intent.type === 'drill' && await dismissedSinceLastCase(tx, studentId, intent.skill_id)) continue;
      events.push(...await createPrescription(tx, studentId, u.progress, tiers, ctx, {
        skill_id: intent.skill_id, priority: p.in_drill_priority, reason: intent.reason, source_type: 'drill', source_id: set.id,
        focus_tag: intent.type === 'drill' && rules.focusable_tags[intent.tag] ? intent.tag : null,
      }));
    }
  }

  if (kind === 'transfer' && target && skillScores[target]) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(drillSets).where(and(
      eq(drillSets.studentId, studentId), eq(drillSets.isTransferCheck, true), eq(drillSets.focusSkill, target),
      inArray(drillSets.status, ['completed']), ne(drillSets.id, set.id)));
    const score = skillScores[target].score;
    events.push({ type: 'transfer_check_completed', props: {
      skill_id: target, score, passed: score >= rules.transfer.pass_at_or_above - 1e-9, attempt_number: n + 1,
    } });
  }
  return { transitions: u.transitions, events };
}

// ------------------------------------------------------------ case results

export type IngestResult = { status: 'ingested' | 'duplicate'; prescriptions: number; events: PendingEvent[] };

// Case results ingestion (PRD "Internal interfaces"): validates the payload
// against the taxonomy, stores it, updates skill states and regenerates
// prescriptions. Idempotent on case_attempt_id. The caller logs the events.
export async function ingestCaseResultTx(raw: unknown, now = new Date()): Promise<IngestResult> {
  const payload = CaseResultPayloadSchema.parse(raw);
  return db.transaction(async tx => {
    const inserted = await tx.insert(caseResults).values({
      caseAttemptId: payload.case_attempt_id, studentId: payload.student_id, caseId: payload.case_id,
      caseType: payload.case_type, difficultyTier: payload.difficulty_tier, rubricScores: payload.rubric_scores,
      skillsObserved: payload.skills_observed, findings: payload.findings, taxonomyVersion: payload.taxonomy_version,
      completedAt: new Date(payload.completed_at),
    }).onConflictDoNothing().returning({ id: caseResults.caseAttemptId });
    if (inserted.length === 0) return { status: 'duplicate' as const, prescriptions: 0, events: [] };

    const studentId = payload.student_id;
    const [prevRow] = await tx.select().from(caseResults).where(and(
      eq(caseResults.studentId, studentId), ne(caseResults.caseAttemptId, payload.case_attempt_id),
      lt(caseResults.completedAt, new Date(payload.completed_at)),
    )).orderBy(desc(caseResults.completedAt)).limit(1);
    // Only the previous case's findings matter (+2 for a skill flagged again).
    const previous = prevRow ? { ...payload, findings: (prevRow.findings as CaseResultPayload['findings']).filter(f => getMistakeTag(f.tag)) } : null;

    const before = await loadProgress(tx, studentId, true);
    const ctx = await progressContext(tx, studentId, now);
    const u = applyCase(before, payload, previous, ctx);
    const events: PendingEvent[] = [{ type: 'case_result_received', props: {
      case_attempt_id: payload.case_attempt_id, case_type: payload.case_type, difficulty_tier: payload.difficulty_tier,
      finding_count: payload.findings.length,
    } }];
    events.push(...await saveProgress(tx, studentId, before, u.progress, u.transitions, { type: 'case', id: payload.case_attempt_id }));

    // "When a newer case arrives, open prescriptions are recalculated": the
    // last case's (and the diagnostic's) are superseded, and so is any other
    // prescription for a skill this case prescribes. Plan prescriptions stay.
    const skills = u.prescriptions.map(p => p.skill_id);
    await closePrescriptions(tx, studentId, skills.length
      ? sql`(${prescriptions.sourceType} in ('case', 'diagnostic') or ${inArray(prescriptions.skillId, skills)})`
      : sql`${prescriptions.sourceType} in ('case', 'diagnostic')`, 'superseded');
    const tiers = await loadTiers(tx, studentId);
    for (const p of u.prescriptions) {
      events.push(...await createPrescription(tx, studentId, u.progress, tiers, ctx, {
        skill_id: p.skill_id, priority: p.priority, reason: p.reason, evidence: p.evidence, focus_tag: p.focus_tag,
        source_type: 'case', source_id: payload.case_attempt_id,
      }));
    }
    return { status: 'ingested' as const, prescriptions: u.prescriptions.length, events };
  });
}
