// Cost safeguards end to end against the real database, free: a stub grader,
// so nothing is sent to the API. Checks that a call's request count persists
// across runs and stops at the cap; that an answer at the cap, refused, over
// its word limits, or hit by a billing error shows "Grading delayed", counts
// toward nothing and can still be reported; that every request's spend is
// recorded and the job's cost is their sum; the daily and monthly caps and
// their messages; that a set completes after MAX_RUNS failed runs; and that
// a billing error opens the breaker for new written sets while auto-checked
// drills still start.
//
//   npm run drills:smoke:cost
//
// Run it alone: its billing check pauses new written sets everywhere for a
// few seconds (the breaker is global), which would fail a parallel smoke.
import './smoke-log';
import { checkSmokeEvents } from './smoke-events';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  analyticsEvents, drillAttempts, drillGradingCalls, drillGradingSpend, drillItemReports, drillSets, drillTiers, gradingJobs,
  prescriptions, skillStateEvents, skillStates, studentDrillSettings, studentProfiles,
} from '@/db/schema';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { enqueueGrading, kickGrading, runGradingJob, ungradedAnswers } from '@/lib/drills/grading/jobs';
import type { CallModel } from '@/lib/drills/grading/grader';
import { gradingBreaker } from '@/lib/drills/grading/spend';
import { monthStart } from '@/lib/drills/grading/limits';
import { reportProblem } from '@/lib/drills/feedback';
import { DrillError, fetchItem, setResults, startSet, submitAttempt } from '@/lib/drills/sets/service';
import type { StepResult } from '@/lib/drills/sets/scoring';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const student = randomUUID();
const TZ = 'America/Los_Angeles';
const CAP = DRILLS_CONFIG.rules.grading_limits.requests_per_call;
const usage = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

// A complete grade for the item in the prompt, every check failed; refuses
// answers marked REFUSE-ME.
const stub: CallModel = async (_system, user) => {
  if (user.includes('REFUSE-ME')) return { output: null, usage, refused: true };
  return {
    usage,
    output: {
      items: [{
        item_key: 'answer',
        checks: [...user.matchAll(/check_id "([^"]+)"/g)].map(m => ({ check_id: m[1], pass: false, evidence: '' })),
        red_flags: [...user.matchAll(/- id "([^"]+)"/g)].map(m => ({ id: m[1], present: false, evidence: '' })),
        hypothesis_family: null, backup_family: null, injection_suspected: false,
      }],
    },
  };
};

// A CL-3 set, every item answered (marked REFUSE-ME where asked), queued for
// grading as completeSet would, but not run.
async function answeredSet(refuse: (position: number) => boolean = () => false) {
  const { set_id } = await startSet(student, { drill_id: 'CL-3' });
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
  for (let p = 0; p < set.size; p++) {
    await fetchItem(student, set_id, p);
    const value = `I'd start with COGS as a share of revenue by year for the last 3 years, then price by product line. Answer ${p + 1}.${refuse(p) ? ' REFUSE-ME' : ''}`;
    await submitAttempt(student, set_id, { position: p, idempotency_key: `cost-${set_id}-${p}`, step: 0, response: { type: 'text', value }, skip: false, timed_out: false });
  }
  const attempts = await db.select().from(drillAttempts).where(eq(drillAttempts.setId, set_id)).orderBy(drillAttempts.position);
  return { setId: set_id, size: set.size, attempts, jobId: await enqueueGrading(set_id) };
}

const spendOf = (setId: string) => db.select().from(drillGradingSpend).where(eq(drillGradingSpend.setId, setId));
const attemptsOf = (setId: string) => db.select().from(drillAttempts).where(eq(drillAttempts.setId, setId)).orderBy(drillAttempts.position);

async function startError(drillId: string): Promise<DrillError | null> {
  try {
    const { set_id } = await startSet(student, { drill_id: drillId });
    // An auto-checked probe set: drop it so the next set can start.
    await db.delete(drillSets).where(eq(drillSets.id, set_id));
    return null;
  } catch (e) {
    if (e instanceof DrillError) return e;
    throw e;
  }
}

