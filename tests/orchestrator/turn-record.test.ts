import { describe, it, expect } from 'vitest';
import { TurnRecorder, type TurnStateBefore } from '@/lib/orchestrator/turn-record';

const state: TurnStateBefore = {
  phase: 'ANALYSIS', elapsedMs: 300_000, kind: 'model', promptContext: null,
  revealedIds: ['cogs_pct'], shownExhibitIds: [], openDataRequests: [], pressureTest: { state: 'satisfied' },
  stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: ['can I get'],
};

describe('TurnRecorder', () => {
  it('collects requests, outputs, usage and segments with times from the turn start', () => {
    let t = 1000;
    const rec = new TurnRecorder(1000, () => t);
    rec.setState(state);
    t = 1100; rec.request('first', 'claude-sonnet-5-5', { model: 'claude-sonnet-5-5', messages: [] });
    t = 1900; rec.output('first', '{"say":"Got it."}');
    rec.usage({ component: 'interviewer', model: 'claude-sonnet-5-5', inputTokens: 10, outputTokens: 5 });
    t = 2000; rec.segment({ kind: 'say', text: 'Got it.', revealIds: [] });
    t = 2500; rec.segment({ kind: 'tail', text: 'What next?', revealIds: [] });
    const r = rec.finish({
      sessionId: 's1', turnIndex: 4, candidateText: 'Can I get costs?', checks: [{ check: 'vetoes', decision: 'pass' }],
      savedLine: 'Got it. What next?', phaseAfter: 'ANALYSIS', ended: false, timing: { plan_done: 30 },
    });
    expect(r.type).toBe('turn');
    expect(r.requests).toEqual([{ attempt: 'first', model: 'claude-sonnet-5-5', body: { model: 'claude-sonnet-5-5', messages: [] }, atMs: 100 }]);
    expect(r.outputs).toEqual([{ attempt: 'first', text: '{"say":"Got it."}', atMs: 900 }]);
    expect(r.delivered.map(s => [s.kind, s.atMs])).toEqual([['say', 1000], ['tail', 1500]]);
    expect(r.usage).toHaveLength(1);
    expect(r.stateBefore).toEqual(state);
    expect(r.parsedTurn).toBeNull();
  });

  it('keeps the request body as a snapshot (later mutation does not change the record)', () => {
    const rec = new TurnRecorder(0, () => 0);
    const body = { messages: [{ role: 'user', content: 'a' }] };
    rec.request('first', 'm', body);
    body.messages.push({ role: 'user', content: 'b' });
    rec.setState(state);
    const r = rec.finish({ sessionId: 's', turnIndex: 0, candidateText: '', checks: [], savedLine: '', phaseAfter: 'INTRO', ended: false, timing: {} });
    expect((r.requests[0].body as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it('refuses to finish without a state snapshot', () => {
    const rec = new TurnRecorder(0, () => 0);
    expect(() => rec.finish({ sessionId: 's', turnIndex: 0, candidateText: '', checks: [], savedLine: '', phaseAfter: 'INTRO', ended: false, timing: {} }))
      .toThrow('state');
  });
});
