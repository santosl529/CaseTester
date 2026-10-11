// End-to-end check of the D2 drills against the real database and the real
// grader, using live items plus the draft placeholders (DRILLS_PREVIEW_DRAFTS). Runs one
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
import { parseFramework } from '@/lib/drills/content-import';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { enqueueGrading, runGradingJob } from '@/lib/drills/grading/jobs';
import type { CallModel } from '@/lib/drills/grading/grader';
import { completeSet, DrillError, fetchItem, setResults, startSet, submitAttempt, type StepReply } from '@/lib/drills/sets/service';
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
  'SY-2': [{ type: 'text', value: 'Open weekday mornings for school groups, starting with a pilot. Each park would host about 120 groups a year at $600, $72k against $40k of extra costs, and the parks are closed then anyway. The main risk is that schools pay museums only $450, so the next step is a 5-park pilot tracking bookings against the roughly 70 groups needed to break even.' }],
  'CL-3': [{ type: 'text', value: "I'd split margin into price, mix, COGS and operating expenses. I'd start with COGS as a share of revenue by year for the last 3 years, since it is the biggest cost line, then check average price by product line and SG&A by year." }],
  'QN-5': [
    { type: 'choices', option_ids: ['1', '2', '3', '4'] },
    { type: 'numbers', values: { 1: '130M', 2: '40%', 3: '4', 4: '60' } },
    { type: 'numeric', value: '12.48B' },
    { type: 'choice', option_id: 'reasonable' },
  ],
};

// The model framework of the live PS-3 question with this prompt.
const ps3Items = loadAuthoredItems().filter(i => i.drill_id === 'PS-3');
function modelFramework(prompt: string): StepResponse {
  return parseFramework(ps3Items.find(i => i.prompt === prompt)?.model_answer ?? '');
}

// Answers every item in the set (a live drill plans a full set; a draft-only
// drill may have a single placeholder) and returns the last reply.
async function answerSet(setId: string, drillId: string, key = 'k') {
  let last;
  for (let position = 0; ; position++) {
    let fetched;
    try {
      fetched = await fetchItem(student, setId, position);
    } catch (e) {
      if (position > 0 && e instanceof DrillError) break;
      throw e;
    }
    const leaked = KEY_FIELDS.filter(k => keysDeep(fetched.item).has(k));
    check(leaked.length === 0, `${drillId}: item response leaks ${leaked.join(', ')}`);
    // PS-3 is live with real questions: answer each with its own model
    // framework, so the run checks grading rather than an off-topic answer.
    const answers = drillId === 'PS-3' ? [modelFramework(fetched.item.prompt)] : ANSWERS[drillId];
    for (const [i, response] of answers.entries()) {
      last = await submitAttempt(student, setId, { position, idempotency_key: `${key}-${drillId}-${position}-${i}`, step: i, response, skip: false, timed_out: false });
      if (i < answers.length - 1) {
        check(last.done === false, `${drillId}: step ${i} finished the item early`);
        if (drillId === 'HY-2' && i === 0) check(Boolean((last as StepReply).step.reveal), 'HY-2: stage 1 did not reveal the new fact');
      }
    }
  }
  return last;
}

async function main() {
  try {
    for (const drillId of ['PS-3', 'HY-2', 'SY-2', 'CL-3', 'QN-5']) {
      const { set_id } = await startSet(student, { drill_id: drillId });
      const final = await answerSet(set_id, drillId);
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
    await answerSet(set_id, 'SY-2', 'retry');
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
