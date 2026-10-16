// Wave reports (Lorenzo, 13 Oct): the minute each stage happened, per run, and
// a flag on any case where 2+ runs closed with a required stage still owed.
import { describe, it, expect } from 'vitest';
import { stageMinutes, flagCases } from '@/lib/eval/stage-minutes';
import type { CorpusRun, CorpusTurn } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';

let n = 0;
const T = (q: string, min: number, o: Partial<CorpusTurn> = {}): CorpusTurn => ({
  t: (n += 2), candidateText: 'ok', phase: 'ANALYSIS', kind: 'model', move: null, heard: q,
  segments: [{ kind: 'question', author: 'model', text: q }], revealedBefore: [], releasedNow: [], shownBefore: [], exhibitNow: null,
  seeded: false, elapsedMs: min * 60_000, ...o,
});
const run = (caseId: string, turns: CorpusTurn[], status = 'completed', id = 'r'): CorpusRun =>
  ({ id, dir: '', group: 'g', date: '', model: 'm', persona: 'p', format: 'turn_file', status, turns, candidateTurns: [], caseId } as unknown as CorpusRun);
const lark = getCaseById('prof-002') as never;
const CORE = ['route_results_lakeport', 'route_results_port_avery', 'lakeport_fare'];
const CLOSE = "We've covered everything I wanted to. Thanks for working through the case — your written report will follow.";

describe('stage minutes', () => {
  const full = [
    T("Is that MECE — what's missing?", 2, { phase: 'STRUCTURE', move: 'pressure_test' }),
    T('What does it tell you?', 4, { exhibitNow: 'exhibit-1', releasedNow: CORE.slice(0, 2) }),
    T('What does it tell you?', 7, { exhibitNow: 'exhibit-2', releasedNow: ['lakeport_fare'], shownBefore: ['exhibit-1'], revealedBefore: CORE.slice(0, 2) }),
    T('What does it tell you?', 10, { exhibitNow: 'exhibit-3', shownBefore: ['exhibit-1', 'exhibit-2'], revealedBefore: CORE }),
    T("What else could Larkspur do to make sure it's profitable in the first year?", 12, { shownBefore: ['exhibit-1', 'exhibit-2', 'exhibit-3'], revealedBefore: CORE }),
    T("What's your recommendation to the client?", 14, { shownBefore: ['exhibit-1', 'exhibit-2', 'exhibit-3'], revealedBefore: CORE }),
    T("What's the biggest risk to that recommendation?", 15, { shownBefore: ['exhibit-1', 'exhibit-2', 'exhibit-3'], revealedBefore: CORE }),
    T(CLOSE, 16.5, { kind: 'close', shownBefore: ['exhibit-1', 'exhibit-2', 'exhibit-3'], revealedBefore: CORE }),
  ];
  it('the minute each stage first happened; nothing owed at the close', () => {
    const m = stageMinutes(run('prof-002', full), lark);
    expect(m.minutes).toEqual({ probe: 2, 'exhibit-1': 4, 'exhibit-2': 7, analysis: 7, 'exhibit-3': 10, brainstorm: 12, recommendation: 14, risk: 15, close: 16.5 });
    expect(m.owedAtClose).toEqual([]);
  });
  it('a close with Exhibit 3, the brainstorm and the risk never reached owes them', () => {
    const m = stageMinutes(run('prof-002', [...full.slice(0, 3), full[5], T(CLOSE, 17, { kind: 'close' })]), lark);
    expect(m.owedAtClose).toEqual(['exhibit-3', 'brainstorm', 'risk']);
  });
  it('flags a case only when 2+ runs closed owing a required stage', () => {
    const owing = (id: string) => run('prof-002', [full[5], T(CLOSE, 17, { kind: 'close' })], 'completed', id);
    expect(flagCases([stageMinutes(owing('a'), lark), stageMinutes(run('prof-002', full), lark)])).toEqual([]);
    expect(flagCases([stageMinutes(owing('a'), lark), stageMinutes(owing('b'), lark)]).map(f => f.caseId)).toEqual(['prof-002']);
  });
});

// Lorenzo, 16 Oct (batch 28, Raj 2eb0fdd3 t18): a risk question without a
// question mark, and a risk move in risk words, are the risk — no "owing risk".
describe('the risk as the end gate reads it', () => {
  const p1 = getCaseById('prof-001') as never;
  const rec = T('Pulling it together for the CEO, what is your recommendation, and what would you do first?', 8.3);
  it("Raj's \"which of those two risks worries you more\" is the risk", () => {
    const m = stageMinutes(run('prof-001', [T('What does it tell you?', 3, { exhibitNow: 'exhibit-a' }), rec,
      T("Understood. Suppose the pilot comes back and traffic falls more than you expected. Walk me through what you'd do, and which of those two risks worries you more for the CEO.", 9.9),
      T(CLOSE, 12, { kind: 'close' })]), p1);
    expect(m.minutes.risk).toBe(9.9);
    expect(m.owedAtClose).not.toContain('risk');
  });
  it('a risk move in risk words counts, as in the stage record', () => {
    const m = stageMinutes(run('prof-001', [T('What does it tell you?', 3, { exhibitNow: 'exhibit-a' }), rec,
      T('Of the risks you see, which matters most to the CEO?', 9, { move: 'risk' }), T(CLOSE, 12, { kind: 'close' })]), p1);
    expect(m.minutes.risk).toBe(9);
  });
});

describe('a case without required exhibits (prof-001 with its exhibit optional)', () => {
  const base = getCaseById('prof-001');
  const brew = { ...base, exhibits: base.exhibits.map(e => ({ ...e, required: false })) } as never;
  it('prof-001 itself owes its required exhibit by id (15 Oct)', () => {
    const none = stageMinutes(run('prof-001', [T("What's your recommendation to the client?", 14), T(CLOSE, 15, { kind: 'close' })]), base as never);
    expect(none.owedAtClose).toContain('exhibit-a');
  });
  it('owes any one exhibit, not each', () => {
    const shown = stageMinutes(run('prof-001', [T('What does it tell you?', 5, { exhibitNow: 'exhibit-a' }), T("What's your recommendation to the client?", 14), T(CLOSE, 15, { kind: 'close' })]), brew);
    expect(shown.owedAtClose).not.toContain('exhibit');
    const none = stageMinutes(run('prof-001', [T("What's your recommendation to the client?", 14), T(CLOSE, 15, { kind: 'close' })]), brew);
    expect(none.owedAtClose).toContain('exhibit');
  });
});

describe('a case with no brainstorm module (Quillpath)', () => {
  it('owes no brainstorm at the close', () => {
    const quill = getCaseById('pricing-001') as never;
    const m = stageMinutes(run('pricing-001', [T("What's your recommendation to the client?", 14), T(CLOSE, 15, { kind: 'close' })]), quill);
    expect(m.owedAtClose).not.toContain('brainstorm');
    expect(m.owedAtClose).toContain('risk');
  });
});
