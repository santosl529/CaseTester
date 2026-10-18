// The say-suppression rule after the voice's acknowledgment (Lorenzo's voice
// test, 17 Oct): no second acknowledgment, no echo of the candidate's point
// without a figure; never a figure, the checker's line, pushback or an answer.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sayAfterAckReason, hasFigure, isSummaryEcho, sayFiguresOf } from '@/lib/orchestrator/say-after-ack';
import { candidateFiguresOf } from '@/lib/orchestrator/math-talk';
import { getCaseById } from '@/lib/cases/loader';
import { vetoReason, dropAckOpening, type GateContext } from '@/lib/orchestrator/stream-turn';

type Row = { run: string; turnIndex: number; candidate: string | null; sentence: string; expect: 'drop' | 'keep' | 'either' };
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/say-after-ack-batch30.json'), 'utf8')) as { sentences: Row[] };
const earlier = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/say-after-ack-batch27-29.json'), 'utf8')) as { sentences: Row[] };
const DROPPED = ['double_ack', 'echo_after_ack'];
// prof-001's figures (prompt and every ledger value — a superset of what was
// revealed) and the candidate's own, as gateContext gives them.
const prof = getCaseById('prof-001') as unknown as { prompt: string; dataLedger: { value: unknown }[] };
const caseTexts = [prof.prompt, ...prof.dataLedger.map(i => String(i.value))];
const reasonFor = (sentence: string, candidate: string) =>
  sayAfterAckReason(sentence, { candidateMessage: candidate, figures: sayFiguresOf(caseTexts, candidateFiguresOf([candidate], caseTexts)) });

describe('batch 30: every model "say" sentence, as if the voice had acknowledged', () => {
  const asserted = fixture.sentences.filter(r => r.expect !== 'either');
  it('covers the batch (139 sentences, 121 to drop)', () => {
    expect(fixture.sentences).toHaveLength(139);
    expect(asserted.filter(r => r.expect === 'drop')).toHaveLength(121);
  });
  it.each(asserted.map(r => [r.expect, r.sentence, r.run, r.turnIndex, r.candidate ?? ''] as const))('%s: "%s" (%s t%d)', (want, sentence, _run, _t, candidate) => {
    const reason = reasonFor(sentence, candidate);
    if (want === 'drop') expect(DROPPED).toContain(reason);
    else expect(reason).toBeNull();
  });
});

// Batches 27–29 (labelled 17 Oct, after the rule was written): nothing labelled
// keep is ever dropped; most echoes are, and the misses are listed.
const KNOWN_MISSES = new Set([
  'Sourcing and menu levers, with price doing the heavy lifting.', 'Store-level versus corporate, cost first.', "That's a broad set of options.",
  'Two angles: input mix and unit cost versus usage.', 'You dropped the spoilage idea based on the numbers.',
  "You said volume is elastic and you'd test price increases in a subset of stores first.",
  'You separated confirmed from assumed, and the assumed inputs are benchmarks.', "You'd start with the largest line that has moved most.",
]);
describe('batches 27–29: every model "say" sentence, as if on a voice turn', () => {
  const rows = earlier.sentences;
  it('covers the batches (293 sentences: 271 drop, 21 keep, 1 either)', () => {
    expect(rows).toHaveLength(293);
    expect(rows.filter(r => r.expect === 'drop')).toHaveLength(271);
  });
  it.each(rows.filter(r => r.expect === 'keep').map(r => [r.sentence, r.run, r.turnIndex, r.candidate ?? ''] as const))('never drops a keep: "%s" (%s t%d)', (sentence, _r, _t, candidate) => {
    expect(reasonFor(sentence, candidate)).toBeNull();
  });
  it('drops every other echo — the misses are exactly the listed ones', () => {
    const missed = rows.filter(r => r.expect === 'drop' && !DROPPED.includes(reasonFor(r.sentence, r.candidate ?? '') ?? '')).map(r => r.sentence);
    expect([...new Set(missed)].sort()).toEqual([...KNOWN_MISSES].sort());
    expect(missed.length).toBe(8);   // of 271 drops: recall 263/271 = 97%
  });
});

