// Where a student's plan comes from (D6 round 2): a full case, the
// diagnostic or the 2–3 minute questionnaire, whichever comes first. The
// first one starts the plan (week 1, or Sprint day 2, begins that day, so the
// first workout is ready at once); a later, more reliable one updates it
// (case > diagnostic > questionnaire). Self-directed students get the same
// placements and suggestions, with no plan.
import 'server-only';
import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { drillQuestionnaires, drillSets, prescriptions, sessions, studentPrograms } from '@/db/schema';
import { DRILLS_CONFIG, getSkill } from '../config';
import { logDrillEvent, logPendingEvents } from '../events';
import { isLiveDrill } from '../live';
import { stateRank } from '../progress/engine';
import { activeFor, createPrescription, loadProgress, loadTiers, progressContext, saveProgress, type PendingEvent } from '../progress/store';
import { placeFor } from './diagnostic';
import { applyPlacements } from './diagnostic-store';
import { addDays } from './plan';
import { activeProgram, changeProgram, programView, ProgramError, studentToday } from './store';
import { checkSkills, QUESTIONNAIRE_AREAS, questionnairePlacements, questionnairePrescriptions, type QuestionnaireArea, type Ratings } from './questionnaire';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PlanSource = 'case' | 'diagnostic' | 'questionnaire';
const RANK: Record<PlanSource, number> = { questionnaire: 1, diagnostic: 2, case: 3 };

// Records a plan source. Returns true when it created or updated the plan.
export async function recordPlanSource(studentId: string, source: PlanSource, now = new Date()): Promise<boolean> {
  const program = await activeProgram(db, studentId);
  if (!program) return false;
  const previous = program.planSource as PlanSource | null;
  if (previous && RANK[previous] >= RANK[source]) return false;
  const first = previous === null;
  const { today } = await studentToday(studentId, now);
  await db.update(studentPrograms).set({
    planSource: source,
    ...(first && {
      planCreatedAt: now,
      planSeenAt: null,
      // Week 0 (Sprint day 1) becomes yesterday, so week 1 (day 2) is today.
      ...(program.track !== 'self_directed' && { startDate: addDays(today, -1) }),
    }),
  }).where(eq(studentPrograms.id, program.id));
  const view = await programView(studentId, now);
  await logDrillEvent(studentId, 'plan_created', {
    source, track: program.track, previous_source: previous, focus_skills: view?.week?.focus_skills ?? [],
  });
  return true;
}

// A completed full case session is a plan source; the case grader's findings,
// when they arrive, update prescriptions through case ingestion.
export async function planFromCase(studentId: string): Promise<boolean> {
  const program = await activeProgram(db, studentId);
  if (!program || program.planSource === 'case') return false;
  const [c] = await db.select({ n: count() }).from(sessions)
    .where(and(eq(sessions.userId, studentId), eq(sessions.status, 'completed'), isNotNull(sessions.completedAt)));
  return c.n > 0 ? recordPlanSource(studentId, 'case') : false;
}

// ------------------------------------------------------------- questionnaire

const rating = z.number().int().min(1).max(5);
export const QuestionnaireSchema = z.object({
  interview_date: z.iso.date().nullable().default(null),
  cases_done: z.enum(['0', '1-5', '6+']),
  availability: z.string().optional(),
  ratings: z.object({ structuring: rating, math: rating, charts: rating, recommendations: rating }),
  hardest: z.enum(['structuring', 'math', 'charts', 'recommendations']).nullable().default(null),
});

