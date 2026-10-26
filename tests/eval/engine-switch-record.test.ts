// The run header and the batch manifest record engineSwitchesOf(case) (Phase 1 contract §3).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planWave, engineSwitchNames } from '@/lib/eval/batch-manifest';

const base = { commit: 'c1', codeDirty: false, codeChanged: false, date: new Date('2026-10-22T10:00:00'), models: { interviewer: 'claude-sonnet-5-5' }, knownIds: [7, 24, 64, 65] };

describe('engine switch record', () => {
  it('names the switches on for a case, in contract order; none without the env', () => {
    expect(engineSwitchNames({ id: 'prof-002' }, {})).toEqual([]);
    expect(engineSwitchNames({ id: 'prof-002' }, { ENGINE_SWITCHES: 'prof-002=ackRotation,itemCovers' })).toEqual(['itemCovers', 'ackRotation']);
    expect(engineSwitchNames({ id: 'prof-001' }, { ENGINE_SWITCHES: 'prof-002=ackRotation' })).toEqual([]);
    expect(engineSwitchNames({ id: 'prof-001' }, { ENGINE_SWITCHES: '*=phase1' }).length).toBeGreaterThan(20);
  });

  it('stamps every planned run of a wave with the switches', () => {
    const w = planWave(null, { ...base, personaIds: [7, 65], engineSwitches: ['itemCovers'] });
    expect(w.entries.map(e => e.engineSwitches)).toEqual([['itemCovers'], ['itemCovers']]);
    const off = planWave(null, { ...base, personaIds: [7] });
    expect(off.entries[0].engineSwitches).toEqual([]);
  });

  it('live-run writes them into the turn-file header, persona-batch into the manifest', () => {
    expect(readFileSync('scripts/live-run.ts', 'utf8')).toMatch(/engineSwitches: engineSwitchNames\(caseData\)/);
    expect(readFileSync('scripts/persona-batch.ts', 'utf8')).toMatch(/engineSwitches: engineSwitchNames\(getCaseById\(caseId\)\)/);
  });
});
