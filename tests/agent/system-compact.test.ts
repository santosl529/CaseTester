import { describe, it, expect } from 'vitest';
import { buildPromptParts, type PromptContext } from '@/lib/agent/prompts/system';
import { buildCompactPromptParts } from '@/lib/agent/prompts/system-compact';
import type { Phase } from '@/lib/orchestrator/state-machine';

const ctx = (currentPhase: Phase): PromptContext => ({
  casePrompt: 'Brew & Bean, 200 stores.', currentPhase, revealedValues: { cogs_pct: 'COGS is 58%' },
  unrevealedItems: [{ id: 'labor_pct', label: 'labor share' }], exhibits: [{ id: 'exhibit-a', title: 'Costs' }],
  advancedLastTurn: false, elapsedMs: 300_000, totalMs: 1_200_000, recomputeHint: 'RECOMPUTE FLAG: x',
});

describe('compact interviewer prompt (A/B arm)', () => {
  it('carries the same per-turn case state as the full prompt', () => {
    for (const p of ['STRUCTURE', 'ANALYSIS', 'RECOMMENDATION'] as Phase[]) {
      expect(buildCompactPromptParts(ctx(p)).turn).toBe(buildPromptParts(ctx(p)).turn);
    }
  });

  it('always keeps the numbers, accuracy, data, demeanor, role-lock and priority rules, and every reply field', () => {
    for (const p of ['INTRO', 'ANALYSIS', 'BRAINSTORM'] as Phase[]) {
      const s = buildCompactPromptParts(ctx(p)).stable;
      for (const needle of ['NUMBERS — hard rule', 'ACCURACY', 'DATA:', 'DEMEANOR', 'ROLE LOCK', 'PRIORITY', 'RECOMPUTE FLAG', 'Brew & Bean, 200 stores.']) expect(s).toContain(needle);
      const fields = ['"say"', '"move"', '"requests"', '"exhibit"', '"rescue_item"', '"question"'].map(f => s.indexOf(`- ${f}:`));
      expect(fields.every(i => i > 0)).toBe(true);
      expect([...fields].sort((a, b) => a - b)).toEqual(fields); // schema order
      for (const k of ['"what"', '"item_ids"', '"explicit"', '"respond"']) expect(s).toContain(k);
    }
  });

  it('includes stage-specific rules only in their stages', () => {
    const s = (p: Phase) => buildCompactPromptParts(ctx(p)).stable;
    expect(s('STRUCTURE')).toContain('pressure test');
    expect(s('ANALYSIS')).not.toContain('FRAMEWORK:');
    expect(s('ANALYSIS')).toContain('Points of what?');
    expect(s('STRUCTURE')).not.toContain('MATH:');
    expect(s('RECOMMENDATION')).toContain('never ask for it again');
    expect(s('RECOMMENDATION')).not.toContain('MATH:');
  });

  it('is at least 40% shorter than the full fixed prompt', () => {
    for (const p of ['STRUCTURE', 'ANALYSIS', 'RECOMMENDATION'] as Phase[]) {
      expect(buildCompactPromptParts(ctx(p)).stable.length).toBeLessThan(buildPromptParts(ctx(p)).stable.length * 0.6);
    }
  });
});
