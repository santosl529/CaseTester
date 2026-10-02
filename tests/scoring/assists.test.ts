import { describe, it, expect } from 'vitest';
import { summarizeAssists, summarizeCoverage, type InterventionEvent } from '@/lib/scoring/assists';

describe('summarizeAssists', () => {
  it('returns empty string when there were no assists', () => {
    expect(summarizeAssists([])).toBe('');
  });

  it('summarizes rung assists with their phase', () => {
    const events: InterventionEvent[] = [
      { subtype: 'restate_anchor', phase: 'STRUCTURE', payloadJsonb: { level: 1 } },
      { subtype: 'directive_rescue', phase: 'ANALYSIS', payloadJsonb: { level: 3 } },
    ];
    const summary = summarizeAssists(events);
    expect(summary).toContain('Level 1');
    expect(summary).toContain('Level 3 directive rescue');
    expect(summary).toContain('STRUCTURE');
    expect(summary).toContain('ANALYSIS');
  });

  it('always states assists are performance data, not a coverage gap', () => {
    const summary = summarizeAssists([{ subtype: 'narrow_frame', phase: 'ANALYSIS', payloadJsonb: {} }]);
    expect(summary).toContain('do NOT apply a coverageCaveat');
  });

  it('notes an unresolved synthesis', () => {
    const summary = summarizeAssists([{ subtype: 'synthesis_unresolved', phase: 'RECOMMENDATION', payloadJsonb: {} }]);
    expect(summary).toContain('closed without one');
  });

  it('ignores unknown subtypes gracefully', () => {
    expect(summarizeAssists([{ subtype: 'mystery', phase: null, payloadJsonb: {} }])).toBe('');
  });

  it('does not treat load_shed as an assist (that is coverage, opposite framing)', () => {
    expect(summarizeAssists([{ subtype: 'load_shed', phase: 'ANALYSIS', payloadJsonb: {} }])).toBe('');
  });
});

describe('summarizeCoverage (Rule 15 → Rule 9 coverageCaveat)', () => {
  it('returns empty when there was no load-shedding', () => {
    expect(summarizeCoverage([{ subtype: 'restate_anchor', phase: 'STRUCTURE', payloadJsonb: {} }])).toBe('');
  });

  it('attributes thin later-stage coverage to time pressure, not the candidate', () => {
    const summary = summarizeCoverage([{ subtype: 'load_shed', phase: 'ANALYSIS', payloadJsonb: { remainingMs: 80000 } }]);
    expect(summary).toContain('TIME-PRESSURE COVERAGE');
    expect(summary).toContain('ANALYSIS');
    expect(summary).toContain('coverageCaveat rather than a low rating');
  });

  it('does not excuse errors in what was actually covered', () => {
    const summary = summarizeCoverage([{ subtype: 'load_shed', phase: 'ANALYSIS', payloadJsonb: {} }]);
    expect(summary).toContain('does not excuse errors the candidate actually made');
  });
});

describe('summarizeAssists — delivered rungs only (Rule 13 v4.5)', () => {
  it('never counts an undelivered rung as an assist', () => {
    expect(summarizeAssists([{ subtype: 'rung_not_delivered', phase: 'EXHIBIT', payloadJsonb: { level: 1 } }])).toBe('');
  });

  it('shows the delivered hint text', () => {
    const out = summarizeAssists([{ subtype: 'restate_anchor', phase: 'EXHIBIT', payloadJsonb: { level: 1, span: 'Take your time.' } }]);
    expect(out).toContain('the interviewer said: "Take your time."');
  });
});
