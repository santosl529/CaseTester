// Phase 1 4.10 (`ackRotation`; Lorenzo, 22 Oct: "Acknowledgments: run the model's opening acknowledgment through the
// phrase-pool rotation, so \"Understood.\" stops repeating."). b38 Larkspur: "Understood." opened 28 of 75 interviewer
// turns, 12 consecutive pairs (hand grading). Says verbatim from b38's model turns.
import { describe, it, expect } from 'vitest';
import { PHRASE_POOLS, PHRASE_MEMORY, recordPhraseUses, rotateOpeningAck, isAckOnly, type PhraseUses } from '@/lib/orchestrator/phrasing';
import { turnCorrects } from '@/lib/orchestrator/stream-turn';

describe('4.10: the opening acknowledgment', () => {
  it('a say that opens on acknowledgment words only gets the pool\'s variant; the rest is the model\'s', () => {
    expect(rotateOpeningAck('Understood.', undefined, 's:4')).toBe('Understood.'); // the first use is the original line
    const uses: PhraseUses = { ack: [0] };
    const out = rotateOpeningAck('Understood. You said roughly 800,000 passengers a year across the network.', uses, 's:6');
    expect(out).not.toMatch(/^Understood\./);
    expect(PHRASE_POOLS.ack).toContain(out.split(/(?<=\.)\s/)[0]);
    expect(out.endsWith('You said roughly 800,000 passengers a year across the network.')).toBe(true);
    for (const s of ['Got it.', 'Okay, got it.', 'Right.', 'Mm-hm.']) expect(isAckOnly(s)).toBe(true);
  });
  it('a sentence that comments, or anything else, is the model\'s and stays', () => {
    const uses: PhraseUses = { ack: [0, 1, 2] };
    for (const say of ['Understood, that fills the gaps.', "That's a start.", 'A cost-first split.', '', 'Your Lakeport breakeven is worked through.']) {
      expect(rotateOpeningAck(say, uses, 's:8')).toBe(say);
    }
  });
  it('over a session, no acknowledgment repeats within the last 3 opened by code', () => {
    let uses: PhraseUses = {};
    const said: string[] = [];
    for (let t = 0; t < 30; t++) {
      const say = rotateOpeningAck('Understood.', uses, `sess:${2 * t + 2}`);
      said.push(say);
      uses = recordPhraseUses(`${say} What would you look at next?`, uses, undefined, { ack: true });
    }
    for (let i = PHRASE_MEMORY; i < said.length; i++) expect(said.slice(i - PHRASE_MEMORY, i)).not.toContain(said[i]);
    expect(said.filter(s => s === 'Understood.').length).toBeLessThanOrEqual(Math.ceil(30 / (PHRASE_MEMORY + 1)));
  });
  // Review fix round, item 8: a rotated acknowledgment in front of a correction reads as assent and then
  // contradiction, which is why "Right." was left out of the pool in the first place.
  it('a turn that carries a correction keeps the model\'s own word', () => {
    const uses: PhraseUses = { ack: [0] };
    const say = 'Mm-hm. Starter standalone lifetime value is about $1,400, not $1,205.';
    expect(rotateOpeningAck(say, uses, 's:18', { correcting: true })).toBe(say);
    expect(rotateOpeningAck(say, uses, 's:18')).not.toBe(say);          // …and rotates as usual when it doesn't
  });
  it('turnCorrects reads the correction code will write after the say', () => {
    const base = { misquote: null, checkerLine: null, stageCheckerLine: null, recMathProbe: null };
    expect(turnCorrects(base as never)).toBe(false);
    expect(turnCorrects({ ...base, misquote: { item: 'x', items: ['x'], text: 'Y, not Z.', all: [] } } as never)).toBe(true);
    expect(turnCorrects({ ...base, checkerLine: { action: 'correct' } } as never)).toBe(true);
    expect(turnCorrects({ ...base, checkerLine: { action: 'restate' } } as never)).toBe(true);
    expect(turnCorrects({ ...base, checkerLine: { action: 'probe' } } as never)).toBe(false);
    expect(turnCorrects({ ...base, stageCheckerLine: { id: 'a', key: 'k', line: 'L' } } as never)).toBe(true);
    expect(turnCorrects({ ...base, recMathProbe: { action: 'correct' } } as never)).toBe(true);
    expect(turnCorrects({ ...base, recMathProbe: { action: 'probe' } } as never)).toBe(false);
  });
  // Stream rotates the first sentence event; Settle rotates the whole say and splits it itself. The words must match.
  it('the same say rotates identically through the Stream and the Settle path', () => {
    const uses: PhraseUses = { ack: [0, 1] };
    const seed = 'sess:12';
    for (const say of [
      'Understood. You said roughly 800,000 passengers a year.',
      'Okay, got it.  The Lakeport number is next.',
      'Mm-hm.\nWhat would you look at next?',
      'Got it.',
      'A cost-first split. What would you look at next?',   // no acknowledgment: both leave it alone
    ]) {
      const [first, ...rest] = say.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
      const stream = [rotateOpeningAck(first, uses, seed), ...rest].join(' ');          // Stream: the first event only
      const settle = rotateOpeningAck(say, uses, seed);                                  // Settle: the whole say
      expect(settle.trim().split(/(?<=[.!?])\s+/)[0]).toBe(rotateOpeningAck(first, uses, seed));
      expect(settle.trim().replace(/\s+/g, ' ')).toBe(stream.trim().replace(/\s+/g, ' '));
    }
  });
  it('switch off: the ack pool is not recorded — the session\'s uses are as before', () => {
    expect(recordPhraseUses('Understood. What would you look at next?', {})).toEqual({});
    expect(recordPhraseUses('Understood. What would you look at next?', {}, undefined, { ack: true })).toEqual({ ack: [0] });
  });
});
