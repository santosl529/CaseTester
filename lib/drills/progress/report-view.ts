// What a case report shows from drills (Matt, 15 Nov; proposal §3): the
// comparison with the last case at the same level and "Your next steps". Only
// when CASE_TO_DRILLS is on: in shadow mode and off, students see nothing new.
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResultRuns, caseResults } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';
import { caseToDrillsMode } from '../case-to-drills';
import { nextStepsStatus, pendingNextSteps, totalMinutes, type NextStepsSnapshot } from '../next-steps';
import { HOME_DEMO_CASE_IDS } from '@/lib/cases/listed';
import type { Comparison } from '../case-compare';
import { nextCaseFor } from '../program/store';
import { comparisonFor } from './case-compare-store';
import { passedSince } from './next-steps-store';
import { logDrillEvent } from '../events';

const DIFFICULTY_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

export type Strength = { label: string; text: string; quote: string | null };
export type NextStepsView =
  | { state: 'preparing' }
  | { state: 'failed' }
  | {
    state: 'ready'; caseAttemptId: string; snapshot: NextStepsSnapshot; done: string[]; ready: boolean; minutes: number;
    nextCase: { title: string; difficulty: string } | 'all_taken' | null; strengths: Strength[];
  };
export type ReportDrillsView = { comparison: (Comparison & { previousTitle: string }) | null; nextSteps: NextStepsView | null };

// 1–2 strengths: the first "went well" point of the best-rated dimensions, Strong before Adequate.
export function strengthsOf(rubric: RubricScores): Strength[] {
  const order = { strong: 0, meets_bar: 1, needs_work: 2 } as const;
  return RUBRIC_DIMENSION_KEYS.filter(k => rubric[k] && !rubric[k].notAssessed && rubric[k].rating !== 'needs_work' && rubric[k].wentWell.length > 0)
    .sort((a, b) => order[rubric[a].rating] - order[rubric[b].rating])
    .slice(0, 2)
    .map(k => {
      const it = rubric[k].wentWell[0];
      return { label: RUBRIC_DIMENSION_LABELS[k], text: it.plain?.what ?? it.point, quote: it.quotes[0] ?? null };
    });
}

// `scoredAt`: when the report's score was stored. The 7-minute demo makes no case result (D10): nothing.
export async function reportDrillsView(studentId: string, sessionId: string, rubric: RubricScores | null, ctx: { caseId: string; scoredAt: Date | null }, now = new Date()): Promise<ReportDrillsView | null> {
  if (caseToDrillsMode() !== 'on' || HOME_DEMO_CASE_IDS.includes(ctx.caseId)) return null;
  const found = await comparisonFor(studentId, sessionId);
  let previousTitle = '';
  if (found) { try { previousTitle = getCaseById(found.previous.caseId).title; } catch { previousTitle = 'your last case'; } }
  const comparison = found ? { ...found, previousTitle } : null;

  const [result] = await db.select({ nextSteps: caseResults.nextSteps, completedAt: caseResults.completedAt }).from(caseResults).where(eq(caseResults.caseAttemptId, sessionId));
  const snapshot = result?.nextSteps as NextStepsSnapshot | null | undefined;
  if (!snapshot) {
    const [run] = await db.select({ mode: caseResultRuns.mode, status: caseResultRuns.status }).from(caseResultRuns).where(eq(caseResultRuns.sessionId, sessionId));
    const pending = pendingNextSteps({ demo: false, run: run ?? null, scoredAt: ctx.scoredAt, now });
    return { comparison, nextSteps: pending ? { state: pending } : null };
  }
  const since = result!.completedAt;
  const passed = await passedSince(studentId, snapshot.skills.map(s => s.skill_id), since);
  const { done, ready } = nextStepsStatus(snapshot, passed);
  const pick = await nextCaseFor(studentId);
  let nextCase: { title: string; difficulty: string } | 'all_taken' | null = null;
  if (pick?.case_id) {
    try { nextCase = { title: pick.title!, difficulty: DIFFICULTY_NAME[getCaseById(pick.case_id).difficulty] }; } catch { nextCase = null; }
  } else if (pick?.retake) nextCase = 'all_taken';
  await logDrillEvent(studentId, 'next_steps_shown', {
    case_attempt_id: sessionId, skill_ids: snapshot.skills.map(s => s.skill_id), no_drill_skill_id: snapshot.also?.skill_id ?? null,
    all_clear: snapshot.all_clear, retake: snapshot.retake, partial: snapshot.partial,
  });
  return {
    comparison,
    nextSteps: {
      state: 'ready', caseAttemptId: sessionId, snapshot, done: [...done], ready, minutes: totalMinutes(snapshot), nextCase,
      strengths: rubric ? strengthsOf(rubric) : [],
    },
  };
}
