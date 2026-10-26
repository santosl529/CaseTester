// Lorenzo, 15 Oct (batch-26 fix 1): Blake 4755c03a reached time-up with the
// exhibit owed on every turn and never shown, no brainstorm and no risk
// question, and no time warning. prof-001's exhibit is required; an owed
// exhibit, brainstorm and recommendation ask each have a deadline from the
// phase budgets; the time warning fires when the candidate's next message, at
// their own pace, would land past time-up.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', () => ({ db: new Proxy({}, { get: (_t, prop) => () => { throw new Error(`db.${String(prop)} used in plan`); } }) }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => null }));
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => [] }));
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({ ...(await orig<object>()), judgeProbeAnswer: async () => null, judgeStructureGiven: async () => null }));
vi.mock('@/lib/orchestrator/math-checker', async orig => ({ ...(await orig<object>()), checkMathClaims: () => new Promise(() => {}) }));

import { getCaseById } from '@/lib/cases/loader';
import { planTurn } from '@/lib/orchestrator/plan-turn';
import { resolvePhaseBudgets, stageDeadlinesMs, timeWarningDue, DEFAULT_TIME_WARNING_MS } from '@/lib/orchestrator/pacing';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { INITIAL_STAGES, type StageRecord } from '@/lib/orchestrator/stage-evidence';
import { readsFixture } from './fixtures/turn-reads';
import { codeFlagsOf, vettedFlag, verdictRow } from './helpers/checker-claim';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { turnData } from '@/lib/orchestrator/turn-data';
import { codeWrittenTurn } from '@/lib/orchestrator/session-runner';

const MIN = 60_000;
// Blake 4755c03a's candidate messages, minutes since the start (session clock).
const BLAKE = { t13: 10.773, t15: 12.316, t17: 13.856, t19: 15.392, t21: 16.931, t23: 18.476, t25: 20.02 };
const CORE = ['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'];
const ANSWERED = { delivered: true, deliveredAt: 2, outcome: 'answered' as const };
const SHOWN = { delivered: true, deliveredAt: 4, outcome: 'answered' as const };
// Blake t13's message: an analysis answer, no data ask, no recommendation.
const MSG = "Occupancy and overhead — I haven't touched either. Rent is the obvious one if they've been opening stores.";

// Coverage short of complete (Blake's: the end gate never opened on coverage), so only the deadline can ask.
const LOW = { structure: 20, quantitative: 20, dataExhibit: 20, judgment: 20, creativity: 20, synthesis: 20, communication: 20, pushback: 20 };

// landed: an earlier message (3) and the checker's flags on it (the gate releases code's lines on them).
function plan(o: { min: number; stages?: Partial<StageRecord>; shown?: boolean; revealed?: string[]; flags?: Record<string, unknown>; pt?: string; caseId?: string; text?: string; landed?: { text: string; claims: VettedClaim[] } }) {
  const reads = readsFixture({
    phase: 'ANALYSIS', elapsedMs: Math.round(o.min * MIN), revealed: o.revealed ?? ['labor_pct', 'overhead_pct'], caseId: o.caseId,
    flags: { pressureTest: { state: o.pt ?? 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, ...o.stages }, ...o.flags },
    extraTurns: o.landed ? [{ role: 'candidate', text: o.landed.text }, { role: 'interviewer', text: 'What would you look at next?' }] : [],
  });
  if (o.landed) reads.checkerEventRows = [verdictRow(3, o.landed.claims, codeFlagsOf(o.landed.text, o.revealed ?? ['labor_pct', 'overhead_pct'], o.caseId))] as never;
  if (o.shown) (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: 0 }];
  (reads.session as { coverageJsonb: unknown }).coverageJsonb = LOW;
  const p = planTurn(reads, o.text ?? MSG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
  if (p.kind !== 'model') throw new Error('expected a model plan');
  return p.state;
}

