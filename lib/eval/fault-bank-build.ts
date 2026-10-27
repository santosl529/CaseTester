// Building fault-bank records (Phase 1 contract §4.1) from the hand-authored specs in evals/fault-bank/specs/<tag>.json:
// a spec names the run (by persona folder), the grading turn tN, the grade and the assertions; the build copies the
// recorded state, the candidate's message and the delivered line from the run's turn file. Pure, except the corpus
// helpers at the bottom (which read files).
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AssertionSchema, FaultRecordSchema, type FaultRecord } from './fault-bank';
import type { TurnFileHeader } from './turn-file';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import type { ItemLines } from './fault-bank-assert';

// One slice per wave of batches 33–39 (the proof slices, contract §0). `verdicts`: the recorded checker verdicts
// the replay serves (REPLAY_CHECKER), as round 6's proof.sh builds them: CK31 plus the slice's own file.
export const SLICES = [
  { tag: 'b33', batch: 'batch-33', wave: 'batch-33-oct-19-runs-1-10', caseId: 'prof-001', verdicts: 'replays/2026-10-20/engine-asks/b33-verdicts.jsonl' },
  { tag: 'b34a', batch: 'batch-34-aldermoor', wave: 'batch-34-aldermoor-oct-20-runs-1-5', caseId: 'entry-001', verdicts: 'replays/2026-10-20/engine-asks/b34a-verdicts.jsonl' },
  { tag: 'b34l', batch: 'batch-34-larkspur', wave: 'batch-34-larkspur-oct-20-runs-1-5', caseId: 'prof-002', verdicts: 'replays/2026-10-20/engine-asks/b34l-verdicts.jsonl' },
  { tag: 'b35h', batch: 'batch-35-hollisbay', wave: 'batch-35-hollisbay-oct-20-runs-1-5', caseId: 'launch-001', verdicts: 'replays/2026-10-20/engine-asks/b35h-verdicts.jsonl' },
  { tag: 'b35q', batch: 'batch-35-quillpath', wave: 'batch-35-quillpath-oct-20-runs-1-5', caseId: 'pricing-001', verdicts: 'replays/2026-10-20/engine-asks/b35q-verdicts.jsonl' },
  { tag: 'b36a', batch: 'batch-36-aldermoor', wave: 'batch-36-aldermoor-oct-20-runs-1-5', caseId: 'entry-001', verdicts: 'replays/2026-10-21/round6/b36a-verdicts.jsonl' },
  { tag: 'b36l', batch: 'batch-36-larkspur', wave: 'batch-36-larkspur-oct-20-runs-1-5', caseId: 'prof-002', verdicts: 'replays/2026-10-21/round6/b36l-verdicts.jsonl' },
  { tag: 'b37h', batch: 'batch-37-hollisbay', wave: 'batch-37-hollisbay-oct-20-runs-1-5', caseId: 'launch-001', verdicts: 'replays/2026-10-21/round6/b37h-verdicts.jsonl' },
  { tag: 'b37q', batch: 'batch-37-quillpath', wave: 'batch-37-quillpath-oct-20-runs-1-5', caseId: 'pricing-001', verdicts: 'replays/2026-10-21/round6/b37q-verdicts.jsonl' },
  // No b38 verdict file exists in the corpus: the harness converts the run's own recorded verdicts (as convert-verdicts.py does).
  { tag: 'b38l', batch: 'batch-38-larkspur', wave: 'batch-38-larkspur-oct-21-runs-1-5', caseId: 'prof-002', verdicts: null },
  // Batch 39 (the Phase 1 wave, 26 Oct; Lorenzo approved this grading-harness edit, 27 Oct): its runs live in the phase1
  // worktree's corpus (`root: 'phase1'`, read only — memory: waves from a worktree write their runs inside it), and its
  // verdicts are the runs' own recorded ones, converted as for b38.
  { tag: 'b39p', batch: 'batch-39-brewbean', wave: 'batch-39-brewbean-oct-26-runs-1-5', caseId: 'prof-001', verdicts: null, root: 'phase1' },
  { tag: 'b39a', batch: 'batch-39-aldermoor', wave: 'batch-39-aldermoor-oct-26-runs-1-5', caseId: 'entry-001', verdicts: null, root: 'phase1' },
  { tag: 'b39h', batch: 'batch-39-hollisbay', wave: 'batch-39-hollisbay-oct-26-runs-1-5', caseId: 'launch-001', verdicts: null, root: 'phase1' },
  { tag: 'b39l', batch: 'batch-39-larkspur', wave: 'batch-39-larkspur-oct-26-runs-1-8', caseId: 'prof-002', verdicts: null, root: 'phase1' },
  { tag: 'b39q', batch: 'batch-39-quillpath', wave: 'batch-39-quillpath-oct-26-runs-1-8', caseId: 'pricing-001', verdicts: null, root: 'phase1' },
] as const;
// A slice's corpus root: its own (`phase1`: REPLAY_ROOT_PHASE1, default the phase1 worktree's corpus), else REPLAY_ROOT.
export const PHASE1_RUNS = process.env.REPLAY_ROOT_PHASE1 ?? '/Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase1/Case Interview Runs';
export const sliceRoot = (s: Slice, mainRoot: string): string => ('root' in s && s.root === 'phase1' ? PHASE1_RUNS : mainRoot);
export const sliceOfWave = (wave: string): Slice | undefined => SLICES.find(x => x.wave === wave);
export type Slice = typeof SLICES[number];
export const sliceOf = (tag: string): Slice => {
  const s = SLICES.find(x => x.tag === tag);
  if (!s) throw new Error(`unknown slice ${tag}`);
  return s;
};

