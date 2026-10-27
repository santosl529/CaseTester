// Speech normalization for the arithmetic checker (switch `speechNormalization`,
// Lorenzo's brief of 27 Oct). Stream 3 task 6 found the checker blind on real
// STT output: all 131 recorded voice candidate turns in `voice-live/` raise no
// arithmetic claim at all, because the fillers between the operands and the
// result — and the commas Deepgram puts around them — end the expression.
//
// Every sentence below is a real recorded voice turn (session and turn named).
// The risk profile is inverted from the rest of Phase 1: this makes the engine
// *raise* claims on speech it used to ignore, so the tests that matter most are
// the ones that pin what it must NOT do — no claim the typed form would not
// make, and an ambiguous reading left unclear.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkStatedArithmetic } from '@/lib/orchestrator/arithmetic-check';
import { normalizeSpeech } from '@/lib/orchestrator/speech-normalize';

const ON = { spokenReadings: true, speechNormalization: true } as const;
const OFF = { spokenReadings: true } as const;
const read = (t: string, opts: { spokenReadings?: boolean; speechNormalization?: boolean }) =>
  checkStatedArithmetic(t, opts).map(c => [c.expression, c.stated, c.verdict]);

describe('the sentence the brief names', () => {
  // voice-live 2026-10-18 9813d6ce t14 (prof-001): 58 / 4 = 14.5.
  const T14 = 'So fifty eight divided by four, um, gives us around, um, sorry, uh, fourteen point five.';

  it('off: fillers and their commas end the expression, so there is no claim', () => {
    expect(read(T14, OFF)).toEqual([]);
  });

  it('on: the chain survives and the arithmetic is verified correct', () => {
    expect(read(T14, ON)).toEqual([['58 / 4', 14.5, 'correct']]);
  });

  it('the typed form of the same claim reads the same both ways', () => {
    const typed = 'So 58 / 4 gives us around 14.5.';
    expect(read(typed, OFF)).toEqual([['58 / 4', 14.5, 'correct']]);
    expect(read(typed, ON)).toEqual(read(typed, OFF));
  });
});

describe('the patterns the recordings actually contain', () => {
  // voice-live 2026-10-12 e824fdf3 t33: 16 / 42 ≈ 38%.
  it('a filler run and a hedge between the equals and the result', () => {
    const s = 'So Cos has, like, suddenly been increasing, um, sixteen over forty two is, yes, like, thirty eight percent.';
    expect(read(s, OFF)).toEqual([]);
    expect(read(s, ON)).toEqual([['16 / 42', 38, 'correct']]);
  });

  // voice-live 2026-10-17 9ccf0836 t10: 375 / 4 = 93.75, said as "something like ninety three".
  it('"something like" before the result', () => {
    const s = 'which would come out to three hundred seventy five divided by four is something like ninety three.';
    expect(read(s, OFF)).toEqual([]);
    expect(read(s, ON)).toEqual([['375 / 4', 93, 'correct']]);
  });

  // voice-live 2026-10-17 9ccf0836 t10: "point seven five", "point two five" — a
  // decimal spoken with no leading zero, which `normalizeNumberWords` leaves as
  // words because its runs must start on a digit or tens word.
  it('a decimal spoken with no leading zero', () => {
    expect(normalizeSpeech('The other three is point seven five times thirty seven point five.'))
      .toBe('The other three is 0.75 times thirty seven point five.');
    expect(normalizeSpeech('It is point two.')).toBe('It is 0.2.');
  });

  it('leaves a decimal that already has its whole part to the number-word reader', () => {
    expect(normalizeSpeech('around fourteen point five')).toBe('around fourteen point five');
    expect(normalizeSpeech('zero point six divided by six point two')).toBe('zero point six divided by six point two');
    // "ten, uh, point five" is 10.5 as spoken, but the comma makes the reading a
    // guess: "point" cannot begin an operand, so the filler run is not a gap in
    // a chain and the whole phrase is left as written.
    expect(normalizeSpeech('around ten, uh, point five points of revenue')).toBe('around ten, uh, point five points of revenue');
  });
});

