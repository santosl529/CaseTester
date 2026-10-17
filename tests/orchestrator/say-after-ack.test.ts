// The say-suppression rule after the voice's acknowledgment (Lorenzo's voice
// test, 17 Oct): no second acknowledgment, no echo of the candidate's point
// without a figure; never a figure, the checker's line, pushback or an answer.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sayAfterAckReason, hasFigure, isSummaryEcho } from '@/lib/orchestrator/say-after-ack';
import { vetoReason, type GateContext } from '@/lib/orchestrator/stream-turn';

type Row = { run: string; turnIndex: number; candidate: string | null; sentence: string; expect: 'drop' | 'keep' | 'either' };
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/say-after-ack-batch30.json'), 'utf8')) as { sentences: Row[] };
const DROPPED = ['double_ack', 'echo_after_ack'];

describe('batch 30: every model "say" sentence, as if the voice had acknowledged', () => {
  const asserted = fixture.sentences.filter(r => r.expect !== 'either');
  it('covers the batch (139 sentences, 121 to drop)', () => {
    expect(fixture.sentences).toHaveLength(139);
    expect(asserted.filter(r => r.expect === 'drop')).toHaveLength(121);
  });
  it.each(asserted.map(r => [r.expect, r.sentence, r.run, r.turnIndex, r.candidate ?? ''] as const))('%s: "%s" (%s t%d)', (want, sentence, _run, _t, candidate) => {
    const reason = sayAfterAckReason(sentence, { candidateMessage: candidate });
    if (want === 'drop') expect(DROPPED).toContain(reason);
    else expect(reason).toBeNull();
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
  it('the question field is never touched', () => {
    expect(vetoReason('A COGS-first read.', g(), { inQuestion: true })).toBeNull();
  });
  it("keeps the checker's line from the gate context", () => {
    expect(vetoReason("You've used revenue as the base.", g({ checkerLine: "You've used revenue as the base." }))).toBeNull();
  });
});
