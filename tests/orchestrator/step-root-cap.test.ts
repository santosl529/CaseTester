// Round 6 Task 72, the step check's roots (Lorenzo, 21 Oct, the step-check ruling: "The deterministic step check may,
// without the checker agreeing: link derived claims to the flagged root and stop probing them; ask one neutral input
// question at the root (for example, "Which row did you use for cancellations?"). It may NOT voice a correction
// without the checker's agreement."). Audit M1–M2 (docs/superpowers/plans/2026-10-21-data-path-audit.md): b37 Quillpath
// Raj e08c362a — eight checker and code lines on figures built on a misread Starter lifetime (13.5 months → $405), the
// one correction on a derived figure, while `recompute_report_only` had flagged starter_ltv 405 (expected 600) at t11;
// Marcus eb8d7576 — the 14-month lifetime probed three times under other keys, starter_ltv 420 flagged at t17. The runs
// verbatim (fixtures/step-roots-b37q.json; record tN is the candidate's message N, its reply tN+1).
import { describe, it, expect, vi } from 'vitest';

type Row = Record<string, unknown>;
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/db/client', () => ({
  db: {
    query: { sessions: { findFirst: async () => ({ status: 'active' }) } },
    insert: () => ({ values: async () => {} }),
    update: () => ({ set: (v: Row) => ({ where: async () => { void v; } }) }),
  },
}));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));

