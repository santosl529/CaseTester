import { describe, it, expect, vi } from 'vitest';

const rows: { eventType: string; payloadJsonb: Record<string, unknown> }[] = [];
vi.mock('@/db/client', () => ({ db: { insert: () => ({ values: async (v: (typeof rows)[number]) => { rows.push(v); } }) } }));

const { logEvent, inDraftScope } = await import('@/lib/analytics');

describe('logEvent', () => {
  it('tags model usage logged inside a speculative draft with its id', async () => {
    await inDraftScope('d1', () => logEvent('llm_usage', { component: 'distress' }));
    await logEvent('llm_usage', { component: 'interviewer' });
    await inDraftScope('d1', () => logEvent('turn_latency', { totalMs: 1 }));
    expect(rows.map(r => r.payloadJsonb.speculativeDraftId)).toEqual(['d1', undefined, undefined]);
  });
});