describe('stage deadlines from the phase budgets', () => {
  it("prof-001: the analysis budget ends at 11:20, the exhibit budget at 13:20, the brainstorm budget at 16:00", () => {
    const c = getCaseById('prof-001');
    expect(stageDeadlinesMs(resolvePhaseBudgets(c, caseTotalMs(c)))).toEqual({ analysisEnd: 680_000, exhibitEnd: 800_000, brainstormEnd: 960_000 });
  });
  it("prof-002's deadlines follow its own budgets (25-minute clock)", () => {
    const c = getCaseById('prof-002');
    expect(stageDeadlinesMs(resolvePhaseBudgets(c, caseTotalMs(c)))).toEqual({ analysisEnd: 630_000, exhibitEnd: 1_050_000, brainstormEnd: 1_320_000 });
  });
  it("prof-001's exhibit is required", () => {
    expect(getCaseById('prof-001').exhibits.find(e => e.id === 'exhibit-a')?.required).toBe(true);
  });
});

describe('Blake 4755c03a: the owed stages reach the candidate before time-up', () => {
  it('t13 (10:46): before the analysis budget is spent, the model asks', () => {
    expect(plan({ min: BLAKE.t13 }).kind).toBe('model');
  });
  it('t15 (12:19): the exhibit is still owed — code hands it over', () => {
    const s = plan({ min: BLAKE.t15 });
    expect(s.kind).toBe('stage_exhibit');
    expect(s.requiredExhibit).toBe('exhibit-a');
  });
  it('t15 with the exhibit and the COGS inputs out: the brainstorm is not due yet', () => {
    expect(plan({ min: BLAKE.t15, shown: true, revealed: CORE, stages: { exhibit: SHOWN } }).kind).toBe('model');
  });
  it('t17 (13:51): the exhibit is out, the COGS inputs not — code asks back to the analysis (Blake asked for them only at 16:56)', () => {
    expect(plan({ min: BLAKE.t17, shown: true, stages: { exhibit: SHOWN } }).kind).toBe('stage_analysis');
  });
  it('t15 with the exhibit out and the COGS inputs not: the core analysis is owed with the analysis budget too', () => {
    expect(plan({ min: BLAKE.t15, shown: true, stages: { exhibit: SHOWN } }).kind).toBe('stage_analysis');
  });
  it('t19 (15:24): the analysis was asked back to, the brainstorm still owed — code asks it', () => {
    expect(plan({ min: BLAKE.t19, shown: true, stages: { exhibit: SHOWN }, flags: { stagesEnforced: { analysis: true } } }).kind).toBe('stage_brainstorm');
    expect(plan({ min: BLAKE.t17, shown: true, revealed: CORE, stages: { exhibit: SHOWN } }).kind).toBe('stage_brainstorm');
  });
  it('t19 (15:24): the brainstorm is in — the model goes on', () => {
    expect(plan({ min: BLAKE.t19, shown: true, revealed: CORE, stages: { exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 18, outcome: 'answered' } } }).kind).toBe('model');
  });
  it('t21 (16:56): past the brainstorm budget with no recommendation ask — code asks for it, leaving a message for the risk question', () => {
    expect(plan({ min: BLAKE.t21, shown: true, revealed: CORE, stages: { exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 18, outcome: 'answered' } } }).kind).toBe('rec_ask');
  });
  it('t21 with the exhibit never out and the brainstorm owed: one stage a turn, the exhibit first', () => {
    expect(plan({ min: BLAKE.t21, revealed: CORE }).kind).toBe('stage_exhibit');
    expect(plan({ min: BLAKE.t21, revealed: CORE, shown: true, stages: { exhibit: SHOWN } }).kind).toBe('stage_brainstorm');
  });
  it('a stage code already administered is not administered again', () => {
    expect(plan({ min: BLAKE.t17, shown: true, stages: { exhibit: SHOWN }, flags: { stagesEnforced: { brainstorm: true, analysis: true } } }).kind).toBe('model');
  });
  it('no deadline while the pressure test is open', () => {
    expect(plan({ min: BLAKE.t15, pt: 'awaiting' }).kind).not.toBe('stage_exhibit');
  });
  it('under time pressure the deadlines administer nothing: the recommendation comes first', () => {
    expect(plan({ min: 19, flags: { timeWarningFired: true } }).kind).not.toMatch(/^stage_/);
  });
});

