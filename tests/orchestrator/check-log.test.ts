import { describe, it, expect } from 'vitest';
import { CheckLog, toCheckEventRows, summarizeCheckEvents } from '@/lib/orchestrator/check-log';

describe('CheckLog (Part V v4.6: every check records its decision)', () => {
  it('records pass, act and skip — "checked, nothing found" included', () => {
    const log = new CheckLog();
    log.pass('provenance');
    log.act('stall', 'rung 1 fired', { rung: 1 });
    log.skip('same_turn_resolution', 'recommendation-ask turn');
    log.record('unit_check', false, 'nested conversion');
    log.record('meta_leak', true, 'stripped', { sentences: ['x'] });
    expect(log.entries.map(e => [e.check, e.decision])).toEqual([
      ['provenance', 'pass'], ['stall', 'act'], ['same_turn_resolution', 'skip'], ['unit_check', 'pass'], ['meta_leak', 'act'],
    ]);
    expect(log.entries[1]).toEqual({ check: 'stall', decision: 'act', reason: 'rung 1 fired', detail: { rung: 1 } });
  });

  it('maps entries to check session-event rows keyed by the candidate turn', () => {
    const log = new CheckLog();
    log.pass('provenance');
    log.act('stall', 'rung 1 fired', { rung: 1 });
    expect(toCheckEventRows(log, { sessionId: 's', turnIndex: 7, phase: 'ANALYSIS' })).toEqual([
      { sessionId: 's', category: 'check', subtype: 'provenance', turnIndex: 7, phase: 'ANALYSIS', payloadJsonb: { decision: 'pass' } },
      { sessionId: 's', category: 'check', subtype: 'stall', turnIndex: 7, phase: 'ANALYSIS', payloadJsonb: { decision: 'act', reason: 'rung 1 fired', detail: { rung: 1 } } },
    ]);
  });

  it('summarizes per check with the turns it acted on', () => {
    const rows = [
      { subtype: 'stall', turnIndex: 1, payloadJsonb: { decision: 'pass' } },
      { subtype: 'stall', turnIndex: 3, payloadJsonb: { decision: 'act' } },
      { subtype: 'provenance', turnIndex: 1, payloadJsonb: { decision: 'skip' } },
      { subtype: 'junk', turnIndex: 1, payloadJsonb: null },
    ];
    expect(summarizeCheckEvents(rows)).toEqual([
      { check: 'provenance', pass: 0, act: 0, skip: 1, actedAt: [] },
      { check: 'stall', pass: 1, act: 1, skip: 0, actedAt: [3] },
    ]);
  });
});
