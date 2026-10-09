import { describe, it, expect } from 'vitest';
import { headline } from '@/lib/eval/headline';
import type { ScorecardRow } from '@/lib/eval/scorecard';
import type { FaultRecord } from '@/lib/eval/prescreen';

const row = (runId: string, modelTurns: number) => ({ runId, modelTurns } as unknown as ScorecardRow);
const fault = (runId: string, turnIndex: number, severity: FaultRecord['severity'], status: FaultRecord['status'] = 'confirmed') => ({ runId, turnIndex, severity, status } as FaultRecord);

describe('headline', () => {
  it('counts interviews with a confirmed serious fault, faults per 100 turns and the longest faulty stretch', () => {
    const h = headline([row('a', 20), row('b', 30)], [
      fault('a', 4, 'serious'), fault('a', 6, 'moderate'), fault('a', 8, 'minor'), fault('a', 12, 'moderate'),
      fault('b', 2, 'serious', 'rejected'), fault('b', 10, 'moderate', 'proposed'),
    ]);
    expect(h.interviews).toBe(2);
    expect(h.withSerious).toBe(1);
    expect(h.confirmedFaults).toBe(4);
    expect(h.faultsPer100Turns).toBeCloseTo(8);         // 4 / 50 turns
    expect(h.longestFaultyStretch).toEqual([{ runId: 'a', turns: 3 }, { runId: 'b', turns: 0 }]); // turns 4, 6, 8 are consecutive interviewer turns
  });
});
