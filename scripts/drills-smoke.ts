// End-to-end check of drill sets against the real database, through the
// service layer the route handlers call. Runs one set of every live drill as
// a throwaway student, checks the PRD integrity rules on the way, and deletes
// everything it wrote.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/drills-smoke.ts
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { analyticsEvents, drillAttempts, drillSets, drillTiers, studentDrillSettings } from '@/db/schema';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { rebuildItem } from '@/lib/drills/generators/registry';
import type { Item, Tier } from '@/lib/drills/item-schema';
import type { ItemRef } from '@/lib/drills/sets/plan';
import {
  DrillError, completeSet, fetchItem, setResults, setView, startSet, submitAttempt, updateSettings,
} from '@/lib/drills/sets/service';

const student = randomUUID();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { if (!ok) failures.push(what); };
const KEY_FIELDS = ['correct', 'tag', 'feedback', 'numeric', 'checks', 'red_flags', 'model_answer', 'explanation', 'extras', 'authorship', 'generator', 'trap_values', 'answer'];

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
  return out;
}

async function expectError(code: string, fn: () => Promise<unknown>, what: string) {
  try {
    await fn();
    failures.push(`${what}: expected ${code}, got success`);
  } catch (e) {
    check(e instanceof DrillError && e.code === code, `${what}: expected ${code}, got ${(e as Error).message}`);
  }
}

async function itemFor(setId: string, position: number): Promise<Item> {
  const [set] = await db.select().from(drillSets).where(eq(drillSets.id, setId));
  return rebuildItem((set.itemPlan as ItemRef[])[position] as Extract<ItemRef, { kind: 'generated' }>, set.tier as Tier);
}

async function runDrill(drillId: string, skillId: string, level: 1 | 2) {
  const { set_id } = await startSet(student, { skill_id: skillId, level });
  const view = await setView(student, set_id);
  check(view.drill.id === drillId, `${drillId}: started ${view.drill.id}`);
  check(view.example !== null, `${drillId}: no worked example on first set`);
  await expectError('set_in_progress', () => startSet(student, { skill_id: skillId }), `${drillId}: second set`);
  await expectError('out_of_order', () => fetchItem(student, set_id, 1), `${drillId}: fetch ahead`);

  let expected = 0;
  for (let p = 0; p < view.size; p++) {
    const fetched = await fetchItem(student, set_id, p);
    const leaked = KEY_FIELDS.filter(k => keysDeep(fetched.item).has(k));
    check(leaked.length === 0, `${drillId} #${p}: item response leaks ${leaked.join(', ')}`);
    const item = await itemFor(set_id, p);
    const steps = item.input.steps?.length ?? 1;
    const correct = item.options.find(o => o.correct);
    const answer = (i: number) => (item.input.steps?.[i].type ?? item.input.type) === 'numeric'
      ? { type: 'numeric' as const, value: String(item.numeric!.answer) }
      : { type: 'choice' as const, option_id: correct!.id };

    if (p === 0) {
      // Right answer on every step; replaying the final key returns the same result.
      let last;
      for (let i = 0; i < steps; i++) {
        const body = { position: p, idempotency_key: `k-${p}-${i}`, step: i, response: answer(i), skip: false, timed_out: false };
        last = await submitAttempt(student, set_id, body);
        if (i < steps - 1) check(last.done === false, `${drillId}: step ${i} should not finish the item`);
      }
      const replay = await submitAttempt(student, set_id, { position: p, idempotency_key: `k-${p}-${steps - 1}`, step: steps - 1, response: answer(steps - 1), skip: false, timed_out: false });
      check(JSON.stringify(replay) === JSON.stringify(last), `${drillId}: idempotent replay differs`);
      check(last?.done === true && last.correct, `${drillId}: right answer not scored correct`);
      expected += 1;
    } else if (p === 1) {
      const res = await submitAttempt(student, set_id, { position: p, idempotency_key: `k-${p}`, step: 0, response: null, skip: true, timed_out: false });
      check(res.done === true && res.skipped && res.score === 0, `${drillId}: skip not scored 0`);
    } else if (p === 2) {
      // Past the limit plus grace: the answer doesn't count.
      await db.update(drillSets).set({ currentServedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(drillSets.id, set_id));
      const res = await submitAttempt(student, set_id, { position: p, idempotency_key: `k-${p}`, step: 0, response: answer(0), skip: false, timed_out: false });
      check(res.done === true && res.timed_out && res.score === 0 && res.mistakes.some(m => m.tag === 'M.timeout'), `${drillId}: late answer not a timeout`);
    } else {
      // A wrong first step where there is one; otherwise right answers.
      let last;
      for (let i = 0; i < steps; i++) {
        const wrong = i === 0 && item.options.find(o => !o.correct);
        const response = wrong ? { type: 'choice' as const, option_id: wrong.id } : answer(i);
        last = await submitAttempt(student, set_id, { position: p, idempotency_key: `k-${p}-${i}`, step: i, response, skip: false, timed_out: false });
      }
      if (last?.done) expected += last.score;
    }
  }
  await completeSet(student, set_id);
  const results = await setResults(student, set_id);
  check(Math.abs(results.score - expected / view.size) < 1e-6, `${drillId}: set score ${results.score}, expected ${expected / view.size}`);
  check(results.items.length === view.size, `${drillId}: results list ${results.items.length} items`);
  console.log(`${drillId}: ${view.size} items, score ${Math.round(results.score * 100)}%, ${results.mistakes?.text ?? 'no misses'}`);
}

async function main() {
  try {
    await updateSettings(student, { time_multiplier: 1.5 });
    const live = DRILLS_CONFIG.drills.drills.filter(d => d.live);
    for (const drill of live) await runDrill(drill.id, drill.skills[0], drill.level);
    await expectError('no_live_drill', () => startSet(student, { skill_id: 'PS.mece' }), 'authored drill without live items');
  } finally {
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    await db.delete(drillAttempts).where(eq(drillAttempts.studentId, student));
    for (const s of sets) await db.delete(drillSets).where(eq(drillSets.id, s.id));
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
