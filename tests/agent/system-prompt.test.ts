import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildPromptParts, type PromptContext } from '@/lib/agent/prompts/system';

const TOTAL = 5 * 60 * 1000;

function ctx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    casePrompt: 'Client has declining profits.',
    currentPhase: 'CLARIFY',
    revealedValues: {},
    unrevealedItems: [],
    exhibits: [],
    advancedLastTurn: false,
    elapsedMs: 0,
    totalMs: TOTAL,
    ...overrides,
  };
}

describe('buildSystemPrompt stages and pacing', () => {
  it('includes the stage guide, tracked from the declared move', () => {
    const prompt = buildSystemPrompt(ctx());
    expect(prompt).toContain('Interview stages, in order');
    expect(prompt).toContain('STRUCTURE: the candidate presents their framework');
  });

  it('forbids announcing stage changes', () => {
    expect(buildSystemPrompt(ctx())).toContain('never announce them');
  });

  it('never grades the candidate and leaves the close to the system', () => {
    const prompt = buildSystemPrompt(ctx());
    expect(prompt).toContain('NEVER praise or evaluate a candidate answer');
    expect(prompt).toContain('Never say goodbye, wrap up');
    expect(prompt).toContain('The system closes the case');
  });

  it('gates the visible behavior shift on the turn after a stage change', () => {
    const prompt = buildSystemPrompt(ctx({ advancedLastTurn: true }));
    expect(prompt).toContain('The stage moved on LAST turn');
    expect(prompt).toContain('No visible gear-shift');
  });

  it('adds a pacing alert when ≥2 phases behind a uniform schedule', () => {
    const prompt = buildSystemPrompt(ctx({ elapsedMs: 0.8 * TOTAL }));
    expect(prompt).toContain('PACING ALERT');
    expect(prompt).toContain('still in CLARIFY');
  });

  it('no pacing alert when on schedule, or on the turn after a stage change', () => {
    expect(buildPromptParts(ctx({ currentPhase: 'ANALYSIS', elapsedMs: 0.4 * TOTAL })).turn).not.toContain('PACING ALERT');
    expect(buildPromptParts(ctx({ elapsedMs: 0.8 * TOTAL, advancedLastTurn: true })).turn).not.toContain('PACING ALERT');
  });

  it('uses per-phase budgets from case config (Rule 8)', () => {
    const long = { INTRO: 10_000, CLARIFY: 10_000, STRUCTURE: 200_000, ANALYSIS: 20_000, EXHIBIT: 20_000, BRAINSTORM: 20_000, RECOMMENDATION: 10_000, WRAP: 10_000 };
    expect(buildPromptParts(ctx({ currentPhase: 'STRUCTURE', elapsedMs: 0.6 * TOTAL, phaseBudgetsMs: long })).turn).not.toContain('PACING ALERT');
    const short = { ...long, STRUCTURE: 20_000 };
    const prompt = buildSystemPrompt(ctx({ currentPhase: 'STRUCTURE', elapsedMs: 45_000, phaseBudgetsMs: short }));
    expect(prompt).toContain('PACING ALERT');
    expect(prompt).toContain('budget is used up');
  });
});

describe('buildSystemPrompt hints', () => {
  it('includes the recompute hint only when provided', () => {
    expect(buildSystemPrompt(ctx({ recomputeHint: 'RECOMPUTE FLAG: test hint' }))).toContain('RECOMPUTE FLAG: test hint');
    expect(buildSystemPrompt(ctx())).not.toContain('RECOMPUTE FLAG:');
  });

  it('injects stall guidance, which the PRIORITY list ranks above the defaults', () => {
    const prompt = buildSystemPrompt(ctx({ stallGuidance: 'STALL INTERVENTION — Level 3 (directive rescue). Hand them the branch.' }));
    expect(prompt).toContain('STALL INTERVENTION — Level 3');
    expect(prompt).toMatch(/PRIORITY[^]*1\. A note for this turn — STALL INTERVENTION/);
    expect(buildSystemPrompt(ctx())).not.toContain('STALL INTERVENTION —');
  });

  it('surfaces the coverage steer', () => {
    expect(buildSystemPrompt(ctx({ coverageSteer: 'COVERAGE — undertested: Quantitative (30/100).' }))).toContain('Quantitative (30/100)');
  });

  it('carries the turn note (e.g. the system asks for the recommendation)', () => {
    expect(buildSystemPrompt(ctx({ turnNote: 'THIS TURN: x' }))).toContain('THIS TURN: x');
  });
});

