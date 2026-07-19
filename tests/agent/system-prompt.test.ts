import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type PromptContext } from '@/lib/agent/prompts/system';

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

describe('buildSystemPrompt phase pacing', () => {
  it('includes the phase guide with exit criteria', () => {
    const prompt = buildSystemPrompt(ctx());
    expect(prompt).toContain('Phase sequence and when to advance');
    expect(prompt).toContain('STRUCTURE: candidate presents their framework');
  });

  it('forbids announcing phase transitions', () => {
    expect(buildSystemPrompt(ctx())).toContain('NEVER announce transitions');
  });

  it('forbids the interviewer from delivering feedback/scoring in its own closing turn', () => {
    const prompt = buildSystemPrompt(ctx());
    expect(prompt).toContain('do not summarize how the candidate did');
    expect(prompt).toContain('belongs solely to the separate written report');
  });

  it('gates visible behavior shift (not bookkeeping) on the turn after an advance', () => {
    const prompt = buildSystemPrompt(ctx({ advancedLastTurn: true }));
    expect(prompt).toContain('You advanced the phase LAST turn');
    expect(prompt).toContain('No visible gear-shift');
  });

  it('adds a pacing alert when ≥2 phases behind a uniform schedule', () => {
    // 80% elapsed, still in CLARIFY (index 1 of 8 active phases)
    const prompt = buildSystemPrompt(ctx({ elapsedMs: 0.8 * TOTAL }));
    expect(prompt).toContain('PACING ALERT');
    expect(prompt).toContain('still in CLARIFY');
  });

  it('no pacing alert when on schedule', () => {
    const prompt = buildSystemPrompt(ctx({ currentPhase: 'ANALYSIS', elapsedMs: 0.4 * TOTAL }));
    expect(prompt).not.toContain('PACING ALERT');
  });

  it('no pacing alert on the turn after an advance (would contradict the block)', () => {
    const prompt = buildSystemPrompt(ctx({ elapsedMs: 0.8 * TOTAL, advancedLastTurn: true }));
    expect(prompt).not.toContain('PACING ALERT');
  });

  it('uses per-phase budgets from case config instead of a uniform schedule (Rule 8)', () => {
    // STRUCTURE has a long 200s budget; 60% elapsed (180s) is still within it,
    // even though a uniform 8-way split would have flagged this phase as overrun.
    const phaseBudgetsMs = {
      INTRO: 10_000, CLARIFY: 10_000, STRUCTURE: 200_000, ANALYSIS: 20_000,
      EXHIBIT: 20_000, BRAINSTORM: 20_000, RECOMMENDATION: 10_000, WRAP: 10_000,
    };
    const prompt = buildSystemPrompt(ctx({
      currentPhase: 'STRUCTURE', elapsedMs: 0.6 * TOTAL, phaseBudgetsMs,
    }));
    expect(prompt).not.toContain('PACING ALERT');
  });

  it('fires when the current phase exceeds its own configured budget', () => {
    const phaseBudgetsMs = {
      INTRO: 10_000, CLARIFY: 10_000, STRUCTURE: 20_000, ANALYSIS: 20_000,
      EXHIBIT: 20_000, BRAINSTORM: 20_000, RECOMMENDATION: 10_000, WRAP: 10_000,
    };
    const prompt = buildSystemPrompt(ctx({
      currentPhase: 'STRUCTURE', elapsedMs: 45_000, phaseBudgetsMs, // past INTRO+CLARIFY+STRUCTURE=40s budget
    }));
    expect(prompt).toContain('PACING ALERT');
    expect(prompt).toContain("budget is used up");
  });
});

describe('buildSystemPrompt recompute hint', () => {
  it('includes the recompute hint text when provided', () => {
    const prompt = buildSystemPrompt(ctx({
      recomputeHint: 'RECOMPUTE FLAG (deterministic, from the candidate\'s message this turn...): test hint',
    }));
    expect(prompt).toContain('RECOMPUTE FLAG');
    expect(prompt).toContain('test hint');
  });

  it('omits any recompute section when not provided', () => {
    const prompt = buildSystemPrompt(ctx());
    expect(prompt).not.toContain('RECOMPUTE FLAG');
  });
});

describe('buildSystemPrompt stall guidance', () => {
  it('injects stall guidance and marks it as taking priority this turn', () => {
    const prompt = buildSystemPrompt(ctx({
      stallGuidance: 'STALL INTERVENTION — Level 3 (directive rescue). Hand them the branch.',
    }));
    expect(prompt).toContain('STALL INTERVENTION — Level 3');
    expect(prompt).toContain('takes priority over the demeanor/rigor defaults');
  });

  it('omits stall guidance when not provided', () => {
    expect(buildSystemPrompt(ctx())).not.toContain('STALL INTERVENTION');
  });
});

describe('buildSystemPrompt coverage gating', () => {
  it('forbids ending and surfaces the steer when mayEnd is false', () => {
    const prompt = buildSystemPrompt(ctx({
      mayEnd: false,
      coverageSteer: 'COVERAGE — these areas are still undertested ...: Quantitative (30/100).',
    }));
    expect(prompt).toContain('Do NOT use end_case yet');
    expect(prompt).toContain('Quantitative (30/100)');
  });

  it('permits ending when mayEnd is true', () => {
    const prompt = buildSystemPrompt(ctx({ mayEnd: true }));
    expect(prompt).toContain('Use end_case only once the candidate has delivered a committed recommendation');
  });
});

describe('buildSystemPrompt load-shedding (Rule 15)', () => {
  it('injects the shed directive in the final stretch', () => {
    // 60s remaining of 5 min → inside the 90s shed window
    const prompt = buildSystemPrompt(ctx({ elapsedMs: TOTAL - 60_000 }));
    expect(prompt).toContain('TIME PRESSURE — SHED OPTIONAL PROBING');
    expect(prompt).toContain('drive the candidate to deliver their final recommendation');
  });

  it('does not inject the shed directive early in the case', () => {
    expect(buildSystemPrompt(ctx({ elapsedMs: 0.4 * TOTAL }))).not.toContain('SHED OPTIONAL PROBING');
  });
});