describe('the time warning at the candidate’s pace', () => {
  it('pure rule: inside the window, or inside the last exchange', () => {
    const at = (min: number, lastExchangeMs?: number) => timeWarningDue({ elapsedMs: min * MIN, totalMs: 20 * MIN, windowMs: DEFAULT_TIME_WARNING_MS, lastExchangeMs });
    expect(at(18.476)).toBe(false);
    expect(at(18.6)).toBe(true);
    expect(at(18.476, (18.476 - 16.931) * MIN)).toBe(true);
    expect(at(18.0, 60_000)).toBe(false);
    expect(at(20.02, 5 * MIN)).toBe(false);
  });
  // The recommendation was asked (by code's deadline at t21) but not given: the warning still fires.
  const asked = { exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 18, outcome: 'answered' as const }, recommendation: { delivered: true, deliveredAt: 22, asks: 1 } };
  it('Blake t23 (18:28.6, 1.4 s before the window): the previous message came 1:33 earlier, so the next lands past time-up — the warning fires', () => {
    expect(plan({ min: BLAKE.t23, shown: true, revealed: CORE, stages: asked, flags: { lastMessageElapsedMs: Math.round(BLAKE.t21 * MIN) } }).kind).toBe('time_warning');
  });
  it('a quicker candidate at the same clock gets no warning yet', () => {
    expect(plan({ min: BLAKE.t23, shown: true, revealed: CORE, stages: asked, flags: { lastMessageElapsedMs: Math.round((BLAKE.t23 - 0.8) * MIN) } }).kind).toBe('model');
  });
  it('no saved pace (a session before this field): the 90-second window alone', () => {
    expect(plan({ min: BLAKE.t23, shown: true, revealed: CORE, stages: asked }).kind).toBe('model');
    expect(plan({ min: 18.6, shown: true, revealed: CORE, stages: asked }).kind).toBe('time_warning');
  });
});

// The new cases: lead exhibits (no `after`) are due with the analysis budget;
// an exhibit ordered after another or after the brainstorm with the exhibit budget.
describe('ordered exhibits on the new cases', () => {
  const lb = (min: number, shown: string[], brainstorm: boolean) => {
    const reads = readsFixture({ caseId: 'launch-001', phase: 'EXHIBIT', elapsedMs: Math.round(min * MIN), revealed: ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'],
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: SHOWN, ...(brainstorm ? { brainstorm: { delivered: true, deliveredAt: 8, outcome: 'answered' as const } } : {}) } } });
    (reads as { exhibitRows: unknown[] }).exhibitRows = shown.map((exhibitId, i) => ({ id: `x${i}`, sessionId: 's1', exhibitId, shownAtMs: 0 }));
    const p = planTurn(reads, 'The year-one numbers break even.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p.state;
  };
  it("Hollis Bay's lead exhibits after its analysis budget (9:30): the first unshown one is handed over", () => {
    const s = lb(10, [], false);
    expect(s.kind).toBe('stage_exhibit');
    expect(s.requiredExhibit).toBe('exhibit-1');
  });
  it('its sampling exhibit (after the brainstorm) is not pulled forward at the analysis deadline…', () => {
    expect(lb(12, ['exhibit-1', 'exhibit-2'], true).kind).toBe('model');
  });
  it('…but is handed over once the exhibit budget is spent (16:00)', () => {
    const s = lb(16.5, ['exhibit-1', 'exhibit-2'], true);
    expect(s.kind).toBe('stage_exhibit');
    expect(s.requiredExhibit).toBe('exhibit-3');
  });
});

describe('the recommendation deadline yields to the time warning', () => {
  const byTime = (min: number) => {
    const reads = readsFixture({ phase: 'BRAINSTORM', elapsedMs: Math.round(min * MIN), revealed: CORE, flags: { timeWarningFired: true, pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 18, outcome: 'answered' } } } });
    (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: 0 }];
    const p = planTurn(reads, MSG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    return (p.ctx.checks.entries.find(c => c.check === 'end_rec_ask_gate')?.detail as { recAskByTime: boolean }).recAskByTime;
  };
  it('the deadline asks at 17 minutes, not under time pressure (the warning owns the last 90 seconds)', () => {
    expect(byTime(17)).toBe(true);
    expect(byTime(19)).toBe(false);
  });
});

