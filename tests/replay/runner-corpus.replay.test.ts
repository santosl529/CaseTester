// Runner-level replay of every saved run with a turn file (fact guards, 12 Oct).
// Each run is driven again through the real runTurn, one saved candidate
// message at a time, with the saved model output for that turn; the database,
// the interviewer model and the background classifiers are mocked (the
// distress and conduct screens pass, the pressure-test judge returns the
// saved verdict, the data-request classifier on a code-written turn returns
// that turn's saved requests). The clock is set to the saved elapsed time
// before each turn. What would now be delivered is recorded by the real
// TurnRecorder and written as a mirror corpus — a run JSON and a turn file
// per run — that scripts/fact-check.ts scores like the originals:
//
//   REPLAY_RUNNER=1 REPLAY_OUT=<dir> [REPLAY_FILTER=batch-20] npx vitest run tests/replay/runner-corpus.replay.test.ts
//   npx tsx scripts/fact-check.ts --root=<dir>
//
// Per turn, not per interview: the candidate's next message is the saved one
// whatever the interviewer now says. A turn whose kind changed (code now
// writes it, or now calls the model where code wrote it) is counted as
// diverged; one with no saved model output gets a neutral model turn. Free.
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

type Row = Record<string, unknown>;
const store = { session: {} as Row, turns: [] as Row[], revealed: [] as Row[], exhibits: [] as Row[], events: [] as Row[] };
vi.mock('@/lib/orchestrator/conduct-model', async orig => ({ ...(await orig<object>()), classifyConductModel: async () => null }));
vi.mock('@/db/client', async () => {
  const { getTableName } = await import('drizzle-orm');
  const target = (t: unknown) => ({ session_turns: store.turns, revealed_data: store.revealed, exhibits_shown: store.exhibits, session_events: store.events } as Record<string, Row[]>)[getTableName(t as never)];
  return {
    db: {
      query: {
        sessions: { findFirst: async () => ({ ...store.session }) },
        sessionTurns: { findMany: async () => [...store.turns].sort((a, b) => (a.turnIndex as number) - (b.turnIndex as number)) },
        exhibitsShown: { findMany: async () => [...store.exhibits] },
        revealedData: { findMany: async () => [...store.revealed] },
        sessionEvents: { findMany: async () => store.events.filter(e => e.category === 'data_request') },
      },
      insert: (t: unknown) => ({ values: async (v: Row | Row[]) => { target(t)?.push(...(Array.isArray(v) ? v : [v])); } }),
      update: () => ({ set: (v: Row) => ({ where: async () => { if (store.session.status === 'active') store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => ({ label: 'none', reason: '' }) }));
let detections: unknown[] = [];
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async () => detections }));
vi.mock('@/lib/orchestrator/hint-check', async orig => ({ ...(await orig<object>()), checkHintDelivered: async () => null }));
let modelTurn: ModelTurn | null = null;
let modelCalled = false;
const NEUTRAL: ModelTurn = { move: 'other', requests: [], exhibit: null, rescueItem: null, say: '', question: 'Go on.' };
vi.mock('@/lib/agent/models/factory', async () => {
  const { eventsFromTurn } = await import('@/lib/agent/models/turn-events');
  return {
    createInterviewerModel: () => ({
      runTurn: async () => modelTurn ?? NEUTRAL,
      streamTurn: () => { modelCalled = true; return eventsFromTurn(Promise.resolve(modelTurn ?? NEUTRAL)); },
    }),
  };
});
let judge: { answered: boolean; reason: string } | null = null;
let structureGiven = true;
vi.mock('@/lib/orchestrator/pressure-test', async orig => ({
  ...(await orig<object>()),
  judgeProbeAnswer: async () => judge,
  judgeStructureGiven: async () => ({ given: structureGiven, reason: 'replay' }),
}));

const { runTurn } = await import('@/lib/orchestrator/session-runner');
const { readTurnFile, writeTurnFile } = await import('@/lib/eval/turn-file');
const { runFiles } = await import('@/lib/eval/run-corpus');

const ROOT = 'Case Interview Runs';
const OUT = process.env.REPLAY_OUT ?? '';
const FILTER = process.env.REPLAY_FILTER ?? '';
const enabled = process.env.REPLAY_RUNNER === '1' && !!OUT && existsSync(ROOT);

type RunJson = { session: { caseId: string; startedAt: string; coverageJsonb?: unknown }; turns: { turnIndex: number; role: string; text: string; timestampMs: number }[] };

const FULL_COVERAGE = { structure: 100, quantitative: 100, dataExhibit: 100, judgment: 100, creativity: 100, synthesis: 100, communication: 100, pushback: 100 };

async function replayRun(file: string): Promise<{ turns: number; diverged: number; endedEarly: boolean; skipped?: string }> {
  const stem = file.replace(/\.json$/, '');
  const tf = `${stem}.turns.jsonl.gz`;
  if (!existsSync(tf)) return { turns: 0, diverged: 0, endedEarly: false, skipped: 'no turn file' };
  const run = JSON.parse(readFileSync(file, 'utf8')) as RunJson;
  const { header, turns: saved } = readTurnFile(tf);
  if (saved.length === 0) return { turns: 0, diverged: 0, endedEarly: false, skipped: 'no turns' };
  const firstIndex = saved[0].turnIndex;
  // Prefix-seeded runs start mid-conversation with state this replay can't rebuild.
  if (/seeded from/.test(existsSync(`${stem}.log`) ? readFileSync(`${stem}.log`, 'utf8').slice(0, 4000) : '')) return { turns: 0, diverged: 0, endedEarly: false, skipped: 'prefix-seeded' };
  const opening = run.turns.find(t => t.turnIndex === 0)!;
  const startedAt = new Date(run.session.startedAt);
  const sid = header.sessionId;
  store.session = {
    id: sid, userId: 'u1', caseId: run.session.caseId, phase: 'INTRO', elapsedMs: 0, phaseStartedAt: startedAt, status: 'active',
    abandonPhase: null, startedAt, completedAt: null, coverageJsonb: run.session.coverageJsonb ?? null, flagsJsonb: { conduct: { warnings: 0 } },
  };
  // The opening, and anything said before the first recorded turn (a silence check-in).
  store.turns = run.turns.filter(t => t.turnIndex < firstIndex).map(t => ({ id: `t${t.turnIndex}`, sessionId: sid, turnIndex: t.turnIndex, role: t.role, text: t.text, timestampMs: Date.now(), latencyMs: null }));
  void opening;
  store.revealed = []; store.exhibits = []; store.events = [];
  const records: TurnRecord[] = [];
  let diverged = 0;
  for (const [k, r] of saved.entries()) {
    if (store.session.status !== 'active') return finish(records, header, run, file, diverged, true);
    const savedModel = r.stateBefore.kind === 'model' || r.stateBefore.kind === 'rec_ask';
    modelTurn = savedModel ? r.parsedTurn : null;
    modelCalled = false;
    detections = !savedModel && r.parsedTurn ? r.parsedTurn.requests.map(q => ({ what: q.what, ledgerItemIds: q.itemIds, explicit: true })) : [];
    const pt = r.checks.find(c => c.check === 'pressure_test')?.detail as { verdict?: { answered: boolean; reason: string } | null } | undefined;
    const next = saved[k + 1]?.stateBefore.pressureTest as { state?: string; structureGiven?: boolean } | undefined;
    // The structure check's verdict: what the saved state held after this turn.
    structureGiven = next?.structureGiven ?? (r.stateBefore.pressureTest as { structureGiven?: boolean } | undefined)?.structureGiven ?? true;
    judge = pt?.verdict ?? { answered: next?.state === 'satisfied' || next?.state === 'waived', reason: 'replay' };
    // The clock as it stood when this message arrived, and the coverage the
    // end gate saw (complete or not — the agent's scores aren't saved per turn).
    const gate = r.checks.find(c => c.check === 'end_gate')?.detail as { coverageMayEnd?: boolean } | undefined;
    store.session = {
      ...store.session, startedAt: new Date(Date.now() - (r.stateBefore.elapsedMs ?? 0)),
      coverageJsonb: gate?.coverageMayEnd ? FULL_COVERAGE : null,
    };
    let rec: TurnRecord | null = null;
    await runTurn(sid, r.candidateText, { onTurnRecord: x => { rec = x; } });
    if (!rec) continue;
    const got = rec as TurnRecord;
    if (got.stateBefore.kind !== r.stateBefore.kind || (modelCalled && !savedModel)) diverged++;
    records.push({ ...got, turnIndex: r.turnIndex });
  }
  return finish(records, header, run, file, diverged, false);
}

function finish(records: TurnRecord[], header: ReturnType<typeof readTurnFile>['header'], run: RunJson, file: string, diverged: number, endedEarly: boolean) {
  const rel = path.relative(ROOT, file);
  const out = path.join(OUT, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  // The mirror run record: the saved candidate messages and what would now be said.
  const turns = [run.turns.find(t => t.turnIndex === 0)!, ...records.flatMap(r => [
    { turnIndex: r.turnIndex, role: 'candidate', text: r.candidateText, timestampMs: 0 },
    { turnIndex: r.turnIndex + 1, role: 'interviewer', text: r.savedLine, timestampMs: 0 },
  ])];
  writeFileSync(out, JSON.stringify({
    session: { ...run.session, status: endedEarly ? 'completed' : 'completed' }, turns, revealed: [], events: [],
    analytics: [{ eventType: 'llm_usage', createdAt: run.session.startedAt, payloadJsonb: { component: 'interviewer', model: header.models?.interviewer ?? 'unknown' } }],
  }));
  writeTurnFile(out.replace(/\.json$/, '.turns.jsonl.gz'), header, records, { type: 'end', ended: true, budgetStopped: false, scoring: 'replay', candidateUsage: { calls: 0, input: 0, output: 0, usd: 0 } });
  return { turns: records.length, diverged, endedEarly };
}

describe.skipIf(!enabled)('runner-level replay of the saved corpus', () => {
  it('replays every run with a turn file', async () => {
    const files = runFiles(ROOT).filter(f => existsSync(f.replace(/\.json$/, '.turns.jsonl.gz')) && f.includes(FILTER));
    const tally = { runs: 0, turns: 0, diverged: 0, endedEarly: 0, skipped: [] as string[] };
    const log = console.log; const warn = console.warn;
    for (const f of files) {
      console.log = () => {}; console.warn = () => {};
      let r;
      try { r = await replayRun(f); } finally { console.log = log; console.warn = warn; }
      if (r.skipped) { tally.skipped.push(`${path.relative(ROOT, f)}: ${r.skipped}`); continue; }
      tally.runs++; tally.turns += r.turns; tally.diverged += r.diverged; if (r.endedEarly) tally.endedEarly++;
    }
    writeFileSync(path.join(OUT, 'replay-summary.json'), JSON.stringify(tally, null, 1));
    log(JSON.stringify(tally));
    expect(tally.runs).toBeGreaterThan(0);
  }, 900_000);
});