import { registerStepRoots, stepRootsDeclared, stepRootOf, stepRootFigures, stepRootEnds, lineKey, caseNumbersOf, closedErrorRestated, STEP_PROBE_CAP, type CheckerDecision, type CheckerRow, type StepRoot, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import { formatCheckerSection } from '@/lib/scoring/checker-record';
import { planTurn, type ModelPlan } from '@/lib/orchestrator/plan-turn';
import { settleTurn, type ModelOutcome } from '@/lib/orchestrator/settle-turn';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { CaseSchema } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import { readsFixture } from './fixtures/turn-reads';
import { RAJ, MARCUS, pricing, rootsUpTo, atTurn, replay, type Run } from './fixtures/step-roots-replay';
import RUNS from './fixtures/step-roots-b37q.json';

const STARTER_Q = 'Which row of the Starter cohort table did you use for cancellations?';
const PRO_Q = 'Which row of the Pro cohort table did you use for cancellations?';
const DEPENDENTS = ['starter_ratio', 'starter_value_with_upgrades', 'starter_ratio_with_upgrades', 'starter_net_value', 'value_with_starter', 'starter_value_added',
  'cannibalization_breakeven', 'starter_value_at_60', 'value_at_60', 'uplift_at_60', 'churn_breakeven_at_60', 'upgrade_breakeven_at_60'];
const RAJ_ROOT = 'step:starter_ltv@405';
const LINKED_405 = "built on starter_ltv's 405, flagged by the step check";
const LINKED_420 = "built on starter_ltv's 420, flagged by the step check";
const decisionOf = (decisions: CheckerDecision[], id: string) => decisions.find(d => d.id === id);
const claimOf = (r: Run, id: string) => {
  const [n, i] = id.split(':').map(Number);
  return (r.rows.find(x => x.subtype === 'verdict' && (x.payloadJsonb as VerdictPayload).candidateTurnIndex === n)!.payloadJsonb as VerdictPayload).claims[i];
};
const PROBES = ['probe', 'pointer', 'hint'];

describe('the case declares the roots: pricing-001 only', () => {
  it('starter_ltv and pro_ltv carry their input questions; twelve steps depend on starter_ltv', () => {
    const step = (id: string) => pricing.mathSteps.find(s => s.id === id)!;
    expect(step('starter_ltv').inputQuestion).toBe(STARTER_Q);
    expect(step('pro_ltv').inputQuestion).toBe(PRO_Q);
    expect(pricing.mathSteps.filter(s => s.dependsOn).map(s => [s.id, s.dependsOn])).toEqual(DEPENDENTS.map(id => [id, ['starter_ltv']]));
  });
  it('prof-001 declares neither: no roots', () => {
    const prof = getCaseById('prof-001');
    expect(stepRootsDeclared(prof)).toBe(false);
    expect(stepRootsDeclared(pricing)).toBe(true);
    expect(registerStepRoots(prof, {}, [{ stepId: prof.mathSteps[0].id, candidateValue: 999, span: 'about 999' }], 5, [])).toEqual({ roots: {}, registered: [], linked: [] });
  });
  it('the schema: an input question asks with no figure; dependsOn names known steps, never in a cycle', () => {
    const steps = (patch: (s: Row) => Row) => ({ ...pricing, mathSteps: pricing.mathSteps.map(s => patch(s as unknown as Row)) });
    const msgs = (c: unknown) => { const r = CaseSchema.safeParse(c); return r.success ? [] : r.error.issues.map(i => i.message); };
    expect(msgs(steps(s => (s.id === 'starter_ltv' ? { ...s, inputQuestion: 'Did you use the 40% row for cancellations?' } : s)))).toContain('An input question asks, with no figure in it');
    expect(msgs(steps(s => (s.id === 'starter_ltv' ? { ...s, inputQuestion: 'Use the cancelled row.' } : s)))).toContain('An input question asks, with no figure in it');
    expect(msgs(steps(s => (s.id === 'starter_ratio' ? { ...s, dependsOn: ['no_such_step'] } : s)))).toContain('Unknown math step "no_such_step"');
    expect(msgs(steps(s => (s.id === 'starter_ltv' ? { ...s, dependsOn: ['starter_ratio'] } : s)))).toEqual(expect.arrayContaining(['"starter_ltv" depends on itself']));
    expect(msgs(pricing)).toEqual([]);
  });
});

describe('a deterministic step flag on a root step registers the root; one on a step built on it is linked', () => {
  const rec = (r: Run, t: number) => r.records[String(t)];
  it('b37q Raj t11, recompute_report_only starter_ltv 405 ("so about 13.5 months on plan × $30 = roughly $405 LTV"): the root, with its 13.5 months', () => {
    expect(rec(RAJ, 11).reportOnly).toEqual([expect.objectContaining({ stepId: 'starter_ltv', candidateValue: 405, expected: 600 })]);
    const r = registerStepRoots(pricing, {}, rec(RAJ, 11).reportOnly, 11, caseNumbersOf(pricing, rec(RAJ, 11).revealed));
    expect(r.registered).toEqual([RAJ_ROOT]);
    // $30 is the Starter margin, a step's right answer: no root figure.
    expect(r.roots[RAJ_ROOT]).toMatchObject({ step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 11 });
  });
  it('Raj t21 (starter_ratio_with_upgrades 13, cannibalization_breakeven 10) and t33 (starter_ratio_with_upgrades 13.5): linked to it, no root of their own', () => {
    expect(rootsUpTo(RAJ, 40)).toEqual({ [RAJ_ROOT]: expect.objectContaining({ value: 405 }) });
    for (const t of [21, 33]) {
      const r = registerStepRoots(pricing, rootsUpTo(RAJ, t - 2), rec(RAJ, t).reportOnly, t, caseNumbersOf(pricing, rec(RAJ, t).revealed));
      expect(r.registered).toEqual([]);
      expect(r.linked.map(l => l.root)).toEqual(rec(RAJ, t).reportOnly.map(() => RAJ_ROOT));
    }
  });
  it('b37q Marcus: t15 (starter_ltv 900, "needs $900 / $30") and t17 (starter_ltv 420) are two roots; t21\'s 1,220 and 920 link to the 420', () => {
    const roots = rootsUpTo(MARCUS, 20);
    expect(Object.keys(roots)).toEqual(['step:starter_ltv@900', 'step:starter_ltv@420']);
    const r = registerStepRoots(pricing, roots, rec(MARCUS, 21).reportOnly, 21, caseNumbersOf(pricing, rec(MARCUS, 21).revealed));
    expect(r.linked).toEqual([{ key: 'starter_value_with_upgrades@1220', root: 'step:starter_ltv@420' }, { key: 'starter_net_value@920', root: 'step:starter_ltv@420' }]);
  });
  it('a root\'s figures: never a step\'s right answer (a Pro customer\'s $2,800, the $30 margin) or a one-digit count, even outside the data', () => {
    expect(stepRootFigures(pricing, 405, 'a Pro customer nets $2,800 over 3 plans; 13.5 months × $30 = $405', [])).toEqual([405, 13.5]);
  });
  it('a flag on a step that is no root step, with no root yet, registers nothing (Raj t29\'s starter_value_at_60 905 alone)', () => {
    expect(registerStepRoots(pricing, {}, rec(RAJ, 29).reportOnly, 29, caseNumbersOf(pricing, rec(RAJ, 29).revealed))).toEqual({ roots: {}, registered: [], linked: [] });
  });
  it('a claim of the root itself is not linked (Raj 33:0, "$30 a month, times expected 13.5 months on plan = $405")', () => {
    const roots = rootsUpTo(RAJ, 35);
    expect(stepRootOf({ c: pricing, roots, key: 'starter_ltv@405', span: claimOf(RAJ, '33:0').span, own: [405], n: 33, caseFigures: [] })).toBeNull();
    // …but a claim of the same step at another figure carrying the root's 13.5 is (Raj 25:0, "$675" at $60).
    expect(stepRootOf({ c: pricing, roots, key: 'starter_ltv@675', span: claimOf(RAJ, '25:0').span, own: [675], n: 25, caseFigures: [] })).toBe(RAJ_ROOT);
  });
});

describe("Raj's derived lines t17–t35, one turn at a time (the run's own memory, with the root)", () => {
  const at = (t: number, over = {}) => atTurn(RAJ, t, { stepRoots: rootsUpTo(RAJ, t), ...over });
  it('the run, without the root: every one of them a checker line', () => {
    const lines = Object.fromEntries([17, 19, 21, 27, 29, 33, 35].map(t => [t, atTurn(RAJ, t).selected?.id ?? null]));
    expect(lines).toEqual({ 17: '15:0', 19: '17:1', 21: '17:2', 27: '23:0', 29: '25:0', 33: '29:0', 35: '33:0' });
    // t31: the run said 29:1; rebuilt from the rows (no close-hold rank), the turn picks 29:0's correction — both derived.
    expect(['29:0', '29:1']).toContain(atTurn(RAJ, 31).selected?.id);
  });
  it('t17 "$2,800" (15:0) — not linked: a claim on no step, its span ("a $4,000 customer for a $1,205 one") carries no root figure; still probed', () => {
    expect(claimOf(RAJ, '15:0').codeQuantity.kind).toBe('none');
    expect(at(17).selected).toMatchObject({ id: '15:0', action: 'probe' });
  });
  // Fix round 1 (controller ruling, 21 Oct: "Linking stops PROBES only. A checker-agreed correction on a linked claim still
  // goes out under round 5c's ruling 3, one derived correction per root"): a linked claim is never probed; its own
  // correction goes once per root step (derivedOnce `step:starter_ltv`) — the first that comes — the rest to the report.
  const SAID_17_1 = { derivedOnce: { 'step:starter_ltv': '17:1' } };
  const ONCE = /flagged by the step check — its own correction, once \(one per root\)/;
  const SLOT_USED = "built on starter_ltv's 405, flagged by the step check — one correction per root, said already (17:1); left for the report";
  it('t19 "$1,205" (17:1, starter_value_with_upgrades) — linked: not probed; its correction, the root\'s one derived correction, goes first: "$1,400, not $1,205"', () => {
    const p = at(19);
    expect(p.selected).toMatchObject({ id: '17:1', action: 'correct', line: 'Starter value per sign-up including upgrades, at $40, is about $1,400, not $1,205.', onceRoot: 'step:starter_ltv' });
    expect(decisionOf(p.decisions, '17:1')).toMatchObject({ outcome: 'correct', reason: expect.stringMatching(ONCE), root: RAJ_ROOT });
    expect(p.stepLinked).toMatchObject({ 'starter_value_with_upgrades@1205': RAJ_ROOT, 'starter_value_added@790': RAJ_ROOT });
    // 17:2 ($790k) waits for its turn: neither probed nor decided.
    expect(decisionOf(p.decisions, '17:2')).toBeUndefined();
    expect(p.waiting.map(w => w.id)).toContain('17:2');
  });
  it('t21 "$790k" (17:2, starter_value_added) — linked; the root\'s correction said (t19): the report', () => {
    expect(decisionOf(at(21, SAID_17_1).decisions, '17:2')).toMatchObject({ outcome: 'unresolved', reason: SLOT_USED, root: RAJ_ROOT });
    expect(at(21, SAID_17_1).selected).toBeNull();
    // …the slot free (as in the run's own memory), its own correction would go instead — never a probe.
    expect(at(21).selected).toMatchObject({ id: '17:2', action: 'correct' });
  });
  it('t27 "$620,000" (23:0, starter_value_added) — linked; the turn\'s line goes to 25:2 "$940k" — not linked: its span ("Times 800 = $940k a month.") carries no root figure', () => {
    const p = at(27, SAID_17_1);
    expect(decisionOf(p.decisions, '23:0')).toMatchObject({ outcome: 'unresolved', reason: SLOT_USED });
    expect(p.selected).toMatchObject({ id: '25:2', action: 'probe' });
  });
  it('t29 "$675" (25:0, a claim on no step) — linked by the root\'s figure: "Starter LTV on plan = 50 × 13.5 ≈ $675"', () => {
    expect(claimOf(RAJ, '25:0').span).toBe('Starter LTV on plan = 50 × 13.5 ≈ $675');
    expect(decisionOf(at(29, SAID_17_1).decisions, '25:0')).toMatchObject({ outcome: 'unresolved', reason: SLOT_USED, root: RAJ_ROOT });
  });
  it('t31 "$905,000" (29:1, starter_net_value) — linked; no correction code can write: the report', () => {
    const p = at(31);
    expect(decisionOf(p.decisions, '29:1')).toMatchObject({ outcome: 'unresolved', reason: LINKED_405 });
    expect(p.decisions.filter(d => PROBES.includes(d.outcome))).toEqual([]);
    expect(at(31, SAID_17_1).selected).toBeNull();
  });
  it('t33 the correction "$1,400, not $1,205" (29:0) — the same derived correction: said once only, whichever comes first (t19 here)', () => {
    expect(decisionOf(at(33, SAID_17_1).decisions, '29:0')).toMatchObject({ outcome: 'unresolved', reason: SLOT_USED });
    expect(at(33, SAID_17_1).selected).toBeNull();
    // …nothing said before (the run's own memory): it is the root's one derived correction.
    expect(at(33).selected).toMatchObject({ id: '29:0', action: 'correct', onceRoot: 'step:starter_ltv' });
  });
  it('t35 "$405" (33:0, the root itself) — not linked: the checker\'s own line; after the t12 input question it is the second attempt, the correction — the checker\'s flag, not the step check\'s', () => {
    expect(at(35).selected).toMatchObject({ id: '33:0', action: 'probe' });
    expect(at(35, { attempts: { 'starter_ltv@405': 1 } }).selected).toMatchObject({ id: '33:0', action: 'correct', line: 'Starter standalone lifetime value at $40 is about $600, not $405.' });
    expect(claimOf(RAJ, '33:0').flag).toBe(true);
  });
  it('built (rootOf) on a claim linked already: linked too — Raj 25:3 put on the $790k linked at t21 (its span rewritten to carry it)', () => {
    const v25 = RAJ.rows.find(x => x.subtype === 'verdict' && (x.payloadJsonb as VerdictPayload).candidateTurnIndex === 25)!;
    const onLinked = { ...claimOf(RAJ, '25:3'), span: 'Net of the $790k, the control is worth $905k.' };
    const rows = RAJ.rows.map(x => (x === v25 ? { ...x, payloadJsonb: { ...(x.payloadJsonb as VerdictPayload), claims: [onLinked] } } : x));
    const roots = { [RAJ_ROOT]: { ...rootsUpTo(RAJ, 27)[RAJ_ROOT], linked: ['starter_value_added@790'] } };
    const p = atTurn({ ...RAJ, rows }, 27, { stepRoots: roots });
    expect(decisionOf(p.decisions, '25:0')).toMatchObject({ outcome: 'unresolved', reason: LINKED_405, root: RAJ_ROOT });
    // …and with the $790k not linked, it is the checker's to probe, as before.
    expect(decisionOf(atTurn({ ...RAJ, rows }, 27, { stepRoots: rootsUpTo(RAJ, 27) }).decisions, '25:0')?.reason).not.toBe(LINKED_405);
  });
  it('a key linked earlier, restated later: still the root\'s, for the report', () => {
    const roots = { [RAJ_ROOT]: { ...rootsUpTo(RAJ, 33)[RAJ_ROOT], linked: ['starter_value_with_upgrades@1205'] } };
    const p = atTurn(RAJ, 33, { stepRoots: roots, closed: ['starter_value_with_upgrades@1205'] });
    expect(decisionOf(p.decisions, '29:0')).toMatchObject({ outcome: 'unresolved', reason: LINKED_405, root: RAJ_ROOT });
  });
});

describe("Marcus's lines t23–t29 (the run's own memory, with the roots)", () => {
  const at = (t: number) => atTurn(MARCUS, t, { stepRoots: rootsUpTo(MARCUS, t) });
  it('t23 "$920" (21:1, starter_net_value) — linked to t17\'s starter_ltv 420: not probed (the run probed it: "Walk me through that calculation")', () => {
    expect(atTurn(MARCUS, 23).selected).toMatchObject({ id: '21:1', action: 'probe' });
    const p = at(23);
    expect(p.decisions.filter(d => PROBES.includes(d.outcome) && d.id === '21:1')).toEqual([]);
    expect(p.waiting).toEqual(expect.arrayContaining([expect.objectContaining({ id: '21:1', root: 'step:starter_ltv' })]));
    expect(decisionOf(p.decisions, '21:3')).toMatchObject({ outcome: 'unresolved', reason: LINKED_420 });
  });
  it('t23/t27 "$1,880" (21:2, a claim on no step) — not linked: its span ("a loss of ~$1,880 each, or about $282,000 a month") carries no root figure', () => {
    expect(at(23).selected).toMatchObject({ id: '21:2', action: 'probe' });
  });
  it('t29 the correction "Starter net value per sign-up at $40 is about $1,100, not $920." (25:0) — said: the root\'s one derived correction', () => {
    const p = at(29);
    expect(p.selected).toMatchObject({ id: '25:0', action: 'correct', line: 'Starter net value per sign-up at $40 is about $1,100, not $920.', onceRoot: 'step:starter_ltv' });
    expect(decisionOf(p.decisions, '25:0')).toMatchObject({ outcome: 'correct', reason: expect.stringMatching(/^built on starter_ltv's 420, flagged by the step check — its own correction, once \(one per root\)/), root: 'step:starter_ltv@420' });
    // …unless another derived correction on starter_ltv went first (both roots, $900 and $420, share the slot).
    expect(decisionOf(atTurn(MARCUS, 29, { stepRoots: rootsUpTo(MARCUS, 29), derivedOnce: { 'step:starter_ltv': '17:1' } }).decisions, '25:0'))
      .toMatchObject({ outcome: 'unresolved', reason: "built on starter_ltv's 420, flagged by the step check — one correction per root, said already (17:1); left for the report" });
  });
});

describe('the whole interview, message by message (chained memory)', () => {
  const lines = (r: Run) => replay(r).flatMap(x => [...(x.rootAsked ? [`t${x.t} root: ${x.rootAsked}`] : []), ...(x.said ? [`t${x.t} ${x.plan.selected!.action}: ${x.said}`] : [])]);
  const derivedOn = (turns: ReturnType<typeof replay>, root: RegExp) => turns.flatMap(x => (x.kind === 'model' && x.plan.selected?.action === 'correct' && x.plan.selected.onceRoot === 'step:starter_ltv'
    ? x.plan.decisions.filter(d => d.id === x.plan.selected!.id && root.test(d.root ?? '')) : []));
  it('Raj: the input question at t12, once; no probe on a linked claim; one derived correction on the root ($1,205, t20 — the first), plus the root\'s own (the checker\'s, t36)', () => {
    const turns = replay(RAJ);
    expect(lines(RAJ)).toEqual([
      `t11 root: ${STARTER_Q}`,
      't17 probe: You said a $2,800 loss each time Pro becomes Starter. How did you get that figure?',
      't19 correct: Starter value per sign-up including upgrades, at $40, is about $1,400, not $1,205.',
      expect.stringMatching(/^t27 probe: .*\$940k/),
      expect.stringMatching(/^t29 probe: .*\$905k/),
      't35 correct: Starter standalone lifetime value at $40 is about $600, not $405.',
    ]);
    const linked = new Set(turns.flatMap(x => x.plan.decisions.filter(d => d.root === RAJ_ROOT).map(d => d.key)));
    expect(turns.flatMap(x => x.plan.decisions.filter(d => PROBES.includes(d.outcome) && linked.has(d.key)))).toEqual([]);
    expect(derivedOn(turns, /^step:starter_ltv@405$/).map(d => d.id)).toEqual(['17:1']);
    // The root's own correction is the checker's flag on 33:0 ("$405"), not linked, not the derived slot.
    expect(turns.flatMap(x => x.plan.decisions.filter(d => d.outcome === 'correct' && x.kind === 'model').map(d => [d.id, d.key, d.root ?? null]))).toEqual([
      ['17:1', 'starter_value_with_upgrades@1205', RAJ_ROOT], ['33:0', 'starter_ltv@405', null]]);
    expect(claimOf(RAJ, '33:0').flag).toBe(true);
    // The $1,205 corrected at t20 and said again (29:0, t33): a corrected key, restated — never a second correction.
    expect(decisionOf(turns.find(x => x.t === 31)!.plan.decisions, '29:0')).toMatchObject({ outcome: 'unresolved', reason: 'restated after the flag closed (corrected, or left for the report)' });
  });
  it('a linked claim whose correction line was said already (by another claim): the report, the line named', () => {
    const line = 'Starter value per sign-up including upgrades, at $40, is about $1,400, not $1,205.';
    const p = atTurn(RAJ, 19, { stepRoots: rootsUpTo(RAJ, 19), said: { [lineKey(line)]: 1 } });
    expect(decisionOf(p.decisions, '17:1')).toMatchObject({ outcome: 'unresolved', reason: `${LINKED_405} — its own correction was said once already; left for the report`, line });
  });
  it('Marcus: the input question first (t22, fix round 2: ahead of the linked 1.4x correction), then the one derived correction — "$1,100, not $920" (t28); no probe on a linked claim; the lifetime probed twice at most', () => {
    const turns = replay(MARCUS);
    expect(lines(MARCUS).filter(l => / root: /.test(l))).toEqual([`t21 root: ${STARTER_Q}`]);
    // 17:1's own correction waited for the question, then expired unsaid (three messages): not decided at t21.
    expect(decisionOf(turns.find(x => x.t === 21)!.plan.decisions, '17:1')).toBeUndefined();
    expect(derivedOn(turns, /^step:starter_ltv@/).map(d => d.id)).toEqual(['25:0']);
    expect(lines(MARCUS)).toContain('t27 correct: Starter net value per sign-up at $40 is about $1,100, not $920.');
    const starterProbes = turns.filter(x => x.kind === 'model' && (x.rootAsked || (x.plan.selected && PROBES.includes(x.plan.selected.action) && x.plan.selected.key.startsWith('starter_ltv@'))));
    expect(starterProbes.length).toBeLessThanOrEqual(STEP_PROBE_CAP);
    const linked = new Set(turns.flatMap(x => x.plan.decisions.filter(d => d.root?.startsWith('step:')).map(d => d.key)));
    expect(linked).toContain('starter_net_value@920');
    expect(turns.flatMap(x => x.plan.decisions.filter(d => PROBES.includes(d.outcome) && linked.has(d.key)))).toEqual([]);
  });
  it('without the roots the replay links nothing (the run\'s own logic)', () => {
    for (const r of [RAJ, MARCUS]) expect(replay(r, { roots: false }).flatMap(x => x.plan.decisions.filter(d => d.root?.startsWith('step:')))).toEqual([]);
  });
});

// Fix round 2 (controller ruling, 21 Oct; the review's probe): a root links by dependency only while it stands — not once
// the candidate states R outside v's tolerance, a dependent claim's span carries R's right answer, or the root key is
// corrected or closed. Linking by figure stays.
describe('a root stops linking by dependency once it no longer stands', () => {
  const roots405 = (): Record<string, StepRoot> => ({ [RAJ_ROOT]: { step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 11 } });
  const of = (key: string, span: string, own: number[], n: number, over: { roots?: Record<string, StepRoot>; closed?: Set<string> } = {}) =>
    stepRootOf({ c: pricing, roots: over.roots ?? roots405(), key, span, own, n, caseFigures: [30, 300, 800, 4000], closed: over.closed });
  it('the review\'s t41: "So $600 plus $800 is $1,400, minus $300 CAC gives $1,200 net." carries starter_ltv\'s right answer — not linked', () => {
    expect(of('starter_net_value@1200', 'So $600 plus $800 is $1,400, minus $300 CAC gives $1,200 net.', [1200], 41)).toBeNull();
    // …a dependent slip that doesn't carry it is linked, as before.
    expect(of('starter_net_value@1200', 'So $1,400 minus $200 gives $1,200 net.', [1200], 41)).toBe(RAJ_ROOT);
  });
  it('the root key corrected or closed: no dependency link; a span carrying the root\'s own figure still links', () => {
    const closed = new Set(['starter_ltv@405']);
    expect(of('uplift_at_60@0.4', 'At $60, $2.48M minus $2.08M is $0.4M uplift.', [0.4], 45, { closed })).toBeNull();
    expect(of('uplift_at_60@0.4', 'At $60, $2.48M minus $2.08M is $0.4M uplift.', [0.4], 45)).toBe(RAJ_ROOT);
    expect(of('starter_net_value@1105', 'the $405 plus $800, minus $300 CAC, is $905, so $1,105 with the fee', [1105], 45, { closed })).toBe(RAJ_ROOT);
  });
  it('ended at message 37: a claim from before still links by dependency, one from then on does not', () => {
    const roots = { [RAJ_ROOT]: { ...roots405()[RAJ_ROOT], endedAt: 37 } };
    expect(of('uplift_at_60@175', 'the $60 test points to another $175k a month on top', [175], 35, { roots })).toBe(RAJ_ROOT);
    expect(of('uplift_at_60@175', 'the $60 test points to another $175k a month on top', [175], 39, { roots })).toBeNull();
  });
  it('stepRootEnds: R stated outside v\'s tolerance (the right $600, or another revision) or a dependent span with R\'s answer ends it; R within tolerance doesn\'t', () => {
    const ends = (stated: { stepId: string; value?: number; span: string }[]) => stepRootEnds(pricing, roots405(), stated, 37);
    expect(ends([{ stepId: 'starter_ltv', value: 600, span: 'Starter LTV is $30 × 20 = $600' }])).toEqual({ [RAJ_ROOT]: 37 });
    expect(ends([{ stepId: 'starter_ltv', value: 500, span: 'call it $500 of LTV' }])).toEqual({ [RAJ_ROOT]: 37 });
    expect(ends([{ stepId: 'starter_ltv', value: 410, span: 'about $410 of LTV' }])).toEqual({});
    expect(ends([{ stepId: 'starter_net_value', value: 1100, span: '$600 + $800 − $300 = $1,100' }])).toEqual({ [RAJ_ROOT]: 37 });
    expect(ends([{ stepId: 'starter_net_value', value: 1100, span: '$1,400 − $300 = $1,100' }])).toEqual({});
  });
  it('Raj, the root corrected at t36 ("$600, not $405"): t39\'s fresh uplift_at_60 slip ("another $175k a month") is the checker\'s again — linked before', () => {
    const closed = [...new Set(RAJ.rows.filter(x => x.subtype === 'flag').map(x => (x.payloadJsonb as CheckerDecision)).filter(d => d.outcome === 'correct').map(d => d.key)), 'starter_ltv@405'];
    const corrected = { 'starter_ltv@405': { line: 'Starter standalone lifetime value at $40 is about $600, not $405.' } };
    const after = atTurn(RAJ, 41, { stepRoots: rootsUpTo(RAJ, 39), closed, corrected });
    expect(after.selected).toMatchObject({ id: '39:2', action: 'probe' });
    expect(decisionOf(after.decisions, '39:2')).toMatchObject({ outcome: 'probe' });
    expect(decisionOf(after.decisions, '39:2')?.root).toBeUndefined();
    // Standing (not corrected): linked — never probed; its own correction, the root's one derived correction.
    const standing = decisionOf(atTurn(RAJ, 41, { stepRoots: rootsUpTo(RAJ, 39) }).decisions, '39:2');
    expect(standing).toMatchObject({ root: RAJ_ROOT });
    expect(PROBES).not.toContain(standing?.outcome);
  });
  it('a checker claim on a dependent step carrying $600 ends the root from its message (Raj 39:0 rewritten to "$600 standalone plus $800")', () => {
    const v39 = RAJ.rows.find(x => x.subtype === 'verdict' && (x.payloadJsonb as VerdictPayload).candidateTurnIndex === 39)!;
    const claims = (v39.payloadJsonb as VerdictPayload).claims.map((c, i) => (i === 0 ? { ...c, span: 'about $600 standalone plus $800 is $1,400 per sign-up against $300 CAC' } : c));
    const rows = RAJ.rows.map(x => (x === v39 ? { ...x, payloadJsonb: { ...(x.payloadJsonb as VerdictPayload), claims } } : x));
    const p = atTurn({ ...RAJ, rows }, 41, { stepRoots: rootsUpTo(RAJ, 39) });
    expect(p.stepRootEnded).toEqual({ [RAJ_ROOT]: 39 });
    expect(decisionOf(p.decisions, '39:2')?.root).toBeUndefined();
  });
});

describe('through plan-turn: the candidate states the root step right — its dependency links end (flags.stepRoots endedAt)', () => {
  it('"Starter LTV is $30 × 20 = $600" after the $405 root: ended at this message', () => {
    const roots = { [RAJ_ROOT]: { step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 1, linked: ['starter_value_with_upgrades@1205'] } };
    const reads = readsFixture({ phase: 'EXHIBIT', caseId: 'pricing-001', revealed: RAJ.records['19'].revealed, elapsedMs: RAJ.records['11'].elapsedMs,
      flags: { pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 3 }, stepRoots: roots, stepRootAsked: ['starter_ltv'] } });
    const p = planTurn(reads, 'Starter cancellation is 5% a month, so the lifetime is 20 months and Starter LTV is $30 × 20 = $600.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
    expect(p.ctx.checks.entries.find(c => c.check === 'step_root')).toMatchObject({ detail: { ended: [RAJ_ROOT] } });
    expect(p.ctx.flags.stepRoots).toMatchObject({ [RAJ_ROOT]: { endedAt: 3, linked: ['starter_value_with_upgrades@1205'] } });
  });
});

describe('the root\'s question first (fix round 2): a linked claim\'s own correction waits for it', () => {
  it('planCheckerFlags holdLinked: Raj t19\'s 17:1 correction held — not decided, still waiting', () => {
    const p = atTurn(RAJ, 19, { stepRoots: rootsUpTo(RAJ, 19), holdLinked: true });
    expect(p.selected).toBeNull();
    expect(decisionOf(p.decisions, '17:1')).toBeUndefined();
    expect(p.waiting.map(w => w.id)).toEqual(expect.arrayContaining(['17:1', '17:2']));
  });
  it('through plan-turn: the question takes the slot from 17:1\'s correction; asked already, the correction goes', () => {
    const v17 = RAJ.rows.find(x => x.subtype === 'verdict' && (x.payloadJsonb as VerdictPayload).candidateTurnIndex === 17)!;
    const row = { ...v17, id: 'ev', sessionId: 's1', phase: 'ANALYSIS', turnIndex: 1, payloadJsonb: { ...(v17.payloadJsonb as VerdictPayload), candidateTurnIndex: 1, claims: [claimOf(RAJ, '17:1')] } };
    const roots = { [RAJ_ROOT]: { step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 1 } };
    const at = (flags: Record<string, unknown>) => {
      const reads = readsFixture({ phase: 'EXHIBIT', caseId: 'pricing-001', revealed: RAJ.records['19'].revealed, elapsedMs: RAJ.records['11'].elapsedMs,
        flags: { pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'satisfied', satisfiedAt: 3 }, stepRoots: roots, ...flags } });
      return planTurn({ ...reads, checkerEventRows: [row] } as never, 'Got it.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
    };
    const first = at({});
    expect(first.state.kind).toBe('model');
    expect(first.state.checkerLine).toMatchObject({ id: RAJ_ROOT, line: STARTER_Q });
    expect(first.ctx.checks.entries.find(c => c.check === 'step_root_first')).toMatchObject({ decision: 'act', detail: { held: ['1:0'] } });
    const later = at({ stepRootAsked: ['starter_ltv'] });
    expect(later.state.checkerLine).toMatchObject({ id: '1:0', action: 'correct', line: 'Starter value per sign-up including upgrades, at $40, is about $1,400, not $1,205.' });
  });
});

describe('the input question through the turn (plan-turn.ts → settle-turn.ts): b37q Raj t11 → t12', () => {
  const T11 = RAJ.turns.find(t => t.turnIndex === 11)!.text;
  const rec = RAJ.records['11'];
  const T11_TURN = (RUNS.raj as unknown as { t11Turn: ModelTurn }).t11Turn;
  const usage = { model: '', actualModels: [] as string[], inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
  const outcome = (turn: ModelTurn): ModelOutcome => ({ turn, validation: null, modelCallStart: 0, modelLatencyMs: 0, distressWaitMs: 0, turnUsage: usage, delivered: [], undeliveredRevealIds: [] });
  const PT = { ...INITIAL_PRESSURE_TEST, state: 'satisfied' as const, satisfiedAt: 3 };
  function plan(flags: Record<string, unknown> = {}, caseId = 'pricing-001', text = T11): ModelPlan {
    const p = planTurn(readsFixture({ phase: 'EXHIBIT', caseId, revealed: caseId === 'pricing-001' ? rec.revealed : [], elapsedMs: rec.elapsedMs, flags: { pressureTest: PT, ...flags } }), text,
      { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    p.state.distress = Promise.resolve(null);
    return p;
  }
  const checkOf = (p: ModelPlan, name: string) => p.ctx.checks.entries.find(c => c.check === name);
  it('the root registered, and its question planned in the checker\'s slot: a probe, booked to starter_ltv@405 and the step', () => {
    const p = plan();
    expect(p.state.kind).toBe('model');
    expect(checkOf(p, 'step_root')).toMatchObject({ decision: 'act', detail: { registered: ['step:starter_ltv@405'] } });
    expect(p.state.checkerLine).toMatchObject({ id: 'step:starter_ltv@405', key: 'starter_ltv@405', action: 'probe', line: STARTER_Q, stepRoot: 'starter_ltv' });
    expect(p.state.recomputeHint).toContain(`"${STARTER_Q}"`);
    expect(p.state.recomputeAttempts['starter_ltv@405']).toBe(1);
    expect(p.ctx.flags).toMatchObject({ stepRootAsked: ['starter_ltv'], stepProbes: { starter_ltv: 1 }, stepRoots: { 'step:starter_ltv@405': expect.objectContaining({ value: 405, figures: [405, 13.5] }) } });
    expect(p.ctx.events).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'math_checker', subtype: 'flag', payload: expect.objectContaining({ id: 'step:starter_ltv@405', outcome: 'probe', line: STARTER_Q }) })]));
  });
  it('t12: the model asked its own question instead — code says the input question (no figure, no correction)', async () => {
    const p = plan();
    const s = await settleTurn(p, outcome(T11_TURN));
    expect(s.spokenText).toContain(STARTER_Q);
    expect(s.spokenText).not.toContain(T11_TURN.question);
    expect(s.spokenText).not.toMatch(/\$600|not \$?405/);
    expect(checkOf(p, 'checker_line')).toMatchObject({ detail: { id: 'step:starter_ltv@405', by: 'code', heard: true } });
    expect(p.ctx.flags.stepRootAsked).toEqual(['starter_ltv']);
  });
  it('the step\'s probe cap holds: two probes on starter_ltv already, no question', () => {
    expect(plan({ stepProbes: { starter_ltv: 2 } }).state.checkerLine).toBeNull();
  });
  it('a root more than two messages old is not asked about (the checker\'s wait)', () => {
    const roots = { [RAJ_ROOT]: { step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 1 } };
    const turns = [{ role: 'candidate' as const, text: 'Pro clears it.' }, { role: 'interviewer' as const, text: 'Go on.' }, { role: 'candidate' as const, text: 'Starter does not.' }, { role: 'interviewer' as const, text: 'Go on.' }];
    const at = (extraTurns: typeof turns) => {
      const p = planTurn(readsFixture({ phase: 'EXHIBIT', caseId: 'pricing-001', revealed: rec.revealed, elapsedMs: rec.elapsedMs, flags: { pressureTest: PT, stepRoots: roots }, extraTurns }), 'Got it.',
        { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
      return p.state.checkerLine?.line ?? null;
    };
    expect(at(turns.slice(0, 2))).toBe(STARTER_Q);   // messages 3 and 5 since the root's message 1: two
    expect(at(turns)).toBeNull();                    // 3, 5 and 7: three
  });
  it('once an interview: asked already, never again', () => {
    const p = plan({ stepRootAsked: ['starter_ltv'] });
    expect(p.state.checkerLine).toBeNull();
    expect(p.state.recomputeHint ?? '').not.toContain(STARTER_Q);
  });
  it('not heard (the pressure test\'s re-ask took the question): undone — not asked, the attempt and the step probe given back, nothing held', async () => {
    const p = plan({ pressureTest: { ...INITIAL_PRESSURE_TEST, state: 'awaiting', askedAt: 2, intents: ['mece'], awaitingReplies: 0, probe: 'Is that MECE?' } });
    p.state.probeVerdict = Promise.resolve({ answered: false } as never);
    const s = await settleTurn(p, outcome(T11_TURN));
    expect(s.spokenText).not.toContain(STARTER_Q);
    expect(p.ctx.flags.stepRootAsked).toEqual([]);
    expect(p.state.recomputeAttempts['starter_ltv@405']).toBeUndefined();
    expect((p.ctx.flags.stepProbes as Record<string, number>).starter_ltv).toBe(0);
    expect((p.ctx.flags.mathChecker as { held?: string } | undefined)?.held).toBeUndefined();
  });
  it('a due stage question keeps the question: the input question is undone, never held back for the next turn', async () => {
    const p = plan();
    p.state.stagesDue = { brainstorm: false, recommendation: true, risk: false };
    p.state.requiredExhibit = undefined;
    p.state.owedStage = undefined;
    p.state.analysisOwed = false;
    const s = await settleTurn(p, outcome({ ...T11_TURN, move: 'recommendation', question: "What's your recommendation to the CEO?" }));
    expect(s.spokenText).not.toContain(STARTER_Q);
    expect(checkOf(p, 'checker_line')).toMatchObject({ detail: { heldFor: 'recommendation' } });
    expect((p.ctx.flags.mathChecker as { held?: string } | undefined)?.held).toBeUndefined();
    expect(p.ctx.flags.stepRootAsked).toEqual([]);
  });
  it("a released code flag built on the root says nothing: an arithmetic flag on Raj's \"$405 + $800 = $1,205\" (gated by the checker's 21:0)", () => {
    const flag = { kind: 'arithmetic' as const, stepId: 'arithmetic', description: 'stated sum', expected: 1400, candidateValue: 1205, errorClass: 'minor' as const, span: '$405 + $800 = $1,205' };
    const row = { id: 'ev', sessionId: 's1', phase: 'ANALYSIS', category: 'math_checker', subtype: 'verdict', turnIndex: 1, payloadJsonb: {
      candidateTurnIndex: 1, latencyMs: 0, model: 'm', claims: [claimOf(RAJ, '21:0')], stamps: [],
      codeFlags: [{ key: 'arithmetic@1205', value: 1205, span: flag.span, finding: { kind: 'flag', flag } }] } };
    const roots = { [RAJ_ROOT]: { step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 1 } };
    const reads = readsFixture({ phase: 'EXHIBIT', caseId: 'pricing-001', revealed: rec.revealed, elapsedMs: rec.elapsedMs, flags: { pressureTest: PT, stepRoots: roots, stepRootAsked: ['starter_ltv'] } });
    const p = planTurn({ ...reads, checkerEventRows: [row] } as never, 'Got it.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
    expect(checkOf(p, 'code_gate')).toMatchObject({ detail: { decisions: [expect.objectContaining({ id: '1:code:0', outcome: 'released' })] } });
    expect(checkOf(p, 'step_root')).toMatchObject({ decision: 'act', detail: { codeLinked: [{ key: 'arithmetic@1205', span: flag.span }] } });
    expect(p.state.recomputeHint ?? '').not.toMatch(/Walk me through|Probe once/);
    // …without the root, code's probe goes in the hint as before.
    const q = planTurn({ ...readsFixture({ phase: 'EXHIBIT', caseId: 'pricing-001', revealed: rec.revealed, elapsedMs: rec.elapsedMs, flags: { pressureTest: PT } }), checkerEventRows: [row] } as never, 'Got it.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} }) as ModelPlan;
    expect(q.state.recomputeHint ?? '').toMatch(/Probe once — "You had .* as 1205\. Walk me through that calculation\."/);
  });
  it('prof-001: no step_root check, no roots, no question', () => {
    const p = plan({}, 'prof-001', 'COGS went from 42% to 58% of revenue, so that is 16 points, and beans are 25% of COGS so beans add about 20 points.');
    expect(checkOf(p, 'step_root')).toBeUndefined();
    expect(p.ctx.flags.stepRoots).toBeUndefined();
    expect(p.state.checkerLine).toBeNull();
  });
});

describe('the report and the recommendation re-flag', () => {
  const linkedRows: CheckerRow[] = [
    RAJ.rows.find(x => x.subtype === 'verdict' && (x.payloadJsonb as VerdictPayload).candidateTurnIndex === 17)!,
    // 17:1 linked with the root's one derived correction said already: the report.
    { category: 'math_checker', subtype: 'flag', turnIndex: 19, payloadJsonb: { ...atTurn(RAJ, 19, { stepRoots: rootsUpTo(RAJ, 19), derivedOnce: { 'step:starter_ltv': '15:9' } }).decisions.find(d => d.id === '17:1')! } },
  ];
  it('a linked claim: "built on starter_ltv\'s 405, flagged by the step check — left for this report"', () => {
    expect(formatCheckerSection(linkedRows as Parameters<typeof formatCheckerSection>[0])).toContain(`Not raised on its own: ${LINKED_405} — one correction per root, said already (15:9) — left for this report.`);
  });
  it('a linked key said again in the recommendation is not flagged there (closedErrorRestated): it is never probed', () => {
    const keys = { 'starter_value_with_upgrades@1205': { figures: [1205], since: 17 } };
    // (closedErrorRestated reads "$1205" — no thousands separator.)
    expect(closedErrorRestated('Starter is worth $1205 per sign-up.', ['starter_value_with_upgrades@1205'], keys, linkedRows)).toBeNull();
    const probed: CheckerRow[] = [linkedRows[0], { ...linkedRows[1], payloadJsonb: { ...(linkedRows[1].payloadJsonb as CheckerDecision), outcome: 'unresolved', reason: 'two probes on this step already (starter_value_with_upgrades) — left for the report', root: undefined } }];
    expect(closedErrorRestated('Starter is worth $1205 per sign-up.', ['starter_value_with_upgrades@1205'], keys, probed)).toMatchObject({ key: 'starter_value_with_upgrades@1205' });
  });
  it('roots carry their links (flags.stepRoots): a StepRoot is plain data', () => {
    const r: StepRoot = { step: 'starter_ltv', value: 405, figures: [405, 13.5], since: 11, linked: ['starter_value_with_upgrades@1205'] };
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