describe('deadline guards found on the replay', () => {
  // batch 19 7bcf248 t15 (Victor, 11:3x): the pressure test was being waived; code's analysis line would have replaced the waiver turn.
  it('no analysis line or recommendation ask by deadline while the pressure test is open', () => {
    expect(plan({ min: 12, pt: 'awaiting', shown: true, stages: { exhibit: SHOWN } }).kind).toBe('model');
    const reads = readsFixture({ phase: 'BRAINSTORM', elapsedMs: 17 * MIN, revealed: CORE, flags: { pressureTest: { state: 'awaiting', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 8, outcome: 'answered' } } } });
    const p = planTurn(reads, MSG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    expect((p.ctx.checks.entries.find(c => c.check === 'end_rec_ask_gate')?.detail as { recAskByTime: boolean }).recAskByTime).toBe(false);
  });
  // batch 22 Larkspur 3801472 t15 (11:3x): the core route results not yet out, Exhibit 2 (after Exhibit 1) ready — it goes first.
  it('Larkspur past its analysis budget with the core owed: the ready exhibit before code\'s analysis line', () => {
    const reads = readsFixture({ caseId: 'prof-002', phase: 'ANALYSIS', elapsedMs: 12 * MIN, revealed: [],
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: SHOWN } } });
    (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-1', shownAtMs: 0 }];
    const p = planTurn(reads, 'The fare cut explains most of it.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    expect(p.state.kind).toBe('stage_exhibit');
    expect(p.state.requiredExhibit).toBe('exhibit-2');
  });
});

describe('a deadline yields to a math line', () => {
  // batch 24 4bf008f t17: code's period probe was due on the turn the brainstorm deadline passed.
  // Since the gate (16 Oct) code's flag goes out a turn after its message, once the checker flags it too.
  it('a deterministic flag released this turn: the model turn carries it, the stage waits a turn', () => {
    // (Since Lorenzo's batch-27 grade, 15 Oct, 4bf008f's own sentence — 25% of today's 58 — is no flag: a unit slip stands in for it.)
    const flagged = "Beans are 25% of COGS, so that's 25 points of revenue sitting in beans.";
    const s = plan({ min: BLAKE.t17, shown: true, revealed: CORE, stages: { exhibit: SHOWN }, landed: { text: flagged, claims: [vettedFlag('25 points of revenue', 10.5, { errorType: 'unit' })] } });
    expect(s.kind).toBe('model');
    expect(s.recomputeHint).toMatch(/points of what/);
    // On the flagged message itself nothing is said yet, so the deadline doesn't wait.
    expect(plan({ min: BLAKE.t17, shown: true, revealed: CORE, stages: { exhibit: SHOWN }, text: flagged }).kind).toBe('stage_brainstorm');
    expect(plan({ min: BLAKE.t17, shown: true, revealed: CORE, stages: { exhibit: SHOWN } }).kind).toBe('stage_brainstorm');
  });
});

