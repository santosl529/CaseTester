// The student's last case ending too early is checked on the page (lib/site/past-sessions.ts lastCaseEndedEarly):
// drills code doesn't import the interview's clock.
// "How do you want to find your starting point?" (Matt, 22 Nov 2026): three equal options on Today before a student
// has a plan source — quick questions, the quick quiz, a case interview (Brew & Bean). The case option shows only
// while case results reach drills (CASE_TO_DRILLS=on); the case counts against the case limits (2 a day, 8 a month),
// not the drills budget. Text approved by Matt (22 Nov).
import 'server-only';
import { db } from '@/db/client';
import { caseResultsWired } from '../case-to-drills';
import { STARTING_POINT_CASE_ID } from './starting-point';
import { caseMinutes, nextCaseHref } from '@/lib/cases/listed';
import { decideSessionStart, sessionLimitsFromEnv, sessionStartDeps } from '@/lib/session-limits';
import { limitMessage } from '@/lib/site/limit-message';
import { caseCardLines } from './start-choice-text';

export interface StartChoice {
  // null: case results don't reach drills, so no case option.
  case: { href: string; minutes: number; uses: string | null; blocked: string | null } | null;
}

export async function startChoice(studentId: string, now = new Date()): Promise<StartChoice> {
  if (!caseResultsWired()) return { case: null };

  const limits = sessionLimitsFromEnv();
  let decision: ReturnType<typeof decideSessionStart> = { ok: true };
  if (!limits.exempt.has(studentId)) decision = decideSessionStart(await sessionStartDeps.usage(db, studentId, now, limits.exempt), limits, now);
  const lines = caseCardLines(limits.perDay, decision.ok ? null : decision.reason);
  return {
    case: {
      href: nextCaseHref(STARTING_POINT_CASE_ID),
      minutes: caseMinutes(STARTING_POINT_CASE_ID) ?? 20,
      uses: limits.exempt.has(studentId) ? null : lines.uses,
      blocked: decision.ok ? null : lines.blocked ?? limitMessage({ reason: decision.reason, limit: decision.limit, retryAt: decision.retryAt.toISOString() }),
    },
  };
}
