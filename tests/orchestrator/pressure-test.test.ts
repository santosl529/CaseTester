// Pressure-test state and gate — the pure parts (spec 2026-10-07-pressure-
// test-and-request-guards). Multi-turn behaviour through the real runner is in
// pressure-test-runner.test.ts.
import { asksBrainstorm, asksRisk, asksRecommendationAsk } from '@/lib/orchestrator/spoken-close';
import { describe, it, expect } from 'vitest';
import {
  probeIntents, buildProbeJudgePrompt, parseProbeJudge, judgeProbeAnswer, isGatedItem, exhibitIsGated, probeAsHeard,
  pickFallbackQuestion, INITIAL_PRESSURE_TEST, FIGURES_QUESTIONS, NO_FIGURES_QUESTIONS,
  ANALYSIS_QUESTIONS, BRAINSTORM_QUESTIONS, LATE_QUESTIONS, TIME_PRESSURE_QUESTIONS, HYPOTHESIS_QUESTIONS,
  buildStructureJudgePrompt, parseStructureJudge, judgeStructureGiven, CODE_STRUCTURE_ASKS, reaskProbe,
} from '@/lib/orchestrator/pressure-test';
import { askIntents } from '@/lib/orchestrator/ask-intent';
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

  it('counts only statements about the structure itself; data requests never count, even when they imply missing dimensions', () => {
    const p = buildProbeJudgePrompt('Is that MECE — what might be missing?', ['x']);
    expect(p).toMatch(/only .*statements? about the structure/i);
    expect(p).toMatch(/my structure misses/i);
    expect(p).toMatch(/I'd add .* as a branch/i);
    expect(p).toMatch(/I'd start with .* because/i);
    expect(p).toMatch(/requests? for data never count/i);
    expect(p).toMatch(/even when they imply/i);
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

  // Batch 19 (step 4, 12 Oct): Owen t22 at 16:52, mid-analysis, heard "Where
  // would you like to start the analysis?" — the replacement fits the phase
  // and the clock, and never asks for a stage (that would count as administered).
  it.each([
    ['INTRO', NO_FIGURES_QUESTIONS], ['STRUCTURE', NO_FIGURES_QUESTIONS],
    ['ANALYSIS', ANALYSIS_QUESTIONS], ['EXHIBIT', ANALYSIS_QUESTIONS],
    ['BRAINSTORM', BRAINSTORM_QUESTIONS], ['RECOMMENDATION', LATE_QUESTIONS], ['WRAP', LATE_QUESTIONS],
  ] as const)('with no figures out, a question that fits %s', (phase, pool) => {
    for (let i = 0; i < 10; i++) expect(pool).toContain(pickFallbackQuestion({ figuresDelivered: false, seed: `s${i}`, last: null, phase }));
  });
  it('in the last minutes, a brief question whatever the phase (figures or not)', () => {
    expect(TIME_PRESSURE_QUESTIONS).toContain(pickFallbackQuestion({ figuresDelivered: false, seed: 'x', last: null, phase: 'EXHIBIT', timePressure: true }));
    expect(TIME_PRESSURE_QUESTIONS).toContain(pickFallbackQuestion({ figuresDelivered: true, seed: 'x', last: null, phase: 'ANALYSIS', timePressure: true }));
  });
  it('no replacement asks for the brainstorm, the risk or the recommendation, or reads as a structure probe late', () => {
    for (const q of [...ANALYSIS_QUESTIONS, ...BRAINSTORM_QUESTIONS, ...LATE_QUESTIONS, ...TIME_PRESSURE_QUESTIONS, ...FIGURES_QUESTIONS, ...NO_FIGURES_QUESTIONS]) {
      expect(asksBrainstorm(q), q).toBe(false);
      expect(asksRisk(q), q).toBe(false);
      expect(asksRecommendationAsk(q), q).toBe(false);
    }
  });

  it('starts every session not asked', () => {
    expect(INITIAL_PRESSURE_TEST).toEqual({ state: 'not_asked', reasks: 0, codeAsked: false, gatedTurns: 0, structureGiven: false, structureAsked: false });
  });
});

describe('the structure check', () => {
  it('asks whether the candidate has offered a framework, and does not count data asks or restating the prompt', () => {
    const p = buildStructureJudgePrompt(['Could I get the cost breakdown?']);
    expect(p).toMatch(/offered a structure/i);
    expect(p).toMatch(/at least two/i);
    expect(p).toMatch(/only ask for data/i);
    expect(p).toMatch(/restate/i);
  });

  it('counts a thin structure offered as the approach (it is the pressure test\'s job to expose it), not a hypothesis before framing', () => {
    const p = buildStructureJudgePrompt(['x']);
    expect(p).toMatch(/weak structure/i);
    expect(p).toMatch(/before (they|the candidate) (frame|structure)/i);
    expect(p).not.toMatch(/bare identity .* is not enough/i);
  });

  it('parses a verdict and rejects junk', () => {
    expect(parseStructureJudge('{"given":true,"reason":"revenue vs cost"}')).toEqual({ given: true, reason: 'revenue vs cost' });
    expect(parseStructureJudge('{"given":"yes"}')).toBeNull();
  });

  it('fails closed: no verdict on error, timeout or junk', async () => {
    expect(await judgeStructureGiven({ replies: ['x'] }, async () => { throw new Error('boom'); })).toBeNull();
    expect(await judgeStructureGiven({ replies: ['x'], timeoutMs: 10 }, () => new Promise(() => {}))).toBeNull();
    expect(await judgeStructureGiven({ replies: ['x'] }, async () => 'junk')).toBeNull();
    expect(await judgeStructureGiven({ replies: ['x'] }, async () => '{"given":true,"reason":"r"}')).toEqual({ given: true, reason: 'r' });
  });
});

describe('the hand-labelled validation set', () => {
  it('is well-formed: every case has text and a boolean label, with both outcomes present', async () => {
    const set = (await import('./fixtures/probe-judge-labelled.json')).default as {
      probeAnswers: { probe: string; reply: string; answered: boolean }[];
      structureGiven: { replies: string[]; given: boolean }[];
    };
    for (const c of set.probeAnswers) { expect(c.probe.length).toBeGreaterThan(0); expect(c.reply.length).toBeGreaterThan(0); expect(typeof c.answered).toBe('boolean'); }
    for (const c of set.structureGiven) { expect(c.replies.length).toBeGreaterThan(0); expect(typeof c.given).toBe('boolean'); }
    expect(new Set(set.probeAnswers.map(c => c.answered))).toEqual(new Set([true, false]));
    expect(new Set(set.structureGiven.map(c => c.given))).toEqual(new Set([true, false]));
  });
});

// v3 (batch 18 v2): the judge rejected Destiny's "Probably staff — baristas
// across 200 stores feels like the biggest bill" twelve times. A hedged pick
// with a reason answers a which-first question; a bare pick does not; and the
// judge reads code's re-ask and narrowed probe as the same test.
describe('probe judge prompt (v3)', () => {
  it('counts a hedged pick with a reason for a which-first question, not a bare pick', () => {
    const p = buildProbeJudgePrompt('Which branch would you start with, and why?', ['Probably staff — it feels like the biggest bill.']);
    expect(p).toMatch(/hedged/i);
    expect(p).toMatch(/biggest bill/);
    expect(p).toMatch(/pick with no reason/i);
    expect(p).toMatch(/not a what's-missing question/i);
  });

  // Regression from the first v3 wording (dev 18-nikhil-the-data-hoover, both
  // passes): a MECE answer with the branch choice declined was rejected.
  it('a substantive answer to one part of a compound probe counts even when another part is declined', () => {
    const p = buildProbeJudgePrompt('Is it MECE, and which branch would you prioritize first, and why?', ['It is broadly MECE; marketing overlaps with overhead. On where to start, I would rather see data.']);
    expect(p).toMatch(/Declining or deferring one part .* does not cancel/i);
  });

  it('treats "Asked again as:" lines as the same test', () => {
    const p = buildProbeJudgePrompt(probeAsHeard({ ...INITIAL_PRESSURE_TEST, state: 'awaiting', probe: 'Is that MECE?', followUps: ['Let me make it concrete: name one thing your structure doesn\'t cover yet.'] }), ['Rent.']);
    expect(p).toContain('Asked again as: Let me make it concrete');
    expect(p).toMatch(/"Asked again as:" .*same/i);
  });
});

// Batch 21 D8 (Anika t4): the model's question was withheld and the fallback
// asked "What would you look at first, and why?" right after she had answered
// which lever she'd prioritize.
describe('the fallback never re-asks where to start right after it was answered', () => {
  const answeredWhereToStart = { figuresDelivered: false, phase: 'STRUCTURE' as const, last: 'Which of your four levers do you prioritize, and what makes you confident the problem sits there?', lastAnswered: true };
  it.each(['a', 'b', 'c', 'd', 'e', 'f'])('seed %s', seed => {
    const q = pickFallbackQuestion({ ...answeredWhereToStart, seed });
    expect(q).not.toMatch(/\b(?:first|start|prioriti[sz]e)\b/i);
    expect(probeIntents(q)).toEqual([]);   // and no stage or probe
  });
  it('still may when the last ask was not answered (a stall), or was not about where to start', () => {
    const pool = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seed => pickFallbackQuestion({ ...answeredWhereToStart, lastAnswered: false, seed })));
    expect([...pool].some(q => /first/.test(q))).toBe(true);
    const other = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seed => pickFallbackQuestion({ ...answeredWhereToStart, last: 'What might be missing from your structure?', seed })));
    expect([...other].some(q => /first/.test(q))).toBe(true);
  });
});