// Lorenzo, 19 Oct (R7; batch 32 Aldermoor Marisol: a checker line every turn
// from 6:32 to 22:07, so the brainstorm was never asked and the survey exhibit
// came only with the time warning): "the correction and the overdue stage ask
// go in the same turn when they can; otherwise the stage goes the very next
// turn, with no further yield".
describe('a deadline yields to a checker line once (R7)', () => {
  const CLAIM = 'A 10% price increase recovers about 5 points of margin.';
  const PRICE: VettedClaim = vettedFlag('about 5 points', 8.5, {
    span: 'A 10% price increase recovers about 5 points of margin', quantity: 'margin gain', errorType: 'conceptual', unit: 'points',
    codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null },
    probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?',
    correctionLine: 'A 10% price rise lifts margin about 8.5 points, not 5.', correctionFigure: '8.5',
  });
  const PROBE = PRICE.probeLine!;
  const CORRECTION = PRICE.correctionLine!;
  // Blake's clock at 13:30 (past the exhibit budget, 13:20): the exhibit and the COGS inputs out, the brainstorm owed.
  const owed = (o: { flags?: Record<string, unknown>; claims?: VettedClaim[]; landedText?: string; codeFlags?: boolean; min?: number; coverage?: number } = {}) => {
    const reads = readsFixture({
      phase: 'EXHIBIT', elapsedMs: Math.round((o.min ?? 13.5) * MIN), revealed: CORE,
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: SHOWN }, ...o.flags },
      extraTurns: o.claims ? [{ role: 'candidate', text: o.landedText ?? CLAIM }, { role: 'interviewer', text: 'What would you look at next?' }] : [],
    });
    (reads as { exhibitRows: unknown[] }).exhibitRows = [{ id: 'x1', sessionId: 's1', exhibitId: 'exhibit-a', shownAtMs: 0 }];
    (reads.session as { coverageJsonb: unknown }).coverageJsonb = o.coverage ? Object.fromEntries(Object.keys(LOW).map(k => [k, o.coverage])) : LOW;
    if (o.claims) reads.checkerEventRows = [verdictRow(3, o.claims, o.codeFlags ? codeFlagsOf(o.landedText ?? CLAIM, CORE) : [])] as never;
    const p = planTurn(reads, MSG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p;
  };
  it('with no math line the stage fires on the first turn past the deadline (unchanged)', () => {
    const p = owed();
    expect(p.state.kind).toBe('stage_brainstorm');
    expect(p.ctx.flags.stageYielded).toBeUndefined();
  });
  it('a checker probe on two turns in a row: the first yields (the probe on the model turn), the second is the stage, the probe held', () => {
    const t1 = owed({ claims: [PRICE] });
    expect(t1.state.kind).toBe('model');
    expect(t1.state.recomputeHint).toContain(PROBE);
    expect(t1.ctx.flags.stageYielded).toEqual({ brainstorm: true });
    const t2 = owed({ claims: [PRICE], flags: { stageYielded: { brainstorm: true } } });
    expect(t2.state.kind).toBe('stage_brainstorm');
    expect((t2.ctx.flags.mathChecker as { held?: string }).held).toBe('3:0');
    expect(t2.state.checkerLine).toBeNull();
    expect(t2.state.stageCheckerLine).toBeNull();
    expect(t2.state.recomputeAttempts['pricing:gain@5']).toBeUndefined();
    expect((t2.ctx.flags.mathChecker as { handled: string[] }).handled).not.toContain('3:0');
  });
  it('a checker correction on the first turn past the deadline: no yield — the stage turn says it first, booked and closed', () => {
    const p = owed({ claims: [PRICE], flags: { recomputeAttempts: { 'pricing:gain@5': 1 } } });
    expect(p.state.kind).toBe('stage_brainstorm');
    expect(p.ctx.flags.stageYielded).toBeUndefined();
    expect(p.state.stageCheckerLine).toEqual({ id: '3:0', key: 'pricing:gain@5', line: CORRECTION });
    expect(p.state.checkerLine).toMatchObject({ id: '3:0', action: 'correct', line: CORRECTION });
    expect(p.state.recomputeAttempts['pricing:gain@5']).toBe(2);
    expect(p.ctx.flags.mathChecker).toMatchObject({ handled: ['3:0'], closed: ['pricing:gain@5'] });
    expect(p.state.derivedValueTexts).toContain('8.5');
  });
  it('a misquote correction due on the first turn past the deadline: no yield — the stage turn\'s data line carries it', () => {
    const MISQ = "Revenue grew about 19% over the period, so volume is clearly healthy — that's a decent sign demand isn't fragile.";
    const p = owed({ claims: [vettedFlag('about 19%', 15)], landedText: MISQ, codeFlags: true });
    expect(p.state.misquote).not.toBeNull();
    expect(p.state.kind).toBe('stage_brainstorm');
    expect(p.ctx.flags.stageYielded).toBeUndefined();
    // turn-data.ts: the stage turn's data line carries the correction.
    const data = turnData(p, { requests: [], exhibit: null, rescueItem: null });
    expect(data.correction).toMatchObject({ text: p.state.misquote!.text });
    expect(data.correction!.text).toMatch(/15/);
  });
  // Review fix 1 (controller, 19 Oct): overdue is the stage's deadline passed, whatever else made the turn.
  it('an overdue stage turn that coverage also makes: the correction still rides on it', () => {
    const p = owed({ claims: [PRICE], flags: { recomputeAttempts: { 'pricing:gain@5': 1 } }, coverage: 80 });
    expect(p.state.kind).toBe('stage_brainstorm');
    expect(p.state.stageCheckerLine).toEqual({ id: '3:0', key: 'pricing:gain@5', line: CORRECTION });
    expect(codeWrittenTurn(p, null).say).toBe(CORRECTION);
    expect(p.ctx.flags.mathChecker).toMatchObject({ handled: ['3:0'], closed: ['pricing:gain@5'] });
  });
  // Lorenzo, 19 Oct (round-2 ruling 1): the restatement of a root's live correction is a correction — it rides too.
  it('a claim built on a root corrected live: its restatement rides on the overdue stage turn, said first by code', () => {
    const BUILT = vettedFlag('11%', 14.5, { span: 'so margin goes 6 + 5 = 11%', quantity: 'new margin', errorType: 'conceptual', unit: '%',
      codeQuantity: { kind: 'new_margin', stepId: null, price: 10, target: null }, probeLine: 'Walk me through how you got to 11%.' });
    const p = owed({ claims: [PRICE, BUILT], landedText: `${CLAIM} So margin goes 6 + 5 = 11%.`, flags: { mathChecker: { handled: ['3:0'], keys: { 'pricing:gain@5': { figures: [5], since: 3 } }, closed: ['pricing:gain@5'], corrected: { 'pricing:gain@5': { line: CORRECTION, figure: '8.5' } } } } });
    expect(p.state.kind).toBe('stage_brainstorm');
    expect(p.ctx.flags.stageYielded).toBeUndefined();
    expect(p.state.stageCheckerLine).toEqual({ id: '3:1', key: 'pricing:gain@5', line: CORRECTION });
    expect(codeWrittenTurn(p, null).say).toBe(CORRECTION);
    expect(p.ctx.flags.mathChecker).toMatchObject({ handled: ['3:0', '3:1'], restated: ['pricing:gain@5'] });
  });
  // Lorenzo, 22 Oct (the Phase 1 fault bank, b35q-marisol-t26-correction): a
  // stage turn coverage makes before the deadline is still a turn the model
  // never ran, and until now the correction was not waiting there — it was
  // dropped (b37q Raj's live run: 19:0 on the t24 exhibit turn, then expired;
  // 21:0 on the t26 recommendation ask). It rides on the turn like an overdue
  // one; only the probe waits.
  it('a stage turn coverage makes before its deadline (12:00): the correction rides on it too', () => {
    const p = owed({ claims: [PRICE], flags: { recomputeAttempts: { 'pricing:gain@5': 1 } }, coverage: 80, min: 12 });
    expect(p.state.kind).toBe('stage_brainstorm');
    expect(p.state.stageCheckerLine).toEqual({ id: '3:0', key: 'pricing:gain@5', line: CORRECTION });
    expect(codeWrittenTurn(p, null).say).toBe(CORRECTION);
    expect(p.ctx.flags.mathChecker).toMatchObject({ handled: ['3:0'], closed: ['pricing:gain@5'] });
  });
  // Review fix 3 (controller's ruling on R7): code's own correction is a correction — it rides; code's probe yields once.
  it("code's own unit line: its probe yields the deadline once; past the probe its correction rides on the stage turn", () => {
    const flagged = "Beans are 25% of COGS, so that's 25 points of revenue sitting in beans.";
    const unit = [vettedFlag('25 points of revenue', 10.5, { errorType: 'unit' })];
    const t1 = owed({ claims: unit, landedText: flagged, codeFlags: true });
    expect(t1.state.kind).toBe('model');
    expect(t1.state.recomputeHint).toMatch(/points of what/);
    expect(t1.ctx.flags.stageYielded).toEqual({ brainstorm: true });
    const key = Object.keys(t1.state.recomputeAttempts).find(k => t1.state.recomputeAttempts[k] === 1)!;
    const t2 = owed({ claims: unit, landedText: flagged, codeFlags: true, flags: { recomputeAttempts: { [key]: 1 } } });
    expect(t2.state.kind).toBe('stage_brainstorm');
    expect(t2.ctx.flags.stageYielded).toBeUndefined();
    expect(t2.state.stageCodeLines).toHaveLength(1);
    expect(codeWrittenTurn(t2, null).say).toBe(t2.state.stageCodeLines[0]);
    expect(t2.state.recomputeAttempts[key]).toBe(2);
    const figures = t2.state.stageCodeLines[0].match(/\d+(?:\.\d+)?/g) ?? [];
    for (const f of figures) expect(t2.state.derivedValueTexts).toContain(f);
  });
  // Engine-asks final review (19 Oct; PRD §5.2): code's own probe released on a
  // deadline-made stage turn is held for the next model turn, like the
  // checker's — no model reads its hint there, and the code-written turn says
  // only corrections. It stays out of the gate's handled ids and the attempt
  // count, so it is re-gated and said on the next model turn.
  it("code's own probe released on a deadline-made stage turn: held — not handled, no attempt — and said on the next model turn", () => {
    const flagged = "Beans are 25% of COGS, so that's 25 points of revenue sitting in beans.";
    const unit = [vettedFlag('25 points of revenue', 10.5, { errorType: 'unit' })];
    const t2 = owed({ claims: unit, landedText: flagged, codeFlags: true, flags: { stageYielded: { brainstorm: true } } });
    expect(t2.state.kind).toBe('stage_brainstorm');
    expect(t2.state.stageCodeLines).toEqual([]);
    expect(codeWrittenTurn(t2, null).say).toBe('');
    expect(t2.state.recomputeAttempts).toEqual({});
    expect((t2.ctx.flags.codeGate as { handled?: string[] } | undefined)?.handled ?? []).not.toContain('3:code:0');
    // The next model turn (the brainstorm asked meanwhile): the gate releases it again and the model says it.
    const t3 = owed({ claims: unit, landedText: flagged, codeFlags: true, flags: {
      stageYielded: { brainstorm: true }, codeGate: t2.ctx.flags.codeGate, mathChecker: t2.ctx.flags.mathChecker, recomputeAttempts: t2.state.recomputeAttempts,
      stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 6, outcome: 'answered' as const } },
    } });
    expect(t3.state.kind).toBe('model');
    expect(t3.state.recomputeHint).toMatch(/points of what/);
    expect(Object.values(t3.state.recomputeAttempts)).toEqual([1]);
    expect((t3.ctx.flags.codeGate as { handled: string[] }).handled).toContain('3:code:0');
  });
  // Engine-asks round 2 (Lorenzo, 19 Oct, ruling 6; the round-1 final re-review):
  // the checker plan reads the gate's outcomes before the turn kind is known, so
  // code's held probe read as released there and the checker's claim on it was
  // deduped though code said nothing. Held, it dedupes nothing that turn; the
  // next model turn re-gates it (exempt from the wait) and the dedupe happens then.
  it("code's probe held on a stage turn: the checker's claim on it isn't deduped that turn; the next model turn says code's probe and dedupes it", () => {
    const BARE = { ...PRICE, correctionLine: null, correctionFigure: null };
    const t2 = owed({ claims: [BARE], codeFlags: true, flags: { stageYielded: { brainstorm: true } } });
    expect(t2.state.kind).toBe('stage_brainstorm');
    expect(t2.state.recomputeAttempts).toEqual({});
    expect((t2.ctx.flags.codeGate as { handled?: string[]; held?: string[] }).held).toEqual(['3:code:0']);
    expect((t2.ctx.flags.mathChecker as { handled?: string[] } | undefined)?.handled ?? []).not.toContain('3:0');
    const t3 = owed({ claims: [BARE], codeFlags: true, flags: {
      stageYielded: { brainstorm: true }, codeGate: t2.ctx.flags.codeGate, mathChecker: t2.ctx.flags.mathChecker, recomputeAttempts: t2.state.recomputeAttempts,
      stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, exhibit: SHOWN, brainstorm: { delivered: true, deliveredAt: 6, outcome: 'answered' as const } },
    } });
    expect(t3.state.kind).toBe('model');
    expect(t3.state.recomputeHint).not.toContain(BARE.probeLine);
    expect(Object.values(t3.state.recomputeAttempts)).toEqual([1]);
    expect((t3.ctx.flags.mathChecker as { handled: string[] }).handled).toContain('3:0');
  });
});

