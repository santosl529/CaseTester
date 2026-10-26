// Phase 1 4.8 (`closeWaitMitigation`; Lorenzo, 22 Oct: "close_wait: don't ask for a mitigation if the candidate's last
// answer already gave one (action words: phase / stage / pilot / test / trigger / validate / hedge…), or if the last
// question already asked what they'd do."). Answers verbatim from the batch 34–38 close_wait turns.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { closeWaitLine } from '@/lib/orchestrator/close-hold';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';

vi.mock('@/db/client', () => ({ db: {} }));

const RISK_Q = "What's the single biggest risk to that recommendation?";
const pool = (t: string) => (Object.keys(PHRASE_POOLS) as (keyof typeof PHRASE_POOLS)[])
  .find(k => ['after_risk', 'first_step', 'measure'].includes(k) && (PHRASE_POOLS[k] as readonly string[]).includes(t));
const on = (answer: string, q = RISK_Q) => pool(closeWaitLine(q, 's1:30', undefined, { answer, skipAnswered: true }));
const off = (answer: string, q = RISK_Q) => pool(closeWaitLine(q, 's1:30', undefined, { answer }));

// The answers the follow-up re-asked (hand gradings b34l, b35h, b36a, b36l, b37h, b37q, b38l).
const GAVE_MITIGATION = [
  // b37 Hollis Bay Marcus t25.
  "I'd mitigate by locking retailer commitments before committing the roasting line spend, and staging marketing so the back half is spendable or cuttable based on 12-week velocity.",
  // b37 Quillpath Marisol t31.
  'Protection: roll $60 out to a fraction of traffic and hold a $40 control for nine months, long enough to see the month 3–9 upgrade window. Gate full rollout on the upgrade rate holding above roughly 15%.',
  // b36 Larkspur Raj t29.
  "What I'd do is reduce the attractiveness of following us: price at a defensible level rather than at a fat premium, build loyalty and corporate contracts early, and lock in slot or gate advantages at the new airports if available.  And I'd set a trigger — if they announce either city, we reassess immediately rather than matching fares reflexively.",
  // b35 Hollis Bay Marcus t25.
  "How I'd hedge before committing: in-home taste testing against the leading chickpea competitor and against Hollis Bay's own chips, with a repeat-intent question, not just a liking score.",
  // b38 Larkspur Tyler t29 (re-asked by the first-step line).
  'Mitigation, in order: validate demand before committing — booking data, connecting volumes through the hub, survey work on those city pairs. Then phase it, as I said: Lakeport\'s 2,000 flights first, hold Port Avery, and judge the real ramp before moving the rest.',
  // b36 Aldermoor Raj t33.
  'structure variable so the downside is survivable. Year one through a contract sales organization, converting only once coverage is secured; stage the 60 reps in waves tied to payer wins, not a calendar.',
];

describe('4.8: close_wait skips a mitigation the answer already gave', () => {
  it('switch on: an answer with an action word never gets the mitigation ask', () => {
    for (const a of GAVE_MITIGATION) expect(on(a)).not.toBe('after_risk');
  });
  it('switch on: the first step is skipped too when the answer sequenced it (b38 Tyler t29 "Lakeport\'s 2,000 flights first"); otherwise asked', () => {
    expect(on(GAVE_MITIGATION[4])).toBe('measure');
    expect(on(GAVE_MITIGATION[0])).toBe('measure'); // "before committing"
    expect(on(GAVE_MITIGATION[1])).toBe('first_step'); // b37q Marisol t31: a protection, no first step named
  });
  it('switch off: today\'s choice, unchanged (the mitigation ask after a risk question)', () => {
    for (const a of GAVE_MITIGATION) expect(off(a)).toBe('after_risk');
  });
  it('a risk with no mitigation still gets the mitigation ask (b38 Jasmine t23, not a re-ask)', () => {
    expect(on('Biggest risk: the new routes ramp slower than 60%.  I\'m done — can we do another case?')).toBe('after_risk');
  });
  it('the last question already asked what they\'d do: no mitigation ask, whatever the answer', () => {
    expect(on('Probably the payer response.', 'And what would you do about that risk?')).toBe('measure');
    expect(off('Probably the payer response.', 'And what would you do about that risk?')).toBe('first_step');
  });
  // Review fix round, item 4 (Stream 4b's review): the action-word test matched a bare noun, so an answer that
  // mentioned a "test" or a "gate" skipped the mitigation ask it had never given.
  const BARE_NOUNS = [
    // b32 Aldermoor Marisol t29, verbatim: the board's $300M hurdle, named as a test.
    'One caution: the $300 million board test is on net sales, and both options clear it at the top line.',
    "The board's bar is really a net-price-times-share test, so the headroom is thin.",
    'The gate here is payer coverage, not our own capacity.',
  ];
  it('switch on: a bare noun ("board test", "the gate") is no mitigation — the ask stands', () => {
    for (const a of BARE_NOUNS) expect(on(a)).toBe('after_risk');
  });
  it('switch on: a bare "first" is no sequencing — the first-step line still goes', () => {
    expect(on('The risk is that the first-mover advantage is gone.', 'What would you tell the CEO?')).toBe('first_step');
    expect(on('Port Avery is the first city a competitor would attack.', 'What would you tell the CEO?')).toBe('first_step');
    // …and real sequencing still skips it.
    expect(on('First, lock the retailer commitments. Then spend the marketing.', 'What would you tell the CEO?')).toBe('measure');
    expect(on("I'd start with the two biggest routes.", 'What would you tell the CEO?')).toBe('measure');
  });
  it('no risk question, no action word: the first-step line as today', () => {
    expect(on('Keep Starter, move it to $60: it\'s net value-accretive even after cannibalization.', 'What would you tell the CEO?')).toBe('first_step');
  });
});