describe('fallback wording is case-neutral (13 Oct)', () => {
  it('no fallback question assumes the case is a "problem"', () => {
    for (const q of [...FIGURES_QUESTIONS, ...NO_FIGURES_QUESTIONS, ...ANALYSIS_QUESTIONS, ...BRAINSTORM_QUESTIONS, ...LATE_QUESTIONS, ...TIME_PRESSURE_QUESTIONS, ...HYPOTHESIS_QUESTIONS]) {
      expect(q).not.toMatch(/\bproblem\b/i);
    }
  });
  it("code's structure asks don't either, and keep what they ask for", () => {
    for (const q of CODE_STRUCTURE_ASKS) expect(q).not.toMatch(/\bproblem\b/i);
    // as before the rewording: the second reads as a structure ask to the loop guard, the first doesn't
    for (const q of CODE_STRUCTURE_ASKS) expect([[], ['structure']]).toContainEqual(askIntents(q));
  });
});

// Lorenzo, 13 Oct (Tyler af62e2e2 t4, Jasmine 35897f4a t4: they had answered).
describe('the re-ask', () => {
  it('asks for "your answer on the structure" only when they gave none', () => {
    expect(reaskProbe(['mece'], true, false)).toBe("Before I share that data, I'd like your answer on the structure: what might be missing from your structure?");
    expect(reaskProbe(['mece'], true, true)).toBe('One more on your structure before I share that data: what might be missing from your structure?');
    expect(reaskProbe(['prioritize'], false, true)).toBe('Coming back to your structure: which branch would you start with, and why?');
  });
});
