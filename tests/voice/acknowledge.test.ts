import { describe, it, expect } from 'vitest';
import { ACKS, ACK_POOLS, ALL_ACKS, FILLER_GAP_MS, FILLER_TAIL_MS, ackBeats, ackKind, ackSpeechText, isThinkingFiller, joinBeats, pickAck, shouldAcknowledge } from '@/lib/voice/acknowledge';

describe('instant acknowledgment', () => {
  it('rotates through neutral backchannels and never repeats the last one', () => {
    let last: string | null = null;
    for (let i = 0; i < 20; i++) {
      const a = pickAck(`s:${i}`, last);
      expect(ACKS).toContain(a);
      expect(a).not.toBe(last);
      last = a;
    }
  });

  it('never grades', () => {
    for (const a of ALL_ACKS) expect(a).not.toMatch(/great|good|nice|right answer|perfect|exactly/i);
  });

  it('never promises data — code may still refuse the ask', () => {
    for (const a of ALL_ACKS) expect(a).not.toMatch(/pull|share|send|here's|here is|i'll get|i have/i);
  });

  it('every pool can avoid repeating its last phrase, and ALL_ACKS covers every pool', () => {
    for (const pool of Object.values(ACK_POOLS)) {
      expect(pool.length).toBeGreaterThanOrEqual(2);
      for (const a of pool) expect(ALL_ACKS).toContain(a);
    }
  });

  it('acknowledges ordinary case talk', () => {
    expect(shouldAcknowledge('COGS went from 42 to 58, so sixteen points.')).toBe(true);
    expect(shouldAcknowledge("I'd start with the cost breakdown.")).toBe(true);
  });

  it('stays silent on distress or hostility — the conduct response comes first', () => {
    expect(shouldAcknowledge("Honestly I'm going to bomb every interview I do. I don't know why I'm even doing this.")).toBe(false);
    expect(shouldAcknowledge("You're an idiot, just answer the question.")).toBe(false);
  });

  it('never says "right" — after an answer it can sound like "you\'re right"', () => {
    for (const a of ALL_ACKS) expect(a).not.toMatch(/\bright\b/i);
  });

  it('answers and questions get thinking sounds only — nothing that confirms (Lorenzo, 17 Oct)', () => {
    expect([...ACK_POOLS.answer]).toEqual(['Hmm…', 'Mhm…', 'Okay…', 'Alright…', 'Hmm… okay…', 'Hmm… alright…', 'Mhm… okay…', 'Mhm… alright…']);
    expect(ACK_POOLS.question).toEqual(ACK_POOLS.answer);
    for (const a of ACK_POOLS.answer) {
      expect(a).not.toMatch(/got it|thanks|i see|understood|sure|follow|so\b/i);
      expect(a).toMatch(/…$/);
      expect(isThinkingFiller(a)).toBe(true);
    }
    expect(ACK_POOLS.stuck).toEqual(['Take your time.', 'Sure, take a moment.']);
    expect(isThinkingFiller('Take your time.')).toBe(false);
    expect(isThinkingFiller(null)).toBe(false);
  });

  it('a filler is synthesized beat by beat, each with its ellipsis spelled out; other acks whole', () => {
    expect(ackBeats('Hmm… okay…')).toEqual(['Hmm…', 'Okay…']);
    expect(ackBeats('Mhm… alright…')).toEqual(['Mhm…', 'Alright…']);
    expect(ackBeats('Okay…')).toEqual(['Okay…']);
    expect(ackBeats('Okay, let me check.')).toEqual(['Okay, let me check.']);
    expect(ackSpeechText('Okay…')).toBe('Okay...');
    expect(ackSpeechText('Take your time.')).toBe('Take your time.');
    // Every beat is one of four clips.
    expect(new Set(ACKS.flatMap(ackBeats))).toEqual(new Set(['Hmm…', 'Mhm…', 'Okay…', 'Alright…']));
  });

  it('joins beats with ~400ms between them and ~300ms after the last', () => {
    const RATE = 24000;
    const beat = (ms: number) => new Uint8Array((RATE * ms) / 1000 * 2).fill(1);
    expect(FILLER_GAP_MS).toBe(400);
    expect(FILLER_TAIL_MS).toBe(300);
    const two = joinBeats([beat(500), beat(600)], RATE);
    expect(two.length / 2 / RATE * 1000).toBe(500 + 400 + 600 + 300);
    expect(two.subarray((RATE * 0.5) * 2, (RATE * 0.9) * 2).every(b => b === 0)).toBe(true);   // the gap is silence
    expect(joinBeats([beat(500)], RATE, 400, 250).length / 2 / RATE * 1000).toBe(750);
  });

  it('long answers get a filler too (Lorenzo, 17 Oct)', () => {
    const long = Array.from({ length: 144 }, () => 'costs').join(' ');
    expect(shouldAcknowledge(long)).toBe(true);
  });

  it('stays silent on an empty turn', () => {
    expect(shouldAcknowledge('   ')).toBe(false);
  });

  it('picks from the pool of the message kind, never repeating the last one', () => {
    for (const kind of Object.keys(ACK_POOLS) as (keyof typeof ACK_POOLS)[]) {
      let last: string | null = null;
      for (let i = 0; i < 10; i++) {
        const a = pickAck(`s:${i}`, last, kind);
        expect(ACK_POOLS[kind]).toContain(a);
        expect(a).not.toBe(last);
        last = a;
      }
    }
  });

  it('defaults to the answer pool, which is today\'s list', () => {
    expect(ACK_POOLS.answer).toEqual(ACKS);
    expect(pickAck('s:1', null)).toBe(pickAck('s:1', null, 'answer'));
  });
});

