// The report's "Your next steps", stored once when a case result arrives
// (Matt, 15 Nov, D5: the list is fixed at grading; what's done stays live) and
// read by the report page. lib/drills/next-steps.ts holds the rules.
import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, drillSets, prescriptions, studentDrillSettings } from '@/db/schema';
import { getDrill, getMistakeTag } from '../config';
import { isLiveDrill } from '../live';
import type { CaseResultPayload } from '../case-result';
import { buildNextSteps, type NextStepsSnapshot } from '../next-steps';
import { hasLiveDrill, newProgress, nextSetFor } from './engine';
import { loadProgress, loadTiers, progressContext } from './store';
import { metTheBar } from '../program/next-case';
import { quickSetMinutes } from '../program/workout';
import { lessonForSkill } from '../program/lessons-store';
import { sharedRanking } from '../program/store';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export async function recordNextSteps(payload: CaseResultPayload, retake: boolean): Promise<NextStepsSnapshot> {
  const studentId = payload.student_id;
  const caseRx = await db.select({ id: prescriptions.id }).from(prescriptions).where(and(
    eq(prescriptions.studentId, studentId), eq(prescriptions.sourceType, 'case'), eq(prescriptions.sourceId, payload.case_attempt_id)));
  const ids = new Set(caseRx.map(r => r.id));
  // The shared ranking (Today, Learn and Progress read the same), narrowed to this case's prescriptions.
  const ranked = (await sharedRanking(studentId)).filter(rx => ids.has(rx.id))
    .map(rx => ({ id: rx.id, skill_id: rx.skill_id, priority: rx.priority, evidence: null }));

  // Lessons for the listed skills and any skill with a finding (the "Also from this case" row may link one).
  const lessons = new Map<string, { words: number }>();
  const lessonSkillIds = new Set([...ranked.map(r => r.skill_id), ...payload.findings.map(f => getMistakeTag(f.tag)!.skill)]);
  for (const id of lessonSkillIds) {
    const l = await lessonForSkill(id);
    if (l) lessons.set(id, { words: words([l.idea, l.why, l.pattern, l.worked_example].join(' ')) });
  }

  // The practice set each skill's Start practice would open: the engine's next set, as quick start picks it.
  const [progress, tiers, ctx, [settings]] = await Promise.all([
    loadProgress(db, studentId), loadTiers(db, studentId), progressContext(db, studentId),
    db.select({ m: studentDrillSettings.timeMultiplier }).from(studentDrillSettings).where(eq(studentDrillSettings.studentId, studentId)),
  ]);
  const practice = new Map<string, { drill_name: string; level: number; minutes: number }>();
  for (const r of ranked) {
    const next = nextSetFor(progress.get(r.skill_id) ?? newProgress(r.skill_id), tiers, ctx);
    if (next) practice.set(r.skill_id, { drill_name: getDrill(next.drill_id).name, level: next.tier, minutes: Math.max(1, Math.round(quickSetMinutes(next.drill_id, next.tier, next.kind, settings?.m ?? 1))) });
  }

  const snapshot = buildNextSteps({
    payload, retake, metTheBar: metTheBar(payload.rubric_scores as Record<string, string>), ranked, lessons, practice,
    hasLiveDrill: id => hasLiveDrill(id, isLiveDrill),
  });
  await db.update(caseResults).set({ nextSteps: snapshot }).where(eq(caseResults.caseAttemptId, payload.case_attempt_id));
  return snapshot;
}

// Skills with a passing drill set completed since the case (the report's live ticks: "done" only from drill results).
export async function passedSince(studentId: string, skillIds: string[], since: Date): Promise<Set<string>> {
  if (skillIds.length === 0) return new Set();
  const sets = await db.select({ drillId: drillSets.drillId, focus: drillSets.focusSkill }).from(drillSets).where(and(
    eq(drillSets.studentId, studentId), eq(drillSets.status, 'completed'), eq(drillSets.passed, true), gte(drillSets.completedAt, since)));
  const wanted = new Set(skillIds);
  const out = new Set<string>();
  for (const s of sets) for (const id of s.focus ? [s.focus] : getDrill(s.drillId).primary_skills) if (wanted.has(id)) out.add(id);
  return out;
}