describe('buildSystemPrompt load-shedding (Rule 15)', () => {
  it('injects the shed directive in the final stretch only', () => {
    const prompt = buildSystemPrompt(ctx({ elapsedMs: TOTAL - 60_000 }));
    expect(prompt).toContain('TIME PRESSURE — SHED OPTIONAL PROBING');
    expect(prompt).toMatch(/drive the candidate to deliver their final recommendation/i);
    expect(prompt).toContain('overrides COVERAGE and PACING');
    expect(prompt).toContain('declare it with respond "release"');
    expect(buildPromptParts(ctx({ elapsedMs: 0.4 * TOTAL })).turn).not.toContain('SHED OPTIONAL PROBING');
  });
});

// Spec 2026-10-06: the model declares, the system delivers.
describe('buildSystemPrompt data (Rule 11, decided in code)', () => {
  const p = buildSystemPrompt(ctx({ unrevealedItems: [{ id: 'cogs_pct', label: 'COGS as % of revenue' }] }));

  it('describes the turn format with say first', () => {
    expect(p).toContain('YOUR TURN — reply with one JSON object');
    for (const f of ['"move"', '"requests"', '"exhibit"', '"rescue_item"', '"say"', '"question"']) expect(p).toContain(f);
    const fmt = p.slice(p.indexOf('YOUR TURN'));
    const at = (f: string) => fmt.indexOf(`- ${f}:`);
    expect(at('"say"')).toBeLessThan(at('"move"'));
    expect(at('"rescue_item"')).toBeLessThan(at('"question"'));
  });

  it('makes the model declare every request instead of giving, declining or postponing data itself', () => {
    expect(p).toContain('You never give, offer, decline or postpone data in your own words');
    expect(p).toContain('Declare every request in "requests"');
    expect(p).toContain('It never responds to their data requests');
    expect(p).toContain('never announces, describes, promises, holds or declines data');
  });

  it('lists releasable data with ids and no values', () => {
    expect(p).toContain('DATA YOU CAN RELEASE');
    expect(p).toContain('- id: "cogs_pct" — COGS as % of revenue');
  });

  it('has no data, phase or ending actions and no planted vocabulary', () => {
    for (const s of ['reveal_data', 'show_exhibit', 'advance_phase', 'end_case', 'ledger']) expect(p).not.toContain(s);
  });

  it('injects the open-data-requests hint when provided', () => {
    expect(buildSystemPrompt(ctx({ openDataRequestsHint: 'OPEN DATA REQUESTS — test hint' }))).toContain('OPEN DATA REQUESTS — test hint');
  });
});

describe('synthesis cap in the prompt (Rule 13)', () => {
  it('never lets the time-pressure rescue reach the recommendation', () => {
    const p = buildSystemPrompt(ctx({ currentPhase: 'RECOMMENDATION', elapsedMs: TOTAL - 30_000 }));
    expect(p).toMatch(/TIME PRESSURE/);
    expect(p).toMatch(/never for the recommendation itself/i);
  });
  it('forbids stating the recommendation for the candidate in every phase', () => {
    expect(buildSystemPrompt(ctx({ currentPhase: 'ANALYSIS' }))).toMatch(/Never state a recommendation, or which lever to pull, for the candidate/);
  });
});

