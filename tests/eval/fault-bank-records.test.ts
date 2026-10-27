// The committed fault bank (evals/fault-bank/*.jsonl, contract §4.1) and its build (lib/eval/fault-bank-build.ts).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { FaultRecordSchema, type FaultRecord } from '@/lib/eval/fault-bank';
import { SpecSchema, specToRecord, sliceOf, sliceOfWave, sliceRoot, isReportRecord, itemLinesOf } from '@/lib/eval/fault-bank-build';
import { evaluateRecord } from '@/lib/eval/fault-bank-assert';
import { readTurnFile } from '@/lib/eval/turn-file';
import { getCaseById } from '@/lib/cases/loader';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

const BANK = 'evals/fault-bank';
const recs: FaultRecord[] = readdirSync(BANK).filter(f => f.endsWith('.jsonl')).flatMap(f =>
  readFileSync(path.join(BANK, f), 'utf8').split('\n').filter(Boolean).map(l => FaultRecordSchema.parse(JSON.parse(l))));

describe('the fault bank', () => {
  it('has unique ids, every batch 33–38, about 100 correct records across all five cases', () => {
    expect(new Set(recs.map(r => r.id)).size).toBe(recs.length);
    for (const b of ['batch-33', 'batch-34-aldermoor', 'batch-34-larkspur', 'batch-35-hollisbay', 'batch-35-quillpath', 'batch-36-aldermoor', 'batch-36-larkspur', 'batch-37-hollisbay', 'batch-37-quillpath', 'batch-38-larkspur'])
      expect(recs.some(r => r.batch === b && r.kind === 'fault'), b).toBe(true);
    const correct = recs.filter(r => r.kind === 'correct');
    expect(correct.length).toBeGreaterThanOrEqual(90);
    expect(new Set(correct.map(r => r.caseId))).toEqual(new Set(['prof-001', 'prof-002', 'entry-001', 'launch-001', 'pricing-001']));
  });

  it('a record the replay can\'t prove says what in the wave would show it fixed, and which grade sees it (Q2)', () => {
    for (const r of recs.filter(x => !x.replayable)) {
      expect(r.replayNote, r.id).toMatch(/Wave:/);
      expect(r.replayNote, r.id).toMatch(/auditor|hand grade/);
    }
  });

  // Lorenzo's pre-wave ruling 2 (26 Oct): the replay writes a neutral "Go on." where the turn's kind changed and it
  // has no saved model output, so no record on one of those turns can be judged from the replay. Three such turns
  // carry records: b33 Tyler t18, b34a Tyler t30 and b37q Marcus t32 (b32 Marcus t32 carries none).
  it('every record on a bare "Go on." replay turn is non-replayable, with a wave note (ruling 2)', () => {
    const artifacts = ['b33-tyler-t18-stale-reprobe', 'b33-tyler-t18-want-dropped', 'b34a-tyler-t30-close', 'b37q-marcus-t32-rec-reask'];
    for (const id of artifacts) {
      const r = recs.find(x => x.id === id);
      expect(r, id).toBeDefined();
      expect(r!.replayable, id).toBe(false);
      expect(r!.replayNote, id).toMatch(/Go on\./);
    }
  });

  it('wave-judged.md lists every record that is not replayable', () => {
    const md = readFileSync(path.join(BANK, 'wave-judged.md'), 'utf8');
    for (const r of recs.filter(x => !x.replayable)) expect(md, r.id).toContain(`| ${r.id} |`);
  });

  it('a spec builds into a record with the recorded state, message and line', () => {
    const turn = { turnIndex: 23, candidateText: 'Do we have price elasticity on the four protected routes?',
      stateBefore: { phase: 'BRAINSTORM', elapsedMs: 1116000, kind: 'model', revealedIds: ['route_results_other'], shownExhibitIds: ['exhibit-1'], openDataRequests: [] },
      delivered: [{ kind: 'say', text: 'A stacked set of levers.', revealIds: [], atMs: 0 }, { kind: 'data', text: 'Repeating what I said before: …', revealIds: [], atMs: 0 }] } as unknown as TurnRecord;
    const spec = SpecSchema.parse({ id: 'b38l-tyler-t24-elasticity', kind: 'fault', p: '64', turn: 24, sev: 'firm', cls: 'hollow_deferral', note: 'n', a: [{ kind: 'refusal', must: true }], rep: true, stream: 4 });
    const rec = specToRecord(spec, sliceOf('b38l'), { turnFile: 'test runs/w/64-tyler/x.turns.jsonl.gz', header: { sessionId: 'cee7d399-aaaa', persona: { id: 64, name: 'Tyler', brief: '' } } as never, turns: [turn] });
    expect(rec).toMatchObject({ run: 'cee7d399', persona: 64, caseId: 'prof-002', batch: 'batch-38-larkspur', said: 'A stacked set of levers. Repeating what I said before: …', candidateText: turn.candidateText });
    expect(rec.state).toEqual({ phase: 'BRAINSTORM', elapsedMs: 1116000, revealedIds: ['route_results_other'], shownExhibitIds: ['exhibit-1'], openDataRequests: [] });
    expect(() => SpecSchema.parse({ ...spec, rep: false })).toThrow(/replayNote/);
    expect(() => SpecSchema.parse({ ...spec, kind: 'correct' })).toThrow(/severity/);
  });
});

// Against the recordings themselves (the main checkout's corpus; skipped where it isn't): a fault record's
// assertions describe the right behaviour, so they fail on the recorded fault; a correct record's pass.
const ROOT = process.env.REPLAY_ROOT ?? '/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs';
// Batch 39's runs live in the phase1 worktree's corpus (the slice's `root`).
const rootOf = (wave: string) => { const s = sliceOfWave(wave); return s ? sliceRoot(s, ROOT) : ROOT; };
describe.skipIf(!existsSync(ROOT))('the fault bank on its recordings', () => {
  it('every fault record fails and every correct record passes on the recorded turn file', () => {
    const views = new Map<string, Parameters<typeof evaluateRecord>[2]>();
    const view = (caseId: string) => {
      if (!views.has(caseId)) { const c = getCaseById(caseId); views.set(caseId, { lines: itemLinesOf(c), exhibits: Object.fromEntries(c.exhibits.map(e => [e.id, e.coversLedgerItems ?? []])) }); }
      return views.get(caseId)!;
    };
    const wrong = recs.filter(r => !isReportRecord(r)).filter(r =>
      evaluateRecord(r, readTurnFile(path.join(rootOf(r.wave), r.turnFile)).turns, view(r.caseId)).pass !== (r.kind === 'correct')).map(r => r.id);
    expect(wrong).toEqual([]);
  });
});