export const SpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['fault', 'correct']),
  p: z.string().regex(/^\d\d$/),          // the persona folder's number ("07", "64")
  turn: z.number().int().positive(),
  sev: FaultRecordSchema.shape.grade.shape.severity,
  cls: FaultRecordSchema.shape.grade.shape.class,
  note: z.string().min(1),
  src: z.string().optional(),
  a: z.array(AssertionSchema).min(1),
  rep: z.boolean(),
  rnote: z.string().optional(),
  stream: FaultRecordSchema.shape.stream,
}).strict()
  .refine(s => (s.kind === 'correct') === (s.sev === 'correct'), { message: 'a correct record has severity "correct", a fault never' })
  .refine(s => s.rep || (s.rnote ?? '').length > 20, { message: 'a record that is not replayable says what in the wave would show it fixed (replayNote)' });
export type Spec = z.infer<typeof SpecSchema>;

export type RunTurns = { turnFile: string; header: TurnFileHeader; turns: TurnRecord[] };

export function specToRecord(spec: Spec, slice: Slice, run: RunTurns): FaultRecord {
  const t = run.turns.find(x => x.turnIndex === spec.turn - 1);
  if (!t) throw new Error(`${spec.id}: no turn t${spec.turn} (turnIndex ${spec.turn - 1}) in ${run.turnFile}`);
  if (run.header.persona && String(run.header.persona.id).padStart(2, '0') !== spec.p && !run.turnFile.includes(`/${spec.p}-`)) {
    throw new Error(`${spec.id}: persona ${spec.p} is not the run's (${run.header.persona.id})`);
  }
  const sb = t.stateBefore;
  return FaultRecordSchema.parse({
    id: spec.id, kind: spec.kind, batch: slice.batch, wave: slice.wave, run: run.header.sessionId.slice(0, 8),
    turnFile: run.turnFile, caseId: slice.caseId, persona: run.header.persona?.id ?? Number(spec.p), turn: spec.turn,
    grade: { severity: spec.sev, class: spec.cls, source: spec.src ?? `${slice.batch}/hand-grading.md`, note: spec.note },
    state: {
      phase: sb.phase, elapsedMs: sb.elapsedMs, revealedIds: [...sb.revealedIds], shownExhibitIds: [...sb.shownExhibitIds],
      openDataRequests: sb.openDataRequests.map(d => ({ ledgerItemId: d.ledgerItemId, what: d.what })),
    },
    candidateText: t.candidateText,
    said: t.delivered.map(s => s.text).join(' '),
    assertions: spec.a,
    replayable: spec.rep,
    ...(spec.rnote ? { replayNote: spec.rnote } : {}),
    stream: spec.stream,
  });
}

// The ways a case's ledger lines are said: the value, plus prof-001's data-line versions.
export function itemLinesOf(c: { dataLedger: { id: string; value: string }[] }, versions: Record<string, readonly string[]> = {}): ItemLines {
  return Object.fromEntries(c.dataLedger.map(i => [i.id, [i.value, ...(versions[i.id] ?? [])]]));
}

// Report faults (scoring) are not interviewer turns: the recorded-turn check and the replay skip them.
export const isReportRecord = (r: Pick<FaultRecord, 'grade'>) => r.grade.class === 'report_false';

// ── corpus helpers (files) ──
// The run's turn file under the corpus root: test runs/<wave>/<NN-persona>/live-run-*.turns.jsonl.gz.
export function findTurnFile(root: string, slice: Slice, persona: string): string {
  const waveDir = path.join(root, 'test runs', slice.wave);
  if (!existsSync(waveDir)) throw new Error(`no wave folder ${waveDir}`);
  const dir = readdirSync(waveDir).find(d => d.startsWith(`${persona}-`));
  if (!dir) throw new Error(`no persona ${persona} in ${slice.wave}`);
  const f = readdirSync(path.join(waveDir, dir)).find(x => x.endsWith('.turns.jsonl.gz'));
  if (!f) throw new Error(`no turn file in ${slice.wave}/${dir}`);
  return path.join('test runs', slice.wave, dir, f);
}
