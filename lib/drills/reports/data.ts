// Loads the rows the pilot reports read (compute.ts) for one club, or for
// every student. History is loaded in full (funnels and before/after
// comparisons need it); `from`/`to` bound the reports that cover a period.
// Pilot scale (tens of students) fits in memory; revisit for wider launch.
import 'server-only';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, caseResults, diagnostics, drillAttempts, drillItems, drillSets, gradingJobs, lessonViews, lessons as lessonsTable,
  prescriptions, skillStateEvents, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { DRILL_EVENT_PROPS } from '../event-props';
import { itemKey, type Rating, type ReportData, type SkillState, type Track } from './compute';

export interface ReportFilter {
  // A club's org id; null or undefined for every student.
  orgId?: string | null;
  from: Date;
  to: Date;
}

// Students the smoke tests and the accessibility audit create (and delete);
// left out unless their org is asked for by name.
const TEST_ORGS = ['smoke-test', 'a11y-test'];

export async function loadReportData(filter: ReportFilter): Promise<ReportData> {
  const profiles = await db.select({ id: studentProfiles.userId, orgId: studentProfiles.orgId }).from(studentProfiles)
    .where(filter.orgId ? eq(studentProfiles.orgId, filter.orgId) : undefined);
  const students = filter.orgId ? profiles : profiles.filter(p => !TEST_ORGS.includes(p.orgId ?? ''));
  const ids = students.map(s => s.id);
  const empty: ReportData = {
    from: filter.from, to: filter.to, students, programs: [], sets: [], attempts: [], jobs: [], skillEvents: [], prescriptions: [], cases: [],
    lessonViews: [], workouts: [], diagnosticsCompleted: [], events: [], items: new Map(),
  };
  if (ids.length === 0) return empty;
  const of = <T extends { studentId: unknown }>(t: T) => inArray(t.studentId as never, ids);

  const [programs, sets, attempts, skillEvents, rx, cases, views, lessonRows, workoutRows, diags, events] = await Promise.all([
    db.select().from(studentPrograms).where(of(studentPrograms)),
    db.select().from(drillSets).where(of(drillSets)),
    db.select({
      setId: drillAttempts.setId, studentId: drillAttempts.studentId, itemId: drillAttempts.itemId, itemVersion: drillAttempts.itemVersion,
      response: drillAttempts.response, score: drillAttempts.score, timeMs: drillAttempts.timeMs, skipped: drillAttempts.skipped,
      defendScore: drillAttempts.defendScore, checkResults: drillAttempts.checkResults, modelId: drillAttempts.modelId,
      gradingStatus: drillAttempts.gradingStatus, submittedAt: drillAttempts.submittedAt,
    }).from(drillAttempts).where(of(drillAttempts)),
    db.select().from(skillStateEvents).where(of(skillStateEvents)),
    db.select().from(prescriptions).where(of(prescriptions)),
    db.select().from(caseResults).where(of(caseResults)),
    db.select().from(lessonViews).where(of(lessonViews)),
    db.select({ lessonId: lessonsTable.lessonId, skillId: lessonsTable.skillId }).from(lessonsTable),
    db.select().from(workouts).where(of(workouts)),
    db.select({ studentId: diagnostics.studentId }).from(diagnostics).where(and(of(diagnostics), eq(diagnostics.status, 'completed'))),
    db.select().from(analyticsEvents).where(and(inArray(analyticsEvents.userId, ids), inArray(analyticsEvents.eventType, Object.keys(DRILL_EVENT_PROPS)))),
  ]);
  const setIds = sets.map(s => s.id);
  const jobs = setIds.length
    ? await db.select({ setId: gradingJobs.setId, status: gradingJobs.status, retries: gradingJobs.retries, costUsd: gradingJobs.costUsd, createdAt: gradingJobs.createdAt })
      .from(gradingJobs).where(inArray(gradingJobs.setId, setIds))
    : [];

  // Authored item versions with attempts: their options, tier and Defend type.
  const itemIds = [...new Set(attempts.flatMap(a => (a.itemId ? [a.itemId] : [])))];
  const itemRows = itemIds.length
    ? await db.select({ itemId: drillItems.itemId, version: drillItems.version, drillId: drillItems.drillId, tier: drillItems.tier, payload: drillItems.payload })
      .from(drillItems).where(inArray(drillItems.itemId, itemIds))
    : [];
  const items: ReportData['items'] = new Map(itemRows.map(r => {
    const p = r.payload as { options?: { id: string; correct?: boolean }[]; defend?: { type: string; valid?: boolean } };
    return [itemKey(r.itemId, r.version), {
      drillId: r.drillId, tier: r.tier, options: (p.options ?? []).map(o => ({ id: o.id, correct: Boolean(o.correct) })),
      defendType: p.defend?.type ?? null, challengeValid: p.defend?.valid ?? null,
    }];
  }));
  const lessonSkill = new Map(lessonRows.map(l => [l.lessonId, l.skillId]));

  return {
    ...empty,
    programs: programs.map(p => ({ studentId: p.studentId, track: p.track as Track, status: p.status, currentWeek: p.currentWeek, startedAt: p.startedAt })),
    sets: sets.map(s => ({
      id: s.id, studentId: s.studentId, drillId: s.drillId, tier: s.tier, size: s.size, source: s.source, isTransferCheck: s.isTransferCheck,
      workoutId: s.workoutId, slot: s.slot, prescriptionId: s.prescriptionId, focusSkill: s.focusSkill, status: s.status,
      setScore: s.setScore, passed: s.passed, startedAt: s.startedAt, completedAt: s.completedAt,
    })),
    attempts: attempts.map(a => {
      const first = (a.response as { steps?: { type: string; option_id?: string }[] } | null)?.steps?.[0];
      const decision = (a.checkResults as { defend_decision?: { right: boolean } | null } | null)?.defend_decision;
      return {
        setId: a.setId, studentId: a.studentId, itemId: a.itemId, itemVersion: a.itemVersion, optionId: first?.type === 'choice' ? first.option_id ?? null : null,
        score: a.score, timeMs: a.timeMs, skipped: a.skipped, defendScore: a.defendScore, defendRight: decision ? decision.right : null,
        graded: a.gradingStatus === 'graded' && a.modelId !== null, submittedAt: a.submittedAt,
      };
    }),
    jobs,
    skillEvents: skillEvents.map(e => ({ studentId: e.studentId, skillId: e.skillId, toState: e.toState as SkillState, createdAt: e.createdAt })),
    prescriptions: rx.map(p => ({ id: p.id, studentId: p.studentId, skillId: p.skillId, sourceType: p.sourceType, status: p.status, createdAt: p.createdAt, closedAt: p.closedAt })),
    cases: cases.map(c => ({
      studentId: c.studentId, completedAt: c.completedAt, rubric: c.rubricScores as Partial<Record<string, Rating>>,
      tags: (c.findings as { tag: string }[]).map(f => f.tag),
    })),
    lessonViews: views.map(v => ({ studentId: v.studentId, lessonId: v.lessonId, skillId: lessonSkill.get(v.lessonId) ?? null, skipped: v.skipped, viewedAt: v.viewedAt })),
    workouts: workoutRows.map(w => ({ id: w.id, studentId: w.studentId, date: w.date, targetMinutes: w.targetMinutes, blocks: w.blocks as ReportData['workouts'][number]['blocks'] })),
    diagnosticsCompleted: diags.map(d => d.studentId),
    events: events.map(e => ({ type: e.eventType, studentId: e.userId!, payload: (e.payloadJsonb ?? {}) as Record<string, unknown>, createdAt: e.createdAt })),
    items,
  };
}

// Raw drills events in the range, for event health.
export async function loadEventRows(filter: ReportFilter, studentIds: string[]) {
  if (studentIds.length === 0) return [];
  return db.select({ id: analyticsEvents.id, eventType: analyticsEvents.eventType, payload: analyticsEvents.payloadJsonb }).from(analyticsEvents)
    .where(and(inArray(analyticsEvents.userId, studentIds), gte(analyticsEvents.createdAt, filter.from), lt(analyticsEvents.createdAt, filter.to)));
}