// Review fix 4 (controller, 19 Oct): an exhibit's yield is keyed by the exhibit it was for.
describe('an exhibit deadline yields once per exhibit', () => {
  const PROBE_CLAIM = vettedFlag('about 2 million bags', 1.2, { span: 'we sell about 2 million bags', probeLine: 'Walk me through how you got to about 2 million bags.', errorType: 'conceptual' });
  const hb = (shown: string[], flags: Record<string, unknown> = {}) => {
    const reads = readsFixture({ caseId: 'launch-001', phase: 'EXHIBIT', elapsedMs: 10 * MIN, revealed: ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent', 'planning_assumptions'],
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED, ...(shown.length ? { exhibit: SHOWN } : {}) }, ...flags },
      extraTurns: [{ role: 'candidate', text: 'In year one we sell about 2 million bags.' }, { role: 'interviewer', text: 'What would you look at next?' }] });
    (reads as { exhibitRows: unknown[] }).exhibitRows = shown.map((exhibitId, i) => ({ id: `x${i}`, sessionId: 's1', exhibitId, shownAtMs: 0 }));
    (reads.session as { coverageJsonb: unknown }).coverageJsonb = LOW;
    reads.checkerEventRows = [verdictRow(3, [PROBE_CLAIM])] as never;
    const p = planTurn(reads, 'The year-one numbers break even.', { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p;
  };
  it("Hollis Bay at 10:00 with a probe due: exhibit-1's deadline yields, keyed by exhibit-1", () => {
    const p = hb([]);
    expect(p.state.kind).toBe('model');
    expect(p.ctx.flags.stageYielded).toEqual({ exhibit: 'exhibit-1' });
  });
  it('exhibit-1 still owed after its yield: it goes, the probe held', () => {
    const p = hb([], { stageYielded: { exhibit: 'exhibit-1' } });
    expect(p.state.kind).toBe('stage_exhibit');
    expect(p.state.requiredExhibit).toBe('exhibit-1');
    expect((p.ctx.flags.mathChecker as { held?: string }).held).toBe('3:0');
  });
  it('exhibit-1 handed over meanwhile (by the model): exhibit-2 gets its own yield', () => {
    const p = hb(['exhibit-1'], { stageYielded: { exhibit: 'exhibit-1' } });
    expect(p.state.kind).toBe('model');
    expect(p.ctx.flags.stageYielded).toEqual({ exhibit: 'exhibit-2' });
  });
});

