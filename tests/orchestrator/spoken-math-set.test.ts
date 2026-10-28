// The spoken-math test set (Phase 1 contract §5 Stream 3 task 6): 80 real
// candidate sentences in `evals/spoken-math/sentences.json`, each labelled by
// hand as consistent, inconsistent or not arithmetic at all.
//
// Lorenzo's ruling P3 binds this file: the set must report **how many true
// flags the reading-set parser suppresses**, not only that it raises no false
// ones — otherwise the parser can be tuned to silence real math errors for
// free. `suppressed true flags` below is that number, and it is asserted to
// be zero per class, so a later tolerance that buys a false-flag removal with
// a real error fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkStatedArithmetic, type ArithmeticClaim } from '@/lib/orchestrator/arithmetic-check';

type Row = { id: string; text: string; source: string; turn: number; pool: string; label: 'consistent' | 'inconsistent' | 'not-arithmetic'; class: string; why: string };
const SET = JSON.parse(readFileSync('evals/spoken-math/sentences.json', 'utf8')) as { note: string; sentences: Row[] };
const rows = SET.sentences;

const flagsOf = (cs: ArithmeticClaim[]) => cs.filter(c => c.verdict === 'incorrect').length;
const read = (r: Row) => ({ off: checkStatedArithmetic(r.text), on: checkStatedArithmetic(r.text, { spokenReadings: true }) });

describe('the test set itself', () => {
  it('is 50–100 real sentences, every one labelled and sourced', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
    expect(rows.length).toBeLessThanOrEqual(100);
    for (const r of rows) {
      expect(r.source, r.id).toMatch(/^(test runs|voice-live|default-candidate|replays|reports|voice-demos|voice-spike)\//);
      expect(['consistent', 'inconsistent', 'not-arithmetic'], r.id).toContain(r.label);
      expect(r.why.length, r.id).toBeGreaterThan(5);
    }
    expect(new Set(rows.map(r => r.text)).size).toBe(rows.length);
  });
});

describe('the parser only ever removes a flag', () => {
  it.each(rows.map(r => [r.id, r] as const))('%s', (_id, r) => {
    const { off, on } = read(r);
    expect(on).toHaveLength(off.length);
    for (let i = 0; i < off.length; i++) {
      // Same claim, same operands, same stated result, same self-correction:
      // only the verdict may move, and only incorrect → unclear.
      expect({ ...on[i], verdict: off[i].verdict }).toEqual(off[i]);
      if (on[i].verdict !== off[i].verdict) expect([off[i].verdict, on[i].verdict]).toEqual(['incorrect', 'unclear']);
    }
  });
});

describe("Lorenzo's ruling P3: what the parser suppresses", () => {
  it('suppresses no true flag, in any class', () => {
    const suppressed: string[] = [];
    const fixed: string[] = [];
    const byClass = new Map<string, { suppressed: number; fixed: number; kept: number }>();
    for (const r of rows) {
      const { off, on } = read(r);
      const lost = flagsOf(off) - flagsOf(on);
      const c = byClass.get(r.class) ?? { suppressed: 0, fixed: 0, kept: 0 };
      if (lost > 0 && r.label === 'inconsistent') { suppressed.push(`${r.id} (${r.class}): ${r.why}`); c.suppressed += lost; }
      else if (lost > 0) { fixed.push(`${r.id} (${r.class})`); c.fixed += lost; }
      else c.kept += flagsOf(on);
      byClass.set(r.class, c);
    }
    const lines = [...byClass].sort().map(([k, v]) => `  ${k}: false flags removed ${v.fixed}, true flags suppressed ${v.suppressed}, flags kept ${v.kept}`);
    // Printed so a reader of the run sees the P3 numbers, not just a green tick.
    console.info(`spoken-math set: ${rows.length} sentences, false flags removed ${fixed.length}, TRUE FLAGS SUPPRESSED ${suppressed.length}\n${lines.join('\n')}`);
    expect(suppressed).toEqual([]);
  });

  it('removes the nine false flags it is meant to, and no others', () => {
    const removed = rows.filter(r => { const { off, on } = read(r); return flagsOf(off) > flagsOf(on); }).map(r => r.id).sort();
    expect(removed).toEqual([
      '2026-10-20-087451cb-t25',
      '2026-10-20-14055867-t17',
      '2026-10-20-14055867-t17-2',
      '2026-10-20-ee99bd82-t23',
      '2026-10-20-fcd7dce7-t19',
      '2026-10-21-3376e5fe-t23',
      '2026-10-21-3376e5fe-t7',
      '2026-10-21-527217df-t5',
      '2026-10-21-ddbb070b-t9',
    ]);
  });

  it('every flag on an inconsistent sentence survives', () => {
    for (const r of rows.filter(x => x.label === 'inconsistent')) {
      const { off, on } = read(r);
      expect(flagsOf(on), `${r.id}: ${r.why}`).toBe(flagsOf(off));
      expect(flagsOf(on), r.id).toBeGreaterThan(0);
    }
  });

  // The three false flags of the "noun-break" class ("250M adults ×",
  // "3,000 flights ×", "share × 200,000") are not this parser's: no reading of
  // the numbers can recover an operand the grammar gave to a noun. They are
  // reported, not fixed — Lorenzo's to rule on.
  it('the noun-break class is unchanged, and still flagged', () => {
    for (const r of rows.filter(x => x.class === 'noun-break')) {
      const { off, on } = read(r);
      expect(on.map(c => c.verdict), r.id).toEqual(off.map(c => c.verdict));
      expect(flagsOf(on), r.id).toBeGreaterThan(0);
    }
  });

  it('the voice sentences gain nothing: real STT output still raises no claim', () => {
    const voice = rows.filter(r => r.pool === 'voice');
    expect(voice.length).toBeGreaterThan(10);
    for (const r of voice) {
      const { off, on } = read(r);
      expect(on, r.id).toEqual(off);
    }
  });
});