describe('what it must not do', () => {
  it('never joins two claims a comma separated', () => {
    // The corpus's own shape: "= 10, plus 0.75 × 37.5 = 28.1" is two claims, not
    // one — and a filler inside the comma must not glue them into 10 + 28.125.
    const typed = '0.25 × 40 = 10, plus 0.75 × 37.5 = 28.1';
    const spoken = '0.25 × 40 = 10, um, plus 0.75 × 37.5 = 28.1';
    expect(read(spoken, ON)).toEqual(read(typed, OFF));
    expect(read(spoken, ON).every(c => c[2] !== 'incorrect')).toBe(true);
  });

  it('leaves a mid-thought figure unparsed rather than flagging it', () => {
    // voice-live 2026-10-17 9ccf0836 t10: "nine point three times three is, like,
    // twenty, like, around... wait." — 9.3 × 3 is 27.9, and "twenty" is a
    // half-spoken guess he abandons. No filler sits inside the chain, so the
    // comma still ends it and no claim is raised either way.
    const s = 'So nine point three times three is, like, twenty, like, around...';
    expect(read(s, OFF)).toEqual([]);
    expect(read(s, ON)).toEqual([]);
  });

  // A comma left standing in front of a bare "is" still ends the expression,
  // exactly as it does in the typed form ("58 / 4, is 16" raises nothing
  // either): only the introducers the reader already accepts after a comma
  // carry the chain across it.
  it('a self-correction still reads on the normalized text', () => {
    const s = 'So fifty eight divided by four, um, gives us sixteen. Wait, sorry, fourteen point five.';
    const claims = checkStatedArithmetic(s, ON);
    expect(claims.map(c => [c.expression, c.stated, c.verdict, c.selfCorrected]))
      .toEqual([['58 / 4', 16, 'incorrect', true]]);
  });

  it('is a no-op on text with no disfluency', () => {
    for (const s of [
      'COGS went from 42% to 58% of revenue, so 16 points.',
      '16 / 18 is about 89%, not 1.6%.',
      'Take the 40% bean inflation on 25 points and you get ten points of margin.',
      'If beans went from 25% of COGS to something like 45%, that confirms beans grew disproportionately.',
      'Contribution per bag: $3.00 minus $0.70 + $0.30 + $0.30 + $0.20 = $1.50 variable.',
    ]) expect(read(s, ON)).toEqual(read(s, OFF));
  });

  it('keeps every flag the typed form raises', () => {
    // batch 18 Maya c1b79f9e t20 — the slip the whole check was built for.
    const s = 'Beans are 16 divided by 18, um, which is about 1.6% of revenue.';
    const typed = 'Beans are 16 divided by 18, which is about 1.6% of revenue.';
    expect(read(typed, OFF)).toEqual([['16 / 18', 1.6, 'incorrect']]);
    expect(read(s, ON)).toEqual([['16 / 18', 1.6, 'incorrect']]);
  });

  it('leaves an ambiguous spoken reading unclear, not flagged', () => {
    // voice-live 2026-10-19 44174f51 t10: 28% × 42 is 11.76 and he says 11% —
    // between the bands, so it is no evidence either way.
    const s = 'twenty eight percent, um, times the forty two, which gives us that they account for eleven percent of the increase.';
    expect(read(s, ON).filter(c => c[2] === 'incorrect')).toEqual([]);
  });
});

describe('normalizeSpeech itself', () => {
  it('collapses a filler run after a figure to the comma that was there', () => {
    expect(normalizeSpeech('fifty eight divided by four, um, gives us fourteen point five'))
      .toBe('fifty eight divided by four, gives us fourteen point five');
  });

  it('collapses a filler run after an operator or a hedge to nothing', () => {
    expect(normalizeSpeech('sixteen over forty two is, yes, thirty eight percent'))
      .toBe('sixteen over forty two is thirty eight percent');
    expect(normalizeSpeech('gives us around, um, sorry, uh, fourteen'))
      .toBe('gives us around fourteen');
  });

  it('leaves a sentence-initial filler and a sentence-final one alone', () => {
    expect(normalizeSpeech('Um, one more thing — is the 24% to 6% margin after tax?'))
      .toBe('Um, one more thing — is the 24% to 6% margin after tax?');
    expect(normalizeSpeech('Let me redo that. Sorry. It is 16 over 18.'))
      .toBe('Let me redo that. Sorry. It is 16 over 18.');
  });
});

// The 80-sentence set of Stream 3 task 6 (`evals/spoken-math/sentences.json`):
// 56 real written sentences and 24 real STT ones, every one hand-labelled. It
// is the standing check that the pass does nothing to writing and something to
// speech — and that what it does to speech is never a flag.
describe('the spoken-math set', () => {
  type Row = { id: string; text: string; pool: string; label: 'consistent' | 'inconsistent' | 'not-arithmetic' };
  const rows = (JSON.parse(readFileSync('evals/spoken-math/sentences.json', 'utf8')) as { sentences: Row[] }).sentences;

  it('changes nothing on the written sentences, flagged or not', () => {
    for (const r of rows.filter(x => x.pool !== 'voice')) {
      expect(checkStatedArithmetic(r.text, ON), r.id).toEqual(checkStatedArithmetic(r.text, OFF));
    }
  });

  it('raises a claim on the real STT sentences, and never an incorrect one', () => {
    const gained = rows.filter(x => x.pool === 'voice')
      .filter(r => checkStatedArithmetic(r.text, ON).length > checkStatedArithmetic(r.text, OFF).length);
    expect(gained.map(r => r.id)).toEqual(['e824fdf3-t33', '9ccf0836-t10', '9813d6ce-t14']);
    // Every one of them is hand-labelled consistent, and every claim the pass
    // raises anywhere in the pool is correct or unclear — never a flag.
    for (const r of gained) expect(r.label, r.id).toBe('consistent');
    for (const r of rows.filter(x => x.pool === 'voice')) {
      expect(checkStatedArithmetic(r.text, ON).filter(c => c.verdict === 'incorrect'), r.id).toEqual([]);
    }
  });
});
