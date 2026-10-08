// Pressure-test state and gate — the pure parts (spec 2026-10-07-pressure-
// test-and-request-guards). Multi-turn behaviour through the real runner is in
// pressure-test-runner.test.ts.
import { describe, it, expect } from 'vitest';
import {
  probeIntents, buildProbeJudgePrompt, parseProbeJudge, judgeProbeAnswer, isGatedItem, exhibitIsGated,
  pickFallbackQuestion, INITIAL_PRESSURE_TEST, FIGURES_QUESTIONS, NO_FIGURES_QUESTIONS,
} from '@/lib/orchestrator/pressure-test';
import { createLedger } from '@/lib/orchestrator/data-ledger';
import { getCaseById } from '@/lib/cases/loader';

const caseData = getCaseById('prof-001');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ledger = () => createLedger(caseData.dataLedger as any);

describe('probeIntents (asked is read from the question text)', () => {
  it.each([
    ['Is that MECE—what’s missing?', ['mece']],
    ['Before we get into data, what might be missing from your framework?', ['mece']],
    ['Which branch would you prioritize first, and why?', ['prioritize']],
    ['Is that structure MECE, and which branch would you prioritize first, and why?', ['mece', 'prioritize']],
    ['What result would break this structure?', ['robustness']],
  ])('%s', (q, intents) => expect(probeIntents(q)).toEqual(intents));

  it('is empty for ordinary questions', () => {
    expect(probeIntents('What do those figures tell you?')).toEqual([]);
    expect(probeIntents('How would you structure the analysis?')).toEqual([]);
  });
});

describe('the judge', () => {
  it('asks whether the probe was substantively answered, counting one part of a compound probe', () => {
    const p = buildProbeJudgePrompt('Is that MECE, and which branch first?', ['Probably something is missing. Could I get the cost data?']);
    expect(p).toMatch(/substantively/i);
    expect(p).toMatch(/one part of a compound/i);
    expect(p).toMatch(/only acknowledge/i);
    expect(p).toMatch(/only ask for data/i);
  });

  it('parses a verdict and rejects junk', () => {
    expect(parseProbeJudge('{"answered":true,"reason":"names overlap"}')).toEqual({ answered: true, reason: 'names overlap' });
    expect(parseProbeJudge('{"answered":"yes"}')).toBeNull();
    expect(parseProbeJudge('nope')).toBeNull();
  });

  it('fails closed on a timeout (null, not "answered")', async () => {
    const slow = () => new Promise<string>(r => setTimeout(() => r('{"answered":true,"reason":"x"}'), 200));
    expect(await judgeProbeAnswer({ probe: 'Is that MECE?', replies: ['It misses capex.'], timeoutMs: 20 }, slow)).toBeNull();
  });

  it('returns the verdict when the call answers in time', async () => {
    const fast = async () => '{"answered":false,"reason":"only data asks"}';
    expect(await judgeProbeAnswer({ probe: 'Is that MECE?', replies: ['Could I get COGS?'], timeoutMs: 200 }, fast)).toEqual({ answered: false, reason: 'only data asks' });
  });
});

describe('gate scope (releaseWhen later than CLARIFY needs the pressure test)', () => {
  it('passes scoping items, gates analysis items', () => {
    const l = ledger();
    expect(isGatedItem(l, 'revenue_total')).toBe(false);
    expect(isGatedItem(l, 'stores_count')).toBe(false);
    expect(isGatedItem(l, 'cogs_pct')).toBe(true);
    expect(isGatedItem(l, 'bean_share_of_cogs')).toBe(true);
  });

  it('gates an exhibit that shows any gated item, even with a scoping item beside it', () => {
    const l = ledger();
    expect(exhibitIsGated(l, ['revenue_total', 'cogs_pct'])).toBe(true);   // mixed access
    expect(exhibitIsGated(l, ['revenue_total', 'stores_count'])).toBe(false);
  });
});

describe('fallback questions', () => {
  it('never mentions figures when none went out, and never repeats the last question', () => {
    for (let i = 0; i < 20; i++) {
      const q = pickFallbackQuestion({ figuresDelivered: false, seed: `s${i}`, last: NO_FIGURES_QUESTIONS[0] });
      expect(NO_FIGURES_QUESTIONS).toContain(q);
      expect(q).not.toBe(NO_FIGURES_QUESTIONS[0]);
      expect(q).not.toMatch(/figure|number/i);
    }
    expect(FIGURES_QUESTIONS).toContain(pickFallbackQuestion({ figuresDelivered: true, seed: 'x', last: null }));
  });

  it('starts every session not asked', () => {
    expect(INITIAL_PRESSURE_TEST).toEqual({ state: 'not_asked', reasks: 0, codeAsked: false, gatedTurns: 0 });
  });
});