export async function submitQuestionnaire(studentId: string, input: z.infer<typeof QuestionnaireSchema>) {
  let program = await activeProgram(db, studentId);
  if (!program) throw new ProgramError('no_program', 'Set up your training first.');
  // The onboarding answers, changed here, rebuild the plan as in Settings.
  const wanted = DRILLS_CONFIG.programs.availability.find(a => a.id === input.availability)?.workouts_per_week;
  const availabilityChanged = wanted !== undefined && program.track !== 'self_directed' && wanted !== program.workoutsPerWeek;
  if (input.interview_date !== program.interviewDate || availabilityChanged) {
    await changeProgram(studentId, { interview_date: input.interview_date, ...(availabilityChanged && { availability: input.availability }) });
  }
  if (input.cases_done !== program.casesDone) await db.update(studentPrograms).set({ casesDone: input.cases_done }).where(and(eq(studentPrograms.studentId, studentId), eq(studentPrograms.status, 'active')));
  program = (await activeProgram(db, studentId))!;

  const [row] = await db.insert(drillQuestionnaires).values({ studentId, ratings: input.ratings, hardest: input.hardest }).returning({ id: drillQuestionnaires.id });
  // A diagnostic or case already placed the student: the answers are kept, nothing moves.
  const outranked = program.planSource === 'diagnostic' || program.planSource === 'case';
  if (!outranked) {
    const events = await db.transaction(async tx => {
      const { before, after, transitions } = await applyPlacements(tx, studentId, questionnairePlacements(input.ratings, isLiveDrill), 'questionnaire placement');
      const out: PendingEvent[] = await saveProgress(tx, studentId, before, after, transitions, { type: 'set', id: `questionnaire:${row.id}` });
      // A newer questionnaire replaces the last one's prescriptions.
      await tx.update(prescriptions).set({ status: 'superseded', closedAt: new Date() })
        .where(and(eq(prescriptions.studentId, studentId), eq(prescriptions.sourceType, 'questionnaire'), inArray(prescriptions.status, ['open', 'in_progress', 'paused'])));
      const ctx = await progressContext(tx, studentId);
      const tiers = await loadTiers(tx, studentId);
      for (const rx of questionnairePrescriptions(input.ratings, input.hardest, isLiveDrill)) {
        if ((await activeFor(tx, studentId, rx.skill_id)).length) continue;
        out.push(...await createPrescription(tx, studentId, after, tiers, ctx, { ...rx, source_type: 'questionnaire', source_id: row.id }));
      }
      return out;
    });
    await logPendingEvents(studentId, events);
  }
  await logDrillEvent(studentId, 'questionnaire_completed', { questionnaire_id: row.id, ratings: input.ratings, hardest: input.hardest });
  await recordPlanSource(studentId, 'questionnaire');
  return { ok: true };
}

export async function latestQuestionnaire(studentId: string) {
  const [row] = await db.select().from(drillQuestionnaires).where(eq(drillQuestionnaires.studentId, studentId)).orderBy(desc(drillQuestionnaires.createdAt)).limit(1);
  return row ? { ...row, ratings: row.ratings as Ratings, hardest: row.hardest as QuestionnaireArea | null } : null;
}

// ------------------------------------------------------------- quick checks

// While the plan rests on the questionnaire: one skill per area whose
// placement a short check set confirms, in order of need, until each has had
// its check (or the skill moved past Learning by other practice).
export async function pendingChecks(studentId: string): Promise<string[]> {
  const program = await activeProgram(db, studentId);
  if (program?.planSource !== 'questionnaire') return [];
  const q = await latestQuestionnaire(studentId);
  if (!q) return [];
  const done = new Set((await db.select({ skill: drillSets.focusSkill }).from(drillSets)
    .where(and(eq(drillSets.studentId, studentId), eq(drillSets.isPlacementCheck, true), eq(drillSets.status, 'completed')))).map(r => r.skill));
  const progress = await loadProgress(db, studentId);
  return checkSkills(q.ratings, q.hardest, isLiveDrill)
    .filter(id => !done.has(id) && stateRank(progress.get(id)?.state ?? 'not_started') <= stateRank('learning'));
}

// After a check set (finalizeSet): its score re-places the skill as the
// diagnostic would (below 50% Recognize tier 1, 50–79% Repair, 80%+ Construct
// test-out), if the skill is still Learning.
export async function applyPlacementCheck(tx: Tx, set: typeof drillSets.$inferSelect, skillScores: Record<string, { score: number; count: number }>): Promise<PendingEvent[]> {
  const skill = set.focusSkill;
  const s = skill ? skillScores[skill] : undefined;
  if (!skill || !s) return [];
  const placed = { [skill]: { place: placeFor(skill, s.score, isLiveDrill) } };
  const { before, after, transitions } = await applyPlacements(tx, set.studentId, placed, 'placement check', { practiced: true });
  return saveProgress(tx, set.studentId, before, after, transitions, { type: 'set', id: set.id });
}

export const areaLabel = (area: QuestionnaireArea) => QUESTIONNAIRE_AREAS[area].label;
export const skillName = (id: string) => getSkill(id).name;
