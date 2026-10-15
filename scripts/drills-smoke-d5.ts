// End-to-end check of D5 against the real database and the real grader, with
// the draft Repair items and Defend follow-ups (DRILLS_PREVIEW_DRAFTS). As a
// throwaway student it runs:
//   - a set of each Repair drill (PS-4, HY-3, SY-3) at tier 1: the editor
//     starts from the flawed answer, the hint names the flaw, nothing in the
//     key reaches the client, a model repair scores well, and an answer left
//     unchanged scores 0 with the planted flaw's tag and no AI call;
//   - the 14-day rule: after a PS-1 set, PS-4 skips items derived from the
//     PS-1 items just seen;
//   - a tier 2 set of each Construct drill with Defend (PS-3, HY-2, SY-2,
//     CL-3): the follow-up stays hidden until the main answer is in, then
//     arrives with its own clock; replies are graded in their own call and
//     shown with checks and the model reply; a skipped follow-up keeps the
//     main answer and logs M.skipped; the Defend columns are filled in.
// Deletes everything it wrote.
//
//   npm run drills:smoke:d5      (makes Haiku calls, about $0.05)
import './smoke-log';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { analyticsEvents, drillAttempts, drillItems, drillSets, drillTiers, gradingJobs, prescriptions, skillStateEvents, skillStates, studentDrillSettings } from '@/db/schema';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { modelAnswerSteps } from '@/lib/drills/model-answers';
import { withDefend } from '@/lib/drills/defend';
import type { Item } from '@/lib/drills/item-schema';
import type { ItemRef } from '@/lib/drills/sets/plan';
import type { StepResponse } from '@/lib/drills/sets/scoring';
import { completeSet, fetchItem, setResults, setView, startSet, submitAttempt, type ItemFeedback, type StepReply } from '@/lib/drills/sets/service';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const KEY_FIELDS = ['correct', 'tag', 'checks', 'red_flags', 'model_answer', 'explanation', 'extras', 'authorship', 'flaws', 'right_parts', 'derived_from', 'model_reply', 'valid', 'reason'];
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach(x => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
};
const items = loadAuthoredItems();
const byId = new Map(items.map(i => [i.item_id, i]));

async function finish(setId: string, label: string) {
  await completeSet(student, setId);
  const results = await setResults(student, setId);
  if (results.status !== 'completed') { failures.push(`${label}: set still ${results.status}`); return null; }
  return results;
}

// ------------------------------------------------------------------ Repair

async function repairSet(drillId: string) {
  const { set_id } = await startSet(student, { drill_id: drillId, tier: 1 });
  const view = await setView(student, set_id);
  check(Boolean(view.repair_hint?.includes("you'll be told")), `${drillId}: intro doesn't say the tier 1 hint names the flaw`);
  let unchangedAt = -1;
  for (let position = 0; position < view.size; position++) {
    const fetched = await fetchItem(student, set_id, position);
    const leaked = KEY_FIELDS.filter(k => keysDeep(fetched.item).has(k));
    check(leaked.length === 0, `${drillId}: item response leaks ${leaked.join(', ')}`);
    const item = items.find(i => i.drill_id === drillId && i.prompt === fetched.item.prompt)!;
    const repair = fetched.item.repair;
    check(Boolean(repair), `${drillId}: no prefilled answer`);
    check(Boolean(repair?.hint.startsWith('The flaw')), `${drillId}: tier 1 hint doesn't name the flaw ("${repair?.hint}")`);
    // The first item is left as it was; the rest get the model repair.
    const response: StepResponse = position === 0 ? repair!.prefill : modelAnswerSteps(item)[0];
    if (position === 0) unchangedAt = position;
    await submitAttempt(student, set_id, { position, idempotency_key: `${drillId}-${position}`, step: 0, response, skip: false, timed_out: false });
  }
  const results = await finish(set_id, drillId);
  if (!results) return;
  const scores = results.items.map(i => i.feedback.score);
  const unchanged = results.items[unchangedAt].feedback;
  check(unchanged.score === 0 && Boolean(unchanged.grading?.unchanged), `${drillId}: unchanged answer not scored 0 by code`);
  const item = items.find(i => i.drill_id === drillId && i.prompt === results.items[unchangedAt].prompt)!;
  const flawTags = (item.extras.flaws as { tag: string }[]).map(f => f.tag);
  check(flawTags.every(t => unchanged.mistakes.some(m => m.tag === t)), `${drillId}: unchanged answer doesn't log the planted flaw`);
  const [row] = await db.select().from(drillAttempts).where(and(eq(drillAttempts.setId, set_id), eq(drillAttempts.position, unchangedAt)));
  check((row.checkResults as { checks: { by: string }[] }).checks.every(c => c.by === 'code'), `${drillId}: unchanged answer went to the grader`);
  const repaired = scores.slice(1);
  check(repaired.every(s => s >= 0.7), `${drillId}: a model repair scored below 70% (${repaired.map(s => Math.round(s * 100)).join(', ')})`);
  check(Boolean(results.items[1].feedback.grading?.original), `${drillId}: results don't show the original answer`);
  console.log(`${drillId}: ${scores.map(s => `${Math.round(s * 100)}%`).join(' ')} (first left unchanged)`);
}

