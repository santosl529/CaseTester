// The engine switch lists (Lorenzo, 27 Oct, at the phase1 → phase2 merge): every switch in exactly one list, no preset
// switch outside a preset, and the presets as ruled.
import { describe, it, expect } from 'vitest';
import { PHASE1_SWITCHES, PHASE2_SWITCHES, NON_PRESET_SWITCHES, ALL_SWITCHES } from '@/lib/cases/engine-switches';

describe('engine switch lists', () => {
  it('no switch appears in more than one list, or twice in one', () => {
    const all = [...PHASE1_SWITCHES, ...PHASE2_SWITCHES, ...NON_PRESET_SWITCHES];
    expect(new Set(all).size).toBe(all.length);
    expect(ALL_SWITCHES.length).toBe(all.length);
  });
  it('NON_PRESET_SWITCHES holds no preset switch', () => {
    const preset = new Set<string>([...PHASE1_SWITCHES, ...PHASE2_SWITCHES]);
    expect(NON_PRESET_SWITCHES.filter(s => preset.has(s))).toEqual([]);
  });
  it('the presets as ruled', () => {
    expect(PHASE1_SWITCHES).toEqual(expect.arrayContaining(['ofAsMultiplication', 'scaleWordReading']));
    expect(PHASE2_SWITCHES).toEqual(expect.arrayContaining(['refusalAssume', 'asyncAskJudge']));
    for (const s of ['checkerEquations', 'checkerEquationsAsync', 'equationClears', 'speechNormalization'] as const) {
      expect(NON_PRESET_SWITCHES).toContain(s);
    }
  });
});

describe('caseNotesDraft overlay (fact-check.ts withCaseNotes)', () => {
  it('never mutates the cached fact base', async () => {
    const { factBaseFor } = await import('@/lib/orchestrator/fact-check');
    const { getCaseById } = await import('@/lib/cases/loader');
    const c = getCaseById('pricing-001');
    const prev = process.env.ENGINE_SWITCHES;
    try {
      delete process.env.ENGINE_SWITCHES;
      const cached = factBaseFor(c as never);
      const before = JSON.stringify({ covers: cached.covers, notHeld: cached.notHeld ?? null });
      process.env.ENGINE_SWITCHES = '*=caseNotesDraft';
      const overlay = factBaseFor(c as never);
      expect(overlay).not.toBe(cached);
      expect(overlay.notHeld?.length ?? 0).toBeGreaterThan(0);
      delete process.env.ENGINE_SWITCHES;
      expect(factBaseFor(c as never)).toBe(cached);
      expect(JSON.stringify({ covers: cached.covers, notHeld: cached.notHeld ?? null })).toBe(before);
    } finally { if (prev === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = prev; }
  });
});