describe('4.8 through the switch, on a code-written close_wait turn', () => {
  const saved = process.env.ENGINE_SWITCHES;
  afterEach(() => { if (saved === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = saved; });
  it('codeWrittenTurn reads closeWaitMitigation for the case', async () => {
    const { codeWrittenTurn } = await import('@/lib/orchestrator/session-runner');
    const plan = (caseId: string) => ({
      ctx: { sessionId: 's1', nextTurnIndex: 30, candidateText: GAVE_MITIGATION[0], currentPhase: 'RECOMMENDATION', flags: {} },
      state: { kind: 'close_wait', lastQuestion: RISK_Q, caseData: { id: caseId }, stageCodeLines: [], stageCheckerLine: null },
    }) as never;
    delete process.env.ENGINE_SWITCHES;
    expect(pool(codeWrittenTurn(plan('launch-001'), []).question)).toBe('after_risk');
    process.env.ENGINE_SWITCHES = 'launch-001=closeWaitMitigation';
    expect(pool(codeWrittenTurn(plan('launch-001'), []).question)).toBe('measure');
    expect(pool(codeWrittenTurn(plan('prof-002'), []).question)).toBe('after_risk');
  });
});

describe('4.8: a close_wait follow-up is no probe of a figure', () => {
  it('the measure line\'s "six months" is taken out of the words the checker counts as probes', async () => {
    const { withoutCloseWaitLines } = await import('@/lib/orchestrator/phrasing');
    const { probesOf } = await import('@/lib/orchestrator/math-checker-live');
    const said = 'Six months in, how would you know it was working?';
    expect(probesOf([6], [said], [6])).toBe(1); // today: read as a probe of a 6 (b31 Sofia e0f7d46c t24)
    expect(probesOf([6], [withoutCloseWaitLines(said)], [6])).toBe(0);
    expect(withoutCloseWaitLines("What would tell you, 6 months in, that it was working?").trim()).toBe("");
    expect(withoutCloseWaitLines('You said 6%. How did you get there?')).toBe('You said 6%. How did you get there?');
  });
  // Review fix round, item 4: the strip was a literal, case-sensitive split, so re-wrapping or recasing one of the
  // three pools' lines would silently stop stripping it. It is a pattern over the pools now.
  it('the strip is a pool pattern: a re-wrapped or recased line still goes', async () => {
    const { withoutCloseWaitLines } = await import('@/lib/orchestrator/phrasing');
    expect(withoutCloseWaitLines('Six months in,\n   how would you know it was working?').trim()).toBe('');
    expect(withoutCloseWaitLines('six months in, how would you know it was working?').trim()).toBe('');
    expect(withoutCloseWaitLines('How  would you guard against that?').trim()).toBe('');
    expect(withoutCloseWaitLines("What's the first step you'd want the client to take?").trim()).toBe('');
  });
});
