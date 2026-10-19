import { describe, it, expect } from 'vitest';
import { summarizeAssists, summarizeCoverage, summarizePressureTest, type InterventionEvent } from '@/lib/scoring/assists';

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

// v3 (batch 18, 10 Oct): code can close an unanswered pressure test (the
// waiver). Scoring is told what happened — whether the probe was delivered,
// the questions and replies, that code closed it — neutrally: not an assist,
// not an unanswered question, not "needs work" by itself.
describe('summarizePressureTest', () => {
  const transcript = [
    { role: 'candidate', turnIndex: 3, text: 'Revenue, costs, and the market.' },
    { role: 'interviewer', turnIndex: 4, text: 'Three buckets. Is that MECE, and what is missing?' },
    { role: 'candidate', turnIndex: 5, text: 'Can I get the cost breakdown?' },
    { role: 'interviewer', turnIndex: 6, text: "I'll share the cost breakdown once we've settled your structure. Before I share that data, I'd like your answer on the structure: what might be missing from your structure?" },
    { role: 'candidate', turnIndex: 7, text: "I'm not sure." },
    { role: 'interviewer', turnIndex: 8, text: "Let me make it concrete: name one thing your structure doesn't cover yet." },
    { role: 'candidate', turnIndex: 9, text: 'I really don’t know.' },
    { role: 'interviewer', turnIndex: 10, text: "COGS is 58% of revenue. Let's leave the structure there. What do those figures tell you?" },
  ];
  const waived = (payload: Record<string, unknown>) => ({ subtype: 'pressure_test_waived', phase: 'STRUCTURE', payloadJsonb: payload });

  // Lorenzo, 19 Oct: "nothing is missing" closes the probe; any gap goes in the report, not more probing.
  it('records a probe closed by "nothing is missing": the reply, the switch, and completeness left to the report', () => {
    const s = summarizePressureTest([{ subtype: 'pressure_test_nothing_missing', phase: 'STRUCTURE', payloadJsonb: {
      probe: 'Is that structure MECE, and what might be missing from it?', askedAt: 8, replyTurn: 9, reply: 'Yes. It is MECE, and nothing is missing.', branchAsked: true,
    } }], transcript);
    expect(s).toMatch(/PRESSURE TEST/);
    expect(s).toMatch(/turn 9: "Yes\. It is MECE, and nothing is missing\."/);
    expect(s).toMatch(/structure key/);
    expect(s).toMatch(/name (it|any gap)/i);
    expect(s).not.toMatch(/unanswered/);
  });

  it('records a delivered probe that code closed: the questions, the replies, the closure — neutrally', () => {
    const s = summarizePressureTest([waived({
      from: 'awaiting', probeDelivered: true, probe: 'Three buckets. Is that MECE, and what is missing?', askedAt: 4,
      followUps: ["Before I share that data, I'd like your answer on the structure: what might be missing from your structure?", "Let me make it concrete: name one thing your structure doesn't cover yet."],
      replyTurns: [5, 7, 9], waivedAt: 10, released: ['cogs_pct'],
    })], transcript);
    expect(s).toMatch(/PRESSURE TEST/);
    expect(s).toMatch(/delivered \(turn 4\): "Three buckets\. Is that MECE, and what is missing\?"/);
    expect(s).toMatch(/turn 6\): "Before I share that data/);
    expect(s).toMatch(/turn 8\): "Let me make it concrete/);
    expect(s).toMatch(/turn 5: "Can I get the cost breakdown\?"/);
    expect(s).toMatch(/turn 9: "I really don’t know\."/);
    expect(s).toMatch(/code closed the probe .*turn 10/);
    expect(s).toMatch(/not an assist, not an unanswered question/);
    expect(s).not.toMatch(/needs work|INTERVIEWER ASSISTS|coverageCaveat/);
  });

  it('a never-asked waiver says the pressure test was not administered', () => {
    const s = summarizePressureTest([waived({
      from: 'not_asked', probeDelivered: false, followUps: [], structureAsked: true, replyTurns: [], waivedAt: 10, released: ['cogs_pct'],
    })], transcript);
    expect(s).toMatch(/No pressure-test probe was delivered/);
    expect(s).toMatch(/NOT administered/);
    expect(s).not.toMatch(/was delivered \(turn/);
  });

  it('says nothing without a waiver, and a waiver is never listed as an assist', () => {
    expect(summarizePressureTest([], transcript)).toBe('');
    expect(summarizeAssists([waived({ from: 'awaiting', probeDelivered: true, followUps: [], replyTurns: [], waivedAt: 10, released: [] })])).toBe('');
  });
});