// Lines from saved runs: persona text (batches 12–14) and live voice (8–9 Oct).
describe('ackKind', () => {
  it('stuck: a strong stuck or holding cue in a short message', () => {
    for (const t of [
      "I'm stuck, sorry. I don't really know where to start.",
      'hmm, I\'m not sure. I guess costs? But I\'m not confident.',
      'Um. Honestly, I don\'t know. Sorry.',
      "I'm sorry, I really don't know which one.",
      "I don't know, I'd need more data.",
      'Sorry. Hold on.',
      'So COGS went up by... oh, wait. Hang on. Once again, let me redo that.',
      'Give me a second.',
      'Let me think about that.',
    ]) expect(ackKind(t), t).toBe('stuck');
  });

  it('data request: an explicit ask', () => {
    for (const t of [
      'Can I see the cost breakdown over the the two years?',
      "I'd guess coffee beans, since that's the biggest input and commodity prices move a lot. Could I see that breakdown and the bean price change?",
    ]) expect(ackKind(t), t).toBe('data_request');
  });

  it('question: a question mark or a question opener', () => {
    for (const t of [
      'Thanks. So what is Brun beans total annual revenue?',
      'Can I ask — when you say revenue grew 15%, is that total across all 200 stores, or per store?',
      'Sorry — one more. Do we know if they changed menu prices at all over those two years?',
      'Um, and are these all company-owned stores, or are some franchised?',
      'Sorry. Quick question. Is that, uh, as a share of revenue?',
    ]) expect(ackKind(t), t).toBe('question');
  });

  it('answer: ordinary statements, and anything over 40 words', () => {
    for (const t of [
      "I'd split profit into revenue and costs.",
      'Cost of goods rose about four points.',
      "Okay. So I guess I'd look at three things. First, revenue — like what's happening with sales. Second, costs. Sorry, that's kind of broad.",
      'Customer wait times are longer at peak, so labor could matter.',
      'If they hold on to flat prices, margin keeps falling.',
      'Let me take a second to lay this out. So profit equals revenue minus cost, and since revenue is actually up 15% while margin fell from 24% to 6%, my instinct is costs are growing faster than revenue — but I want to confirm the revenue side first. Does that work?',
    ]) expect(ackKind(t), t).toBe('answer');
  });
});