describe('structure counts are not figures (Lorenzo, 17 Oct: session 9ccf0836 t25 "A three-bucket list." survived)', () => {
  const figs = [42, 58, 25, 40, 37.5, 15, 24, 6, 200];
  it.each([
    'A three-bucket list.', 'A cleaner two-branch split.', 'Four levers, ranked.', 'A revised four-part structure.', 'Three ideas across cost and price.',
  ])('not a figure, even when the candidate said the count: %s', s => {
    expect(hasFigure(s, [...figs, 2, 3, 4])).toBe(false);
    if (/^an?\s/i.test(s)) expect(sayAfterAckReason(s, { candidateMessage: 'I grouped them into three buckets. First, price.', figures: [...figs, 3] })).toBe('echo_after_ack');
  });
  it.each([
    ['COGS went from 42 to 58.', true], ['A 16-point rise.', true], ['About a $7 ticket.', true], ['Forty percent on beans.', true],
    ['Beans are maybe half of COGS.', true], ['Over 200 stores.', true], ['Costs held in dollars.', false], ['Two years of flat prices.', false],
  ] as const)('a percentage, points, money, a share, or a case figure is protected: %s', (s, want) => {
    expect(hasFigure(s, figs)).toBe(want);
  });
});

// The four model lines after an ack in session 314295e0.
describe("Lorenzo's voice session 314295e0 (17 Oct)", () => {
  const T2 = "So I'd want to look at this from a couple of angles. Um, the first one is I need to figure out, um, if there, um, actual revenue is changing. So, um, yeah, we've seen that it's fifteen percent in growth. Um, and because it's growing, um, but their profits are margin... profit margin is, like, declining. That most likely means that there is, um, some problem with their costs.";
  it('drops the echoes', () => {
    expect(sayAfterAckReason('A cost-first view, with revenue as a second branch.', { candidateMessage: T2 })).toBe('echo_after_ack');
    expect(sayAfterAckReason('A volume check.', { candidateMessage: 'Okay. So many phrases have not changed, but net profit can still rise even if many prices are changing if the volume is increasing. So could you tell me if there\'s anything about that?' })).toBe('echo_after_ack');
  });
  it('keeps the echo with a spelled figure', () => {
    expect(sayAfterAckReason('A sixteen-point rise, and a relative increase on top.', { candidateMessage: "So that's a sixteen point increase." })).toBeNull();
  });
  it('keeps the answer to his question', () => {
    expect(sayAfterAckReason('MECE means mutually exclusive, collectively exhaustive.', { candidateMessage: 'Uh, what does miss mean?' })).toBeNull();
    expect(sayAfterAckReason('Mutually exclusive, collectively exhaustive.', { candidateMessage: 'Uh, what does miss mean?' })).toBeNull();
  });
});

describe('never dropped', () => {
  it.each([
    'Okay, 58% is the figure today.',            // an ack word before a figure (dropped whole before 17 Oct)
    'Understood, sixteen points.',
    'Right, COGS doubled.',
    'A 16-point rise.',
    'You said forty percent.',
    'A $7 ticket.',
  ])('a figure: %s', s => {
    expect(hasFigure(s)).toBe(true);
    expect(sayAfterAckReason(s, { candidateMessage: 'COGS went from 42 to 58.' })).toBeNull();
  });
  it.each([
    "You haven't looked at revenue yet.",
    "You've assumed beans drive it, but the inputs say otherwise.",
    "You've only looked at one side.",
    "You're not counting labor.",
    "That's a lot resting on assumed inputs.",
    'Not quite.',
    'Menu pricing is the piece still open.',
    'Walk me through that calculation.',
    "You're jumping to a recommendation before we've tested the structure.",   // batch 28, held out
    'Understood, a benchmark, not client data.',                              // batch 28, held out: an ack word before pushback
    'Take your time.',
    'No need to apologize.',
  ])('pushback, a steer, an instruction or comfort: %s', s => {
    expect(sayAfterAckReason(s, { candidateMessage: 'I would look at costs first, especially COGS.' })).toBeNull();
  });
  it("the checker's line, even when it reads like a description", () => {
    const probe = "You've used total revenue as the base there.";
    expect(sayAfterAckReason(probe, { candidateMessage: 'I used revenue as the base.', checkerLine: probe })).toBeNull();
    expect(sayAfterAckReason("You've used total revenue as the base there.", { candidateMessage: 'I used revenue as the base.' })).toBe('echo_after_ack');
  });
});