// After a PS-1 set, a PS-4 set skips items derived from the PS-1 items seen.
async function fourteenDayRule() {
  const { set_id } = await startSet(student, { drill_id: 'PS-1', tier: 1 });
  const view = await setView(student, set_id);
  for (let position = 0; position < view.size; position++) {
    const fetched = await fetchItem(student, set_id, position);
    await submitAttempt(student, set_id, { position, idempotency_key: `ps1-${position}`, step: 0, response: { type: 'choice', option_id: fetched.item.options[0].id }, skip: false, timed_out: false });
  }
  await finish(set_id, 'PS-1');
  const [ps1] = await db.select({ plan: drillSets.itemPlan }).from(drillSets).where(eq(drillSets.id, set_id));
  const seen = new Set((ps1.plan as ItemRef[]).flatMap(r => (r.kind === 'authored' ? [r.item_id] : [])));
  const { set_id: repair } = await startSet(student, { drill_id: 'PS-4', tier: 1 });
  const [ps4] = await db.select({ plan: drillSets.itemPlan }).from(drillSets).where(eq(drillSets.id, repair));
  const served = (ps4.plan as ItemRef[]).flatMap(r => (r.kind === 'authored' ? [byId.get(r.item_id)!] : []));
  const clash = served.filter(i => seen.has(i.extras.derived_from as string));
  const sources = items.filter(i => i.drill_id === 'PS-4').filter(i => seen.has(i.extras.derived_from as string)).length;
  check(clash.length === 0, `PS-4 served ${clash.map(i => i.item_id).join(', ')}, derived from PS-1 items seen today`);
  console.log(`14-day rule: ${sources} PS-4 item(s) derived from the PS-1 items just seen, none served`);
  await db.update(drillSets).set({ status: 'expired' }).where(eq(drillSets.id, repair));
}

// ------------------------------------------------------------------ Defend

