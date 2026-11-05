// The live demo's Brew & Bean (Lorenzo, 4 Nov): a copy of prof-001 — same facts, ledger and answers — on a
// 7-minute clock, with no brainstorm owed and no pressure test. Every other field must stay prof-001's, so a later
// edit to prof-001 that isn't copied here fails this test instead of letting the two drift.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getCaseById } from '@/lib/cases/loader';
import { resolvePhaseBudgets, stageDeadlinesMs } from '@/lib/orchestrator/pacing';
import { caseTotalMs } from '@/lib/orchestrator/state-machine';

const raw = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
const OWN = ['id', 'pacing', 'brainstorm', 'skipPressureTest'];
const without = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

describe('prof-001-demo', () => {
  it('is prof-001 except its id, pacing, brainstorm.required and skipPressureTest', () => {
    const src = raw('cases/prof-001.json'), demo = raw('cases/prof-001-demo.json');
    expect(without(demo, OWN)).toEqual(without(src, OWN));
    expect(demo.brainstorm).toEqual({ ...(src.brainstorm as object), required: false });
    expect(demo.skipPressureTest).toBe(true);
    expect(src.skipPressureTest).toBeUndefined();
  });

  it('its Phase 1 overlay and data-line versions are prof-001\'s, under its own id', () => {
    for (const [a, b] of [['cases/phase1/prof-001.json', 'cases/phase1/prof-001-demo.json'], ['cases/variants/prof-001.data-lines.json', 'cases/variants/prof-001-demo.data-lines.json']]) {
      const src = raw(a), demo = raw(b);
      expect(demo.caseId).toBe('prof-001-demo');
      expect({ ...demo, caseId: 'prof-001' }).toEqual(src);
    }
  });

  it('loads with the overlay applied exactly as prof-001\'s', () => {
    const src = getCaseById('prof-001'), demo = getCaseById('prof-001-demo');
    expect(without(demo as never, OWN)).toEqual(without(src as never, OWN));
  });

  it('runs a 7-minute clock whose budgets sum to it; stage deadlines 3:45 / 4:45 / 5:00; 60 s warning', () => {
    const demo = getCaseById('prof-001-demo');
    expect(caseTotalMs(demo)).toBe(420_000);
    expect(demo.pacing?.timeWarningMs).toBe(60_000);
    const budgets = resolvePhaseBudgets(demo, caseTotalMs(demo));
    expect(Object.values(demo.pacing!.phaseBudgetsMs!).reduce((a, b) => a + (b ?? 0), 0)).toBe(420_000);
    expect(stageDeadlinesMs(budgets)).toEqual({ analysisEnd: 225_000, exhibitEnd: 285_000, brainstormEnd: 300_000 });
  });
});