async function main() {
  await db.insert(studentProfiles).values({ userId: student, orgId: 'smoke-test', timezone: TZ });
  try {
    // 1. One run, four outcomes: a call already at its cap (an earlier run used
    // its requests), a refusal, an answer over its limits, and graded answers.
    const a = await answeredSet(p => p === 1);
    check(a.size >= 4, `CL-3 set has ${a.size} items; the smoke needs 4`);
    await db.insert(drillGradingCalls).values({ attemptId: a.attempts[0].id, call: 'main', requests: CAP });
    const long = Array.from({ length: 80 }, () => 'word').join(' ');
    const steps = a.attempts[2].stepScores as StepResult[];
    await db.update(drillAttempts).set({ stepScores: [{ ...steps[0], response: { type: 'text', value: long } }] }).where(eq(drillAttempts.id, a.attempts[2].id));
    check(await runGradingJob(a.jobId, stub) === 'succeeded', 'run with ungraded answers did not succeed');
    const after = await attemptsOf(a.setId);
    const spend = await spendOf(a.setId);
    const issues = after.map(x => `${x.gradingStatus}/${x.gradingIssue ?? '-'}`);
    check(issues[0] === 'failed/request_cap' && issues[1] === 'failed/refused' && issues[2] === 'failed/over_word_limit'
      && issues.slice(3).every(i => i === 'graded/-'), `outcomes: ${issues.join(', ')}`);
    const rows = (pos: number) => spend.filter(s => s.attemptId === after[pos].id);
    check(rows(0).length === 0 && rows(2).length === 0, 'requests were sent past the cap or over the word limit');
    check(rows(1).length === 1 && rows(1)[0].outcome === 'refused', `refusal: ${rows(1).map(r => r.outcome)}`);
    check(after.slice(3).every((x, i) => rows(i + 3).length === 1 && rows(i + 3)[0].outcome === 'ok'), 'graded answers: one ok request each');
    const [calls0] = await db.select().from(drillGradingCalls).where(and(eq(drillGradingCalls.attemptId, after[0].id), eq(drillGradingCalls.call, 'main')));
    check(calls0?.requests === CAP, `capped call's count moved: ${calls0?.requests}`);
    const [job] = await db.select().from(gradingJobs).where(eq(gradingJobs.id, a.jobId));
    const total = spend.reduce((n, s) => n + s.costUsd, 0);
    check(total > 0 && Math.abs((job.costUsd ?? 0) - total) < 1e-9, `job cost ${job.costUsd} vs recorded ${total}`);
    const results = await setResults(student, a.setId);
    if (results.status !== 'completed') failures.push(`set still ${results.status}`);
    else {
      check(results.ungraded === 3, `results: ${results.ungraded} ungraded`);
      check(results.items.slice(0, 3).every(i => i.feedback.ungraded) && results.items.slice(3).every(i => !i.feedback.ungraded), 'items: Grading delayed on the wrong ones');
      // Graded answers alone make the score.
      const graded = after.slice(3).map(x => x.score ?? 0);
      check(Math.abs((results.score ?? -1) - graded.reduce((n, s) => n + s, 0) / graded.length) < 1e-6, `score ${results.score} isn't the graded answers' average`);
    }
    await reportProblem(student, a.setId, { position: 0, reason: 'grade_unfair', comment: 'It said grading delayed.', screen: 'results' });
    const [report] = await db.select().from(drillItemReports).where(eq(drillItemReports.studentId, student));
    check(report?.position === 0, 'Report a problem on an ungraded answer was not saved');
    const listed = (await ungradedAnswers(500)).filter(u => u.attempt.setId === a.setId);
    check(listed.length === 3 && listed[0].attempt.gradingIssue === 'refused', `review list: ${listed.map(u => u.attempt.gradingIssue)}`);
    console.log(`one run: cap held across runs, refusal flagged, backstop held, ${a.size - 3} graded; $${total.toFixed(4)} recorded`);

    // 2. A set with nothing graded counts toward nothing.
    const tierBefore = await db.select().from(drillTiers).where(eq(drillTiers.studentId, student));
    const b = await answeredSet(() => true);
    await runGradingJob(b.jobId, stub);
    const [bSet] = await db.select().from(drillSets).where(eq(drillSets.id, b.setId));
    check(bSet.status === 'completed' && bSet.setScore === null && bSet.passed === null, `all-ungraded set: ${bSet.status}, score ${bSet.setScore}`);
    const bEvents = await db.select().from(skillStateEvents).where(and(eq(skillStateEvents.studentId, student), eq(skillStateEvents.sourceId, b.setId)));
    check(bEvents.length === 0, `all-ungraded set changed ${bEvents.length} skill states`);
    const tierAfter = await db.select().from(drillTiers).where(eq(drillTiers.studentId, student));
    check(JSON.stringify(tierAfter.map(t => [t.drillId, t.currentTier])) === JSON.stringify(tierBefore.map(t => [t.drillId, t.currentTier])), 'all-ungraded set moved a tier');
    const bResults = await setResults(student, b.setId);
    check(bResults.status === 'completed' && bResults.score === null && bResults.tier.after === bResults.tier.before, 'results of an all-ungraded set');
    console.log('nothing graded: no score, tier or skill change');

    // 3. A call that keeps failing stops at the cap.
    const c = await answeredSet();
    let sent = 0;
    const broken: CallModel = async () => { sent++; throw new Error('simulated outage'); };
    check(await runGradingJob(c.jobId, broken) === 'succeeded', 'failing calls: the run should still finish the set');
    check(sent === c.size * CAP, `failing calls: ${sent} requests for ${c.size} answers`);
    check((await attemptsOf(c.setId)).every(x => x.gradingIssue === 'request_cap'), 'failing calls: answers not at the cap');
    check((await spendOf(c.setId)).every(s => s.outcome === 'error'), 'failing calls: requests not recorded as errors');
    console.log(`failing calls: ${sent} requests, then Grading delayed`);

    // 4. After MAX_RUNS failed runs the set completes.
    const e = await answeredSet();
    await db.update(gradingJobs).set({ status: 'failed', retries: 6, startedAt: new Date(Date.now() - 60_000) }).where(eq(gradingJobs.id, e.jobId));
    await db.update(drillAttempts).set({ gradingStatus: 'delayed' }).where(eq(drillAttempts.setId, e.setId));
    await kickGrading(e.setId, stub);
    const [eSet] = await db.select().from(drillSets).where(eq(drillSets.id, e.setId));
    check(eSet.status === 'completed' && (await attemptsOf(e.setId)).every(x => x.gradingIssue === 'failed_runs'), `gave up: set ${eSet.status}`);
    console.log('after the last failed run: set completed, answers Grading delayed');

    // 5. The caps, with their messages. Copies of a set fill the day (and the month).
    const [template] = await db.select().from(drillSets).where(eq(drillSets.id, a.setId));
    const ref = (template.itemPlan as unknown[])[0];
    const fill = async (n: number, startedAt: Date) => {
      const id = randomUUID();
      await db.insert(drillSets).values({ ...template, id, status: 'completed', itemPlan: Array(n).fill(ref), size: n, startedAt, completedAt: startedAt, workoutId: null });
      return id;
    };
    const used = [a, b, c, e].reduce((n, s) => n + s.size, 0);
    const day = await fill(DRILLS_CONFIG.rules.grading_limits.ai_answers_per_day - used, new Date());
    const dayErr = await startError('CL-3');
    check(dayErr?.code === 'daily_limit' && /Auto-checked drills are still open, and written drills reopen tomorrow\./.test(dayErr.message), `daily cap: ${dayErr?.code} ${dayErr?.message}`);
    check(await startError('PS-1') === null, 'an auto-checked drill should start at the daily cap');
    await db.delete(drillSets).where(eq(drillSets.id, day));
    const first = monthStart(new Date(), TZ);
    if (Date.now() - first.getTime() > 2 * 86_400_000) {
      const month = await fill(DRILLS_CONFIG.rules.grading_limits.ai_answers_per_month, new Date(first.getTime() + 3_600_000));
      const monthErr = await startError('CL-3');
      check(monthErr?.code === 'monthly_limit' && /Auto-checked drills are still open/.test(monthErr.message) && / on [A-Z][a-z]+ 1\./.test(monthErr.message), `monthly cap: ${monthErr?.message}`);
      await db.delete(drillSets).where(eq(drillSets.id, month));
    }
    console.log(`caps: "${dayErr?.message}"`);

    // 6. A billing error: no retry, Grading delayed, and the breaker opens for
    // new written sets (globally) until the spend rows go.
    const f = await answeredSet();
    let billed = 0;
    const billing: CallModel = async () => { billed++; throw Object.assign(new Error('Your credit balance is too low to access the Anthropic API.'), { status: 400 }); };
    try {
      await runGradingJob(f.jobId, billing);
      check(billed >= 1 && billed <= f.size, `billing: ${billed} requests for ${f.size} answers`);
      check((await attemptsOf(f.setId)).every(x => x.gradingIssue === 'billing'), 'billing: answers not marked');
      const breaker = await gradingBreaker();
      check(breaker.open && breaker.reason === 'billing', 'billing: the breaker did not open');
      const paused = await startError('CL-3');
      check(paused?.code === 'grading_paused' && /Written-answer drills are paused for today\. Auto-checked drills are still open/.test(paused.message), `breaker message: ${paused?.message}`);
      check(await startError('PS-1') === null, 'an auto-checked drill should start with the breaker open');
      console.log(`breaker: "${paused?.message}"`);
    } finally {
      await db.delete(drillGradingSpend).where(eq(drillGradingSpend.setId, f.setId));
    }
  } finally {
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(x => x.id);
    await db.delete(drillItemReports).where(eq(drillItemReports.studentId, student));
    if (ids.length) {
      // Spend and call counts go with their sets and attempts (on delete cascade).
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    for (const t of [drillTiers, prescriptions, skillStateEvents, skillStates, studentDrillSettings]) await db.delete(t).where(eq(t.studentId, student));
    await db.delete(studentProfiles).where(eq(studentProfiles.userId, student));
    await new Promise(r => setTimeout(r, 1500));
    await checkSmokeEvents([student], failures);
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
    console.log(`cleaned up test student ${student}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nall checks passed');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
