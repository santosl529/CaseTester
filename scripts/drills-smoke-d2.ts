// End-to-end check of the D2 drills against the real database and the real
// grader, using the draft placeholder items (DRILLS_PREVIEW_DRAFTS). Runs one
// set of each D2 drill as a throwaway student, checks no key leaks before
// submission, that written answers are graded after the set and shown with
// evidence, that QN-5 is scored by code, and that a failed grading run leaves
// the set "delayed" and a later run finishes it. Deletes everything it wrote.
//
//   npm run drills:smoke:d2      (makes a few Haiku calls, about $0.02)
import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { analyticsEvents, drillAttempts, drillSets, drillTiers, gradingJobs, studentDrillSettings } from '@/db/schema';
import { enqueueGrading, runGradingJob } from '@/lib/drills/grading/jobs';
import type { CallModel } from '@/lib/drills/grading/grader';
import { completeSet, fetchItem, setResults, startSet, submitAttempt, type StepReply } from '@/lib/drills/sets/service';
import type { StepResponse } from '@/lib/drills/sets/scoring';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const KEY_FIELDS = ['correct', 'tag', 'feedback', 'numeric', 'checks', 'red_flags', 'model_answer', 'explanation', 'extras', 'authorship', 'families', 'new_fact', 'ranges'];
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach(x => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
};

const ANSWERS: Record<string, StepResponse[]> = {
  'PS-3': [{ type: 'buckets', buckets: [
    { title: 'Customer demand', points: ['How many members and non-members want at-home workouts', 'Willingness to pay per month'] },
    { title: 'Economics', points: ['Content and app costs against subscription revenue', 'Subscribers needed to break even'] },
    { title: 'Competition', points: ['Existing fitness apps and their prices'] },
    { title: 'Effect on the gyms', points: ['Members who might cancel memberships for the cheaper plan'] },
  ] }],
  'HY-2': [
    { type: 'text', value: 'Revenue per customer likely fell because customers are buying less per visit. I would check units and spend per customer by segment.' },
    { type: 'choice', option_id: 'keep' },
    { type: 'text', value: 'Units per customer fell 20% at flat prices, which supports it.' },
  ],
  'SY-2': [{ type: 'text', value: 'Add pharmacy counters, starting with a pilot. Each counter costs $400k and earns about $150k a year, paying back in under 3 years against our 4-year hurdle, and 60% of our shoppers fill prescriptions elsewhere. The main risk is that the national pharmacy chain near most of our stores keeps those customers, so the next step is a 10-store pilot that tracks prescriptions filled each week.' }],
  'CL-3': [{ type: 'text', value: "I'd split margin into price, mix, COGS and operating expenses. I'd start with COGS as a share of revenue by year for the last 3 years, since it is the biggest cost line, then check average price by product line and SG&A by year." }],
  'QN-5': [
    { type: 'choices', option_ids: ['1', '2', '3', '4'] },
    { type: 'numbers', values: { 1: '130M', 2: '40%', 3: '4', 4: '60' } },
    { type: 'numeric', value: '12.48B' },
    { type: 'choice', option_id: 'reasonable' },
  ],
};

async function answerItem(setId: string, drillId: string, key = 'k') {
  const fetched = await fetchItem(student, setId, 0);
  const leaked = KEY_FIELDS.filter(k => keysDeep(fetched.item).has(k));
  check(leaked.length === 0, `${drillId}: item response leaks ${leaked.join(', ')}`);
  const answers = ANSWERS[drillId];
  let last;
  for (const [i, response] of answers.entries()) {
    last = await submitAttempt(student, setId, { position: 0, idempotency_key: `${key}-${drillId}-${i}`, step: i, response, skip: false, timed_out: false });
    if (i < answers.length - 1) {
      check(last.done === false, `${drillId}: step ${i} finished the item early`);
      if (drillId === 'HY-2' && i === 0) check(Boolean((last as StepReply).step.reveal), 'HY-2: stage 1 did not reveal the new fact');
    }
  }
  return last;
}

async function main() {
  try {
    for (const drillId of ['PS-3', 'HY-2', 'SY-2', 'CL-3', 'QN-5']) {
      const { set_id } = await startSet(student, { drill_id: drillId });
      const final = await answerItem(set_id, drillId);
      const aiGraded = drillId !== 'QN-5';
      check(final?.done === true && Boolean(final.pending) === aiGraded, `${drillId}: final reply pending=${final && 'pending' in final ? final.pending : '?'}`);
      const done = await completeSet(student, set_id);
      // Outside a request the grading job runs inline, so the set is graded now.
      const results = await setResults(student, set_id);
      if (results.status !== 'completed') { failures.push(`${drillId}: set still ${results.status} after ${done.status}`); continue; }
      const fb = results.items[0].feedback;
      if (aiGraded) {
        check(Boolean(fb.grading), `${drillId}: no graded checks on results`);
        const evidenced = fb.grading?.checks.filter(c => c.pass && c.evidence).length ?? 0;
        check(evidenced > 0, `${drillId}: no passing check carries quoted evidence`);
      }
      const missed = fb.grading?.checks.filter(c => !c.pass).map(c => c.check_id) ?? [];
      console.log(`${drillId}: ${Math.round(results.score * 100)}%${missed.length ? ` (missed: ${missed.join(', ')})` : ''}${fb.grading ? `, ${fb.grading.checks.filter(c => c.pass).length}/${fb.grading.checks.length} checks passed` : ''}${fb.grading?.decision ? `, decision ${fb.grading.decision.right ? 'right' : 'wrong'}` : ''}`);
      if (drillId === 'QN-5') check(results.score === 1, `QN-5: right answer scored ${results.score}`);
    }

    // A failed grading run: the set waits, "delayed"; a later run finishes it.
    const { set_id } = await startSet(student, { drill_id: 'SY-2' });
    await answerItem(set_id, 'SY-2', 'retry');
    const jobId = await enqueueGrading(set_id);
    const broken: CallModel = async () => { throw new Error('simulated outage'); };
    check(await runGradingJob(jobId, broken) === 'failed', 'failed run not reported as failed');
    const waiting = await setResults(student, set_id);
    check(waiting.status === 'grading' && waiting.delayed, 'set not shown as grading delayed after a failed run');
    check(await runGradingJob(jobId) === 'succeeded', 'retry run did not succeed');
    check((await setResults(student, set_id)).status === 'completed', 'set not completed after the retry');
    console.log('failure path: delayed, then graded on retry');
  } finally {
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    await db.delete(drillTiers).where(eq(drillTiers.studentId, student));
    await db.delete(studentDrillSettings).where(eq(studentDrillSettings.studentId, student));
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
