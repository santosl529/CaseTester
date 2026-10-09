// tests/eval/scorecard.test.ts
import { describe, it, expect } from 'vitest';
import { scorecardRow, firstRelevantMs, maxSameQuestion, rowsOfVersion, isRerun, type RunRecord, type ScorecardRow } from '@/lib/eval/scorecard';
import type { TurnFileHeader, TurnFileEnd } from '@/lib/eval/turn-file';
import { stageAdministration } from '@/lib/orchestrator/spoken-close';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

const turn = (i: number, over: Partial<TurnRecord> = {}): TurnRecord => ({
  type: 'turn', sessionId: 's', turnIndex: i, candidateText: 'c',
  stateBefore: { phase: 'ANALYSIS', elapsedMs: 0, kind: 'model', promptContext: null, revealedIds: [], shownExhibitIds: [], openDataRequests: [], pressureTest: null, stallRung: null, verifiedFigures: [], recomputeFlags: [], requestCues: [] },
  requests: [], outputs: [], parsedTurn: null, validation: null, checks: [],
  delivered: [{ kind: 'tail', text: 'Q?', revealIds: [], atMs: 1500 }], savedLine: 'Q?', phaseAfter: 'ANALYSIS', ended: false, timing: {}, usage: [], ...over,
});
const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  session: { id: 's', status: 'completed' },
  turns: [{ turnIndex: 0, role: 'interviewer', text: 'Your client…' }, { turnIndex: 1, role: 'candidate', text: 'c' }, { turnIndex: 2, role: 'interviewer', text: 'What would you brainstorm? What is the biggest risk? What is your recommendation?' }],
  score: { structureRating: 'meets_bar', quantitativeRating: 'strong' }, events: [], analytics: [], ...over,
});