// Tier 2 runs Defend. The plan is set to three items with follow-ups so the
// run doesn't depend on which items the planner happens to pick.
async function defendSet(drillId: string) {
  const { set_id } = await startSet(student, { drill_id: drillId, tier: 2 });
  // Live since D5 shipped (2026-10-16); drafts carried the follow-ups before.
  const rows = await db.select().from(drillItems).where(and(eq(drillItems.drillId, drillId), eq(drillItems.status, 'live')));
  const withFollowup = rows.filter(r => (r.payload as Item).defend).slice(0, 3);
  const plan: ItemRef[] = withFollowup.map(r => ({ kind: 'authored', item_id: r.itemId, version: r.version, defend: true }));
  await db.update(drillSets).set({ itemPlan: plan, size: plan.length }).where(eq(drillSets.id, set_id));
  const view = await setView(student, set_id);
  check(view.defend?.seconds === 60, `${drillId}: intro doesn't announce a 60 s follow-up`);

  for (let position = 0; position < plan.length; position++) {
    const fetched = await fetchItem(student, set_id, position);
    const base = withFollowup[position].payload as Item;
    const item = withDefend(base);
    check(!JSON.stringify(fetched.item).includes(base.defend!.text), `${drillId}: follow-up text reached the client before the main answer`);
    const leaked = KEY_FIELDS.filter(k => keysDeep(fetched.item).has(k));
    check(leaked.length === 0, `${drillId}: item response leaks ${leaked.join(', ')}`);
    const answers = modelAnswerSteps(item);
    const mainSteps = item.input.steps!.filter(s => !s.defend).length;
    let reply: StepReply | ItemFeedback | null = null;
    for (const [i, response] of answers.entries()) {
      // The last item skips its follow-up.
      if (position === plan.length - 1 && i === mainSteps) {
        reply = await submitAttempt(student, set_id, { position, idempotency_key: `${drillId}-${position}-skip`, step: i, response: null, skip: true, timed_out: false });
        break;
      }
      reply = await submitAttempt(student, set_id, { position, idempotency_key: `${drillId}-${position}-${i}`, step: i, response, skip: false, timed_out: false });
      if (i === mainSteps - 1) {
        const step = reply as StepReply;
        check(step.done === false && step.step.followup?.text === base.defend!.text, `${drillId}: the follow-up didn't arrive after the main answer`);
        check(step.time_limit_ms === 60_000, `${drillId}: the follow-up's clock is ${step.time_limit_ms} ms, not 60 s`);
      }
    }
    check(reply?.done === true, `${drillId}: item ${position} didn't finish`);
  }
  const results = await finish(set_id, `${drillId} Defend`);
  if (!results) return;
  const graded = results.items.map(i => i.feedback.grading?.defend);
  check(graded.every(Boolean), `${drillId}: results lack the Defend section`);
  check(graded.slice(0, -1).every(d => d && !d.skipped && d.checks.some(c => c.pass && c.evidence !== undefined)), `${drillId}: no Defend check passed`);
  const skipped = results.items[results.items.length - 1].feedback;
  const attempts = (await db.select().from(drillAttempts).where(eq(drillAttempts.setId, set_id))).sort((a, b) => a.position - b.position);
  // Results leave M.skipped out of the mistake list; the attempt keeps it.
  check(Boolean(graded[graded.length - 1]?.skipped) && attempts[attempts.length - 1].mistakeTags.includes('M.skipped'), `${drillId}: skipped follow-up not logged as M.skipped`);
  check(skipped.score > 0 && skipped.score <= 0.75 + 1e-9, `${drillId}: skipped follow-up scored ${skipped.score} (main answer should count, up to 75%)`);
  check(attempts.slice(0, -1).every(a => a.defendResponse && a.defendScore !== null && a.defendTimeMs !== null), `${drillId}: Defend columns not filled in`);
  if (drillId === 'SY-2') check(graded.slice(0, -1).every(d => d?.decision?.right), 'SY-2: a model Hold/Update decision was scored wrong');
  console.log(`${drillId} with Defend: ${results.items.map(i => `${Math.round(i.feedback.score * 100)}%`).join(' ')}; follow-ups ${graded.map(d => (d?.skipped ? 'skipped' : `${d?.checks.filter(c => c.pass).length}/${d?.checks.length}`)).join(', ')}`);
}

async function main() {
  try {
    for (const drillId of ['PS-4', 'HY-3', 'SY-3']) await repairSet(drillId);
    await fourteenDayRule();
    for (const drillId of ['PS-3', 'HY-2', 'SY-2', 'CL-3']) await defendSet(drillId);
  } finally {
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    await db.delete(drillTiers).where(eq(drillTiers.studentId, student));
    await db.delete(prescriptions).where(eq(prescriptions.studentId, student));
    await db.delete(skillStateEvents).where(eq(skillStateEvents.studentId, student));
    await db.delete(skillStates).where(eq(skillStates.studentId, student));
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
