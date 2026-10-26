// Exact labels for the Haiku ask-check calls (contract §5 Stream 1 task 2): extraction and the tables.
import { describe, it, expect } from 'vitest';
import { askCheckCalls, verdictKind, labelTables, ASK_LABELS, type LabelledCall } from '@/lib/eval/ask-check-labels';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

const turn = (turnIndex: number, details: Record<string, unknown>[]) => ({ turnIndex, checks: details.map(detail => ({ check: 'itemless_defer', decision: 'pass', detail })) }) as unknown as TurnRecord;

describe('askCheckCalls', () => {
  it('reads one call per itemless_defer check, keyed by slice, persona, grading turn and order', () => {
    const calls = askCheckCalls('b36l', '40', [turn(1, [{ what: 'total departures', mapped: false, found: [{ what: 'x', ids: [] }], decision: 'refuse', latencyMs: 420 }, { what: 'the cost lines', mapped: true, found: [{ what: 'y', ids: ['fixed_costs'] }], decision: 'items', latencyMs: 1037 }])]);
    expect(calls.map(c => c.key)).toEqual(['b36l-40-t2-1', 'b36l-40-t2-2']);
    expect(calls[1]).toMatchObject({ ask: 'the cost lines', verdict: 'items', ids: ['fixed_costs'], latencyMs: 1037 });
  });

  it('names the verdict: none, items, coarse, partial, out of scope, or a timeout', () => {
    expect(verdictKind({ mapped: null, found: null, latencyMs: 1502 })).toBe('timeout');
    expect(verdictKind({ mapped: false, found: [] })).toBe('none');
    expect(verdictKind({ mapped: true, found: [{ ids: ['a'] }] })).toBe('items');
    expect(verdictKind({ mapped: true, found: [{ ids: ['a'] }], decision: 'coarse' })).toBe('coarse');
    expect(verdictKind({ mapped: true, found: [{ ids: ['a', 'b'] }], decision: 'items', partial: ['b'] })).toBe('items+partial');
    expect(verdictKind({ mapped: true, found: [{ ids: ['a'] }], outOfScope: ['a'] })).toBe('out_of_scope');
  });
});

describe('labelTables', () => {
  const call = (key: string, batch: string, verdict: string, label: LabelledCall['label']): LabelledCall => ({ key, batch, persona: '07', turn: 2, ask: 'a', verdict, ids: [], latencyMs: 500, label, note: '' });
  it('counts labels per batch, precision on positives and the false-none rate', () => {
    const t = labelTables([
      call('a', 'b33', 'none', 'correct_none'), call('b', 'b33', 'none', 'false_none'),
      call('c', 'b34a', 'items', 'correct_item'), call('d', 'b34a', 'items', 'wrong_item'), call('e', 'b34a', 'coarse', 'partly_right'),
      call('f', 'b34a', 'timeout', 'timeout'),
    ]);
    expect(t.byBatch.b33).toMatchObject({ correct_none: 1, false_none: 1, calls: 2 });
    expect(t.total).toMatchObject({ calls: 6, positives: 3, nones: 2, timeouts: 1 });
    expect(t.total.precisionStrict).toBeCloseTo(1 / 3);
    expect(t.total.precisionLenient).toBeCloseTo(2 / 3);
    expect(t.total.falseNoneRate).toBeCloseTo(1 / 2);
    expect(ASK_LABELS).toEqual(['correct_item', 'wrong_item', 'correct_none', 'false_none', 'partly_right', 'timeout']);
  });
});

describe('evals/ask-check-labels/labels.json', () => {
  it('labels all 78 recorded calls of b33–b38 with one of the labels, each with its ask', async () => {
    const { readFileSync } = await import('node:fs');
    const labels = JSON.parse(readFileSync('evals/ask-check-labels/labels.json', 'utf8')) as Record<string, { ask: string; label: string }>;
    expect(Object.keys(labels)).toHaveLength(78);
    for (const [k, l] of Object.entries(labels)) {
      expect(ASK_LABELS, k).toContain(l.label);
      expect(l.ask.length, k).toBeGreaterThan(3);
    }
  });
});
