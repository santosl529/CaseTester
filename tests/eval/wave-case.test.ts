import { describe, it, expect } from 'vitest';
import { liveRunArgs } from '@/lib/eval/wave-commands';

describe('wave commands run the batch case', () => {
  const e = { personaId: 14, runNumber: 8, wave: 'w', version: 'v2', rerun: 0 } as never;
  it('defaults to prof-001; --case passes the case id to live-run', () => {
    expect(liveRunArgs(e, { pace: 'human', batch: 'batch-22' })[1]).toBe('prof-001');
    expect(liveRunArgs(e, { pace: 'human', batch: 'batch-22', caseId: 'entry-001' })[1]).toBe('entry-001');
  });
});