describe('exhibits already shown', () => {
  it('marks a shown exhibit in the list', () => {
    const p = buildSystemPrompt(ctx({ exhibits: [
      { id: 'exhibit-a', title: 'Cost structure over time', shown: true },
      { id: 'exhibit-b', title: 'Store map' },
    ] }));
    expect(p).toContain('- id: "exhibit-a" — Cost structure over time (already on the candidate\'s screen');
    expect(p).toContain('- id: "exhibit-b" — Store map\n');
  });
});

// Latency plan step 3: the fixed instructions are a cacheable prefix, so
// nothing that changes turn to turn may appear in them.
describe('buildPromptParts — stable prefix vs per-turn state', () => {
  const early = ctx();
  const late = ctx({
    currentPhase: 'ANALYSIS',
    revealedValues: { cogs: 'COGS is 58% of revenue.' },
    unrevealedItems: [{ id: 'beans', label: 'Bean price change' }],
    exhibits: [{ id: 'exhibit-a', title: 'Cost structure', shown: true }],
    advancedLastTurn: true,
    elapsedMs: TOTAL - 20_000,
    recomputeHint: 'RECOMPUTE FLAG: x',
    unitCheckHint: 'UNIT-CONVERSION FLAG: y',
    stallGuidance: 'STALL: z',
    coverageSteer: 'COVERAGE: w',
    openDataRequestsHint: 'OPEN DATA REQUESTS: v',
    conductRedirectHint: 'CONDUCT (C4): u',
    turnNote: 'THIS TURN: t',
  });

  it('keeps the stable part byte-identical across turns of a case', () => {
    expect(buildPromptParts(late).stable).toBe(buildPromptParts(early).stable);
  });

  it('carries every per-turn input in the turn part only', () => {
    const { stable, turn } = buildPromptParts(late);
    for (const s of ['Current stage: ANALYSIS', 'COGS is 58% of revenue.', 'Bean price change', '(already on the candidate',
      'The stage moved on LAST turn', 'RECOMPUTE FLAG: x', 'UNIT-CONVERSION FLAG: y', 'STALL: z', 'COVERAGE: w',
      'OPEN DATA REQUESTS: v', 'CONDUCT (C4): u', 'THIS TURN: t', 'under a minute left']) {
      expect(turn).toContain(s);
      expect(stable).not.toContain(s);
    }
  });

  it('joins both parts for buildSystemPrompt', () => {
    const { stable, turn } = buildPromptParts(late);
    expect(buildSystemPrompt(late)).toBe(`${stable}\n\n${turn}`);
  });
});

// Prompt-consistency pass (2026-10-06): one rule per behaviour, an explicit
// precedence, and the exceptions the code already grants stated in the rules.
describe('buildSystemPrompt consistency', () => {
  const { stable } = buildPromptParts(ctx());

  it('states the precedence of turn notes over defaults', () => {
    expect(stable).toContain('PRIORITY — when two instructions disagree, the higher one wins');
    expect(stable).toContain('a committed recommendation beats any further probing or coverage');
  });

  it('allows the number sources the provenance guard allows', () => {
    expect(stable).toContain('appears in Revealed data or the case prompt');
    expect(stable).toContain('was stated by the candidate in this interview');
    expect(stable).toContain('is given to you by a RECOMPUTE FLAG this turn');
    expect(stable).not.toContain('most recent message');
  });

  it('lists the candidate-figure options once, with no competing count', () => {
    expect(stable).not.toMatch(/only three options|Four options/i);
  });

  it('carries no case-specific figures in the generic instructions', () => {
    for (const s of ['42%', '58%', '25% of COGS', 'beans', 'coffee']) expect(stable).not.toContain(s);
  });

  it('keeps the case prompt itself', () => {
    expect(buildPromptParts(ctx({ casePrompt: 'Beans cost 42% more.' })).stable).toContain('Beans cost 42% more.');
  });
});