describe('isSummaryEcho', () => {
  it('a noun phrase built from their words, without an article', () => {
    expect(isSummaryEcho('Revenue and cost, then COGS, labor, rent and overhead.', "I'd split it into revenue and cost, then COGS, labor, rent and overhead.")).toBe(true);
    expect(isSummaryEcho('Procurement and supplier terms.', "I'd look at costs first.")).toBe(false);
  });
  it('never a question', () => expect(isSummaryEcho('A cost-first view?', 'costs')).toBe(false));
});

describe('vetoReason on an acknowledged turn', () => {
  const g = (over: Partial<GateContext> = {}): GateContext => ({
    allowedTexts: ['COGS is 58% of revenue.'], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false,
    openItems: [], phase: 'ANALYSIS', acknowledged: true, candidateMessage: "I'd look at costs first, so COGS.", ...over,
  });
  it('drops an echo on a voice turn, acknowledged or not (17 Oct), never on a text turn', () => {
    expect(vetoReason('A COGS-first read.', g())).toBe('echo_after_ack');
    expect(vetoReason('A COGS-first read.', g({ acknowledged: false, voice: true }))).toBe('echo_after_ack');
    expect(vetoReason('Understood.', g({ acknowledged: false, voice: true }))).toBe('double_ack');
    expect(vetoReason('A COGS-first read.', g({ acknowledged: false }))).toBeNull();
    expect(vetoReason('Understood.', g({ acknowledged: false, voice: false }))).toBeNull();
  });
  it('the question field is never touched by the echo rule', () => {
    expect(vetoReason('A COGS-first read.', g(), { inQuestion: true })).toBeNull();
  });
  // Session 9ccf0836 T30 (17 Oct): the stuck filler "Take your time.", then the
  // model's question opening with the same words — "Take your time. Take your time. …".
  it('the filler the voice just said, again in the question or in say: dropped', () => {
    const ack = g({ ackText: 'Take your time.' });
    expect(vetoReason('Take your time.', ack, { inQuestion: true })).toBe('double_ack');
    expect(vetoReason('Take your time.', ack)).toBe('double_ack');
    expect(vetoReason('Take a moment.', g({ ackText: 'Sure, take a moment.' }), { inQuestion: true })).toBe('double_ack');
    expect(vetoReason('Ten points of COGS convert to revenue using one share of revenue.', ack, { inQuestion: true })).toBeNull();
    // Another filler: kept (a comfort line the voice didn't say).
    expect(vetoReason('Take your time.', g({ ackText: 'Hmm…' }), { inQuestion: true })).toBeNull();
    // A text turn has no filler.
    expect(vetoReason('Take your time.', g({ acknowledged: false, voice: false }), { inQuestion: true })).toBeNull();
  });
  it("code's own stall line drops an opening the filler already said", () => {
    expect(dropAckOpening('Take your time. The question on the table: which input drove it?', 'Take your time.')).toBe('The question on the table: which input drove it?');
    expect(dropAckOpening('Take your time. The question on the table: which input drove it?', 'Hmm…')).toBe('Take your time. The question on the table: which input drove it?');
    expect(dropAckOpening('Take your time.', 'Take your time.')).toBe('Take your time.');
    expect(dropAckOpening('Take your time. Which input?', undefined)).toBe('Take your time. Which input?');
  });
  it("keeps the checker's line from the gate context", () => {
    expect(vetoReason("You've used revenue as the base.", g({ checkerLine: "You've used revenue as the base." }))).toBeNull();
  });
});