// Engine-asks final review (19 Oct): plan-turn hands the gate's decisions —
// earlier turns' code_gate rows and this turn's — to the checker plan: a code
// flag the gate didn't release dedupes nothing.
describe("the checker's claim stands when the gate held code's line", () => {
  const CLAIM = 'A 10% price increase recovers about 5 points of margin.';
  const PRICE: VettedClaim = vettedFlag('about 5 points', 8.5, {
    span: 'A 10% price increase recovers about 5 points of margin', quantity: 'margin gain', errorType: 'conceptual', unit: 'points',
    codeQuantity: { kind: 'gain', stepId: null, price: 10, target: null },
    probeLine: 'You said a 10% price rise recovers about 5 points. Which cost lines did you include?',
  });
  const run = (gateRow: string | null) => {
    const reads = readsFixture({
      phase: 'ANALYSIS', elapsedMs: 8 * MIN, revealed: CORE,
      flags: { pressureTest: { state: 'satisfied', askedAt: 2 }, stageEvidence: { ...INITIAL_STAGES, structure: ANSWERED, pressure_test: ANSWERED }, ...(gateRow ? { codeGate: { handled: ['3:code:0'] } } : {}) },
      extraTurns: [{ role: 'candidate', text: CLAIM }, { role: 'interviewer', text: 'What would you look at next?' }],
    });
    const codeFlags = codeFlagsOf(CLAIM, CORE);
    expect(codeFlags.map(f => f.key)).toEqual(['pricing:gain@5']);
    reads.checkerEventRows = [verdictRow(3, [PRICE], codeFlags),
      ...(gateRow ? [{ id: 'g3', sessionId: 's1', category: 'math_checker', subtype: 'code_gate', turnIndex: 4, phase: 'ANALYSIS', payloadJsonb: { id: '3:code:0', candidateTurnIndex: 3, outcome: gateRow } }] : [])] as never;
    (reads.session as { coverageJsonb: unknown }).coverageJsonb = LOW;
    const p = planTurn(reads, MSG, { sessionId: 's1', now: Date.now(), turnStartMs: Date.now(), later: () => {} });
    if (p.kind !== 'model') throw new Error('expected a model plan');
    return p;
  };
  it('released this turn: code says its probe, the checker\'s claim is deduped (unchanged)', () => {
    const p = run(null);
    expect(p.state.recomputeHint).not.toContain(PRICE.probeLine);
    expect((p.ctx.flags.mathChecker as { handled: string[] }).handled).toContain('3:0');
  });
  it('ruled not_rated on an earlier turn (the claim left waiting): the checker\'s probe goes out', () => {
    const p = run('not_rated');
    expect(p.state.recomputeHint).toContain(PRICE.probeLine);
  });
});