describe('scorecard', () => {
  it('first relevant spoken text: a non-acknowledgment say sentence, else the data line, else the tail', () => {
    expect(firstRelevantMs(turn(0, { delivered: [{ kind: 'say', text: 'Got it.', revealIds: [], atMs: 400 }, { kind: 'data', text: 'COGS is 58%.', revealIds: ['cogs_pct'], atMs: 900 }, { kind: 'tail', text: 'Q?', revealIds: [], atMs: 1500 }] }))).toBe(900);
    expect(firstRelevantMs(turn(0, { delivered: [{ kind: 'say', text: 'You split it three ways.', revealIds: [], atMs: 600 }, { kind: 'tail', text: 'Q?', revealIds: [], atMs: 1500 }] }))).toBe(600);
    expect(firstRelevantMs(turn(0, { delivered: [] }))).toBeNull();
  });

  it('counts the same question asked again (near-identical wording)', () => {
    expect(maxSameQuestion(['Is that MECE — what is missing?', 'Is that MECE, what is missing?', 'Which branch first?', 'Is that MECE? What is missing?'])).toBe(3);
  });

  it('a run with a turn file: completion, stages, loop flag, performance and ratings', () => {
    const turns = [0, 1, 2, 3].map(i => turn(i, { savedLine: 'Is that MECE — what is missing?', delivered: [{ kind: 'tail', text: 'Is that MECE — what is missing?', revealIds: [], atMs: 1000 + i * 100 }] }));
    const row = scorecardRow({
      runId: 'r1', run: run(),
      turnFile: { header: { type: 'header', batch: 'batch-18', version: 'v1', wave: 'w', runNumber: 3, commit: 'c', dirty: false, models: {}, persona: { id: 18, name: 'Nikhil', brief: '' }, sessionId: 's', startedAt: '' }, turns, end: { type: 'end', ended: true, budgetStopped: false, scoring: 'scored', candidateUsage: { calls: 1, input: 1, output: 1, usd: 0.24 } } },
    });
    expect(row.completion).toBe('ended');
    expect(row.stuck).toBe(true);
    expect(row.codeFlags.some(f => f.kind === 'loop')).toBe(true);
    expect(row.stages).toEqual(stageAdministration(run().turns.filter(t => t.role === 'interviewer').map(t => t.text), false));
    expect(row.performance.firstRelevantMedianMs).toBe(1200);
    expect(row.performance.simulatorCostUsd).toBeCloseTo(0.24);
    expect(row.ratings.quantitative).toBe('strong');
    expect(row.ratings.pushback).toBeNull();
    expect(row.personaId).toBe(18);
    expect(row.scoringQa).toBeNull();
  });

  it('carries the numeric scoring-QA counters', () => {
    const row = scorecardRow({ runId: 'r', turnFile: null, run: run({ analytics: [{ eventType: 'scoring_qa', payloadJsonb: { verifierDrops: 2, evidenceStrips: 0, artifactTypes: [] } }] }) });
    expect(row.scoringQa).toEqual({ verifierDrops: 2, evidenceStrips: 0 });
  });

  it('a run without a turns file yields a row with nulls', () => {
    const row = scorecardRow({ runId: 'old', run: run(), turnFile: null });
    expect(row.performance.firstRelevantMedianMs).toBeNull();
    expect(row.stuck).toBeNull();
    expect(row.completion).toBe('ended');
  });

  it('a turn file with no end line is a technical failure', () => {
    const row = scorecardRow({ runId: 'r', run: run({ session: { id: 's', status: 'active' } }), turnFile: { header: { type: 'header', batch: null, version: null, wave: null, runNumber: null, commit: 'c', dirty: false, models: {}, persona: null, sessionId: 's', startedAt: '' }, turns: [turn(0)], end: null } });
    expect(row.completion).toBe('technical_failure');
    expect(row.codeFlags.some(f => f.kind === 'technical_failure')).toBe(true);
  });

  it('counts opportunities and repeated asks from events', () => {
    const ev = (subtype: string, turnIndex: number, payload: Record<string, unknown>, category = 'data_request') => ({ category, subtype, turnIndex, payloadJsonb: payload });
    const row = scorecardRow({ runId: 'r', turnFile: null, run: run({
      events: [
        ev('defer', 1, { explicit: true, ledgerItemIds: ['cogs_pct'], revealedByNow: false }),
        ev('release', 3, { explicit: true, ledgerItemIds: ['cogs_pct'], revealedByNow: false }),
        ev('explicit_ask', 1, {}, 'request_signal'), ev('explicit_ask', 3, {}, 'request_signal'),
        ev('recompute', 5, { decision: 'act' }, 'check'), ev('rung_delivery', 6, { decision: 'act', reason: 'rung delivered' }, 'check'),
      ],
      analytics: [{ eventType: 'exhibit_shown', payloadJsonb: {} }, { eventType: 'llm_usage', payloadJsonb: { model: 'claude-haiku-4-5', component: 'distress', inputTokens: 1_000_000, outputTokens: 0 } }],
    }) });
    expect(row.opportunities).toMatchObject({ explicitAsks: 2, ledgerItemsRequested: 1, mathChecks: 1, exhibitsShown: 1, stallRungs: 1 });
    expect(row.opportunities.recAsks).toBe(row.stages.recommendationAskCount);
    expect(row.effort.repeatedAsks).toBe(1);
    expect(row.performance.appCostUsd).toBeCloseTo(1);
  });

  it('stages come from the end_gate event when present (transcript regex can miss phrasing)', () => {
    const gate = { category: 'check', subtype: 'end_gate', turnIndex: 5, payloadJsonb: { decision: 'pass', detail: { riskAsked: true, brainstormAsked: true, recommendationAsked: true, recommendationAskCount: 1, recommendationReceived: true } } };
    const r = run({ events: [gate], turns: [{ turnIndex: 0, role: 'interviewer', text: 'Hello.' }, { turnIndex: 1, role: 'candidate', text: 'c' }] });
    const row = scorecardRow({ runId: 'r', turnFile: null, run: r });
    expect(row.stagesSource).toBe('end_gate');
    expect(row.stages.recommendationAsked).toBe(true);
    expect(row.codeFlags.some(f => f.kind === 'stage_skipped')).toBe(false);
    expect(scorecardRow({ runId: 'r', turnFile: null, run: run() }).stagesSource).toBe('transcript');
  });

  it('counts llm_usage rows with unpriced models without adding cost', () => {
    const row = scorecardRow({ runId: 'r', turnFile: null, run: run({ analytics: [{ eventType: 'llm_usage', payloadJsonb: { model: 'mystery-model', inputTokens: 5, outputTokens: 5 } }] }) });
    expect(row.performance.unpricedUsageCalls).toBe(1);
    expect(row.performance.appCostUsd).toBe(0);
  });

  it('short generic questions do not count as a loop', () => {
    expect(maxSameQuestion(['What does that tell you?', 'What does that tell you?', 'What does that tell you?'])).toBeLessThanOrEqual(1);
  });

  const header = (over: Partial<TurnFileHeader> = {}): TurnFileHeader => ({ type: 'header', batch: 'batch-18', version: 'v1', wave: 'w', runNumber: 3, commit: 'c', dirty: false, models: {}, persona: { id: 18, name: 'Nikhil', brief: '' }, sessionId: 's', startedAt: '', ...over });
  const end = (scoring: string): TurnFileEnd => ({ type: 'end', ended: true, budgetStopped: false, scoring, candidateUsage: { calls: 1, input: 1, output: 1, usd: 0 } });

  it('version and rerun come from the joined manifest entry, the turn-file header as fallback', () => {
    const tf = { header: header({ version: 'v1', rerun: 0 }), turns: [turn(0)], end: end('scored') };
    expect(scorecardRow({ runId: 'r', run: run(), turnFile: tf, entry: { version: 'v2', rerun: 1 } })).toMatchObject({ version: 'v2', rerun: 1 });
    expect(scorecardRow({ runId: 'r', run: run(), turnFile: tf, entry: null })).toMatchObject({ version: 'v1', rerun: 0 });
    expect(scorecardRow({ runId: 'r', run: run(), turnFile: { ...tf, header: header() } })).toMatchObject({ version: 'v1', rerun: null }); // pre-rerun turn file
  });

  it('keeps one version and tells reruns apart', () => {
    const rows = [{ runId: 'a', version: 'v1', rerun: 0 }, { runId: 'b', version: 'v2', rerun: 0 }, { runId: 'c', version: 'v1', rerun: 1 }, { runId: 'd', version: null, rerun: null }] as ScorecardRow[];
    expect(rowsOfVersion(rows, 'v1').map(r => r.runId)).toEqual(['a', 'c']);
    expect(rowsOfVersion(rows, null)).toHaveLength(4);
    expect(rows.filter(isRerun).map(r => r.runId)).toEqual(['c']);
  });

  it('scoring is "scored" whenever the run has a score, else the end line\'s status, else null', () => {
    const tf = (e: TurnFileEnd | null) => ({ header: header(), turns: [turn(0)], end: e });
    expect(scorecardRow({ runId: 'r', run: run(), turnFile: tf(end('failed')) }).scoring).toBe('scored');
    expect(scorecardRow({ runId: 'r', run: run(), turnFile: null }).scoring).toBe('scored');
    expect(scorecardRow({ runId: 'r', run: run({ score: null }), turnFile: tf(end('failed')) }).scoring).toBe('failed');
    expect(scorecardRow({ runId: 'r', run: run({ score: null }), turnFile: null }).scoring).toBeNull();
  });
});
