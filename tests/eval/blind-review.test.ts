import { describe, it, expect } from 'vitest';
import { buildBlindReview, type BlindRun } from '@/lib/eval/blind-review';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

// Batch 20 (12 Oct): the head to head is graded blind — no sheet may name or
// betray the interviewer model; the key is written apart.
const turn = (i: number, cand: string, delivered: TurnRecord['delivered'], acts: string[] = []): TurnRecord => ({
  type: 'turn', sessionId: 's', turnIndex: i, candidateText: cand,
  stateBefore: { phase: 'ANALYSIS', elapsedMs: 300000, kind: 'model' } as TurnRecord['stateBefore'],
  requests: [{ attempt: 'first', model: 'claude-haiku-5-5', body: {}, atMs: 1 }], outputs: [{ attempt: 'first', text: '{"say":"x"}', atMs: 2 }],
  parsedTurn: null, validation: null,
  checks: [...acts.map(c => ({ check: c, decision: 'act' as const, reason: `${c} acted` })), { check: 'style', decision: 'pass' as const }],
  delivered, savedLine: delivered.map(d => d.text).join(' '), phaseAfter: 'ANALYSIS', ended: false,
  timing: { model_first_token: 1140, first_useful_delivered: 1660 }, usage: [{ model: 'claude-haiku-5-5' } as never], recorderErrors: [],
});

const runs: BlindRun[] = [
  { arm: 'haiku55-thinking-off', persona: 'Tyler — the Misquoter', source: 'batch-20-haiku/batch-20-haiku-oct-12-runs-1-7/15-tyler-the-misquoter', opening: 'Your client is Brew & Bean…', turns: [
    turn(1, 'COGS goes from 42% to 61%.', [{ kind: 'say', text: 'Mm-hm.', revealIds: [], atMs: 1 }, { kind: 'data', text: 'To correct one figure: COGS is 58% of revenue today.', revealIds: [], atMs: 2 }, { kind: 'tail', text: 'What sits inside COGS?', revealIds: [], atMs: 3 }], ['misquote']),
  ] },
  { arm: 'sonnet55-baseline', persona: 'Tyler — the Misquoter', source: 'batch-20-sonnet/batch-20-sonnet-oct-12-runs-1-7/15-tyler-the-misquoter', opening: 'Your client is Brew & Bean…', turns: [
    turn(1, 'COGS goes from 42% to 61%.', [{ kind: 'tail', text: 'Walk me through that.', revealIds: [], atMs: 3 }]),
  ] },
];

describe('buildBlindReview', () => {
  it('one sheet per run under a shuffled code; the key maps codes back; same seed, same codes', () => {
    const a = buildBlindReview(runs, 'seed-1');
    expect(a.sheets.map(s => s.code).sort()).toEqual(['R01', 'R02']);
    expect(Object.keys(a.key).sort()).toEqual(['R01', 'R02']);
    expect(new Set(Object.values(a.key).map(k => k.arm))).toEqual(new Set(['haiku55-thinking-off', 'sonnet55-baseline']));
    expect(buildBlindReview(runs, 'seed-1').key).toEqual(a.key);
  });

  it('a sheet shows the persona, the candidate, what was heard by segment and what code did — nothing that betrays the model', () => {
    const { sheets, key } = buildBlindReview(runs, 'seed-1');
    const code = Object.entries(key).find(([, k]) => k.arm === 'haiku55-thinking-off')![0];
    const md = sheets.find(s => s.code === code)!.markdown;
    expect(md).toMatch(/Tyler — the Misquoter/);
    expect(md).toMatch(/COGS goes from 42% to 61%\./);
    expect(md).toMatch(/\[data\] To correct one figure/);
    expect(md).toMatch(/code: misquote/);
    for (const s of sheets) {
      expect(s.markdown).not.toMatch(/claude|haiku|sonnet|opus|anthropic|batch-20|1140|1660|first_token|latency/i);
    }
  });

  it('refuses a sheet that would still name a model (e.g. in a heard line)', () => {
    const leaky: BlindRun[] = [{ ...runs[1], turns: [turn(1, 'Is this Claude Sonnet?', [{ kind: 'tail', text: 'Go on.', revealIds: [], atMs: 1 }])] }];
    expect(() => buildBlindReview(leaky, 's')).toThrow(/names a model/);
  });

  it('a grading sheet row per run, with its interviewer-turn count', () => {
    const { gradingCsv } = buildBlindReview(runs, 'seed-1');
    const [header, ...rows] = gradingCsv.trim().split('\n');
    expect(header).toMatch(/^code,persona,interviewer_turns,D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,/);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => /,1,/.test(r))).toBe(true);
  });
});
