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
//   REPLAY_RUNNER=1 REPLAY_OUT=<dir> [REPLAY_FILTER=batch-20] [REPLAY_ROOT=<runs dir>] npx vitest run tests/replay/runner-corpus.replay.test.ts
//   npx tsx scripts/fact-check.ts --root=<dir>
//
// Per turn, not per interview: the candidate's next message is the saved one
// whatever the interviewer now says. A turn whose kind changed (code now
// writes it, or now calls the model where code wrote it) is counted as
// diverged; one with no saved model output gets a neutral model turn. Free.
//
// The math checker (step 3, 13 Oct): REPLAY_CHECKER=<a.jsonl>[,<b.jsonl>] —
// recorded verdicts from scripts/eval-math-checker.ts (a later file wins);
// a message without one gets no verdict. Each check is settled only after the
// turn that started it has returned (a turn that waited would hang), and its
// row becomes visible at the message's saved elapsed time plus the recorded
// latency — so a verdict lands on the next turn only when the candidate took
// longer than the check. Every checker event and turn is written to
// <REPLAY_OUT>/checker-replay.jsonl. Without REPLAY_CHECKER the checker is off.
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelTurn } from '@/lib/agent/models/turn-schema';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import { recordedChecks, recordedCheckVerdict, type RecordedCheck } from '@/lib/eval/recorded-checks';

type Row = Record<string, unknown>;
// The replay's clock for the checker: rows land when it reaches them.
const checkerClock = { nowMs: 0 };
type PendingCheck = { key: string; resolve: (r: unknown) => void; reject: (e: Error) => void };
const pendingChecks: PendingCheck[] = [];
let currentKey = '';
vi.mock('@/lib/orchestrator/math-checker', async orig => ({
  ...(await orig<object>()),
  checkMathClaims: () => new Promise((resolve, reject) => { pendingChecks.push({ key: currentKey, resolve, reject }); }),
}));
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
        sessionEvents: { findMany: async () => store.events.filter(e => e.category === 'data_request'
          || (e.category === 'math_checker' && ((e.landsAtMs as number | undefined) ?? -1) <= checkerClock.nowMs)) },
      },
      insert: (t: unknown) => ({ values: async (v: Row | Row[]) => { target(t)?.push(...(Array.isArray(v) ? v : [v])); } }),
      update: () => ({ set: (v: Row) => ({ where: async () => { if (store.session.status === 'active') store.session = { ...store.session, ...v }; } }) }),
    },
  };
});
vi.mock('@/lib/analytics', async orig => ({ ...(await orig<object>()), logEvent: async () => {} }));
vi.mock('@/lib/orchestrator/distress', async orig => ({ ...(await orig<object>()), classifyDistress: async () => ({ label: 'none', reason: '' }) }));
let detections: unknown[] = [];
// The item-less ask check (turn-data.ts checkAsk, engine-asks R1) calls the
// classifier with the ask's own words ("Could I get <ask>?"), not the message: it
// gets the verdict the replayed run recorded for that ask (`itemless_defer`; the
// same turn first, else the run's nearest turn — lib/eval/recorded-checks.ts,
// round 5 Task 45), else none (null: a named deferral), as before.
vi.mock('@/lib/orchestrator/data-requests', async orig => ({ ...(await orig<object>()), classifyDataRequests: async (p: { interviewerText: string | null; candidateText: string }) => {
  if (!(p.interviewerText === null && p.candidateText !== turnText)) return detections;
  const ask = /^Could I get ([\s\S]*)\?$/.exec(p.candidateText)?.[1];
  return ask === undefined ? null : recordedCheckVerdict(runChecks, savedTurnIndex, ask);
} }));
let turnText = '';
let runChecks: RecordedCheck[] = [];
let savedTurnIndex = -1;
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

// REPLAY_ROOT: the saved runs live untracked in the main checkout, not in a worktree.
const ROOT = process.env.REPLAY_ROOT ?? 'Case Interview Runs';
const OUT = process.env.REPLAY_OUT ?? '';
type RecordedVerdict = { id: string; latencyMs: number; model: string; error?: string; claims: Row[] };
const RECORDED = new Map<string, RecordedVerdict>((process.env.REPLAY_CHECKER ?? '').split(',').filter(Boolean)
  .flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as RecordedVerdict))
  .filter(r => !r.error).map(r => [r.id, r]));
if (!process.env.REPLAY_CHECKER) process.env.MATH_CHECKER_CONFIG = 'off';
// Recorded before a field existed: its neutral value; the vetting reruns live.
const rawClaim = (c: Row) => ({ pointer: '', actualShare: null, codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, ...c });
const checkerTally = { started: 0, pendingAtReturn: 0, recorded: 0, noVerdict: 0, landedNext: 0, landedLater: 0, neverLanded: 0 };
let checkerOut: Row[] = [];
// Per run: replay turn index of a candidate message → its saved index and clock
// (they drift where the saved run had silence check-ins the replay doesn't).
const replayIndex = new Map<number, { saved: number; ms: number }>();
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
  replayIndex.clear();
  runChecks = recordedChecks(saved);
  const records: TurnRecord[] = [];
  let diverged = 0;
  for (const [k, r] of saved.entries()) {
    if (store.session.status !== 'active') { checkerReport(file, records, saved); return finish(records, header, run, file, diverged, true); }
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
    checkerClock.nowMs = r.stateBefore.elapsedMs ?? 0;
    // Label ids count turns as the corpus does: the turn file's index + 1.
    currentKey = `${path.relative(ROOT, file).replace(/\.json$/, '')}#t${r.turnIndex + 1}`;
    const deferred: (() => Promise<void>)[] = [];
    const startedBefore = pendingChecks.length;
    // The replay's own turn index for this message (a verdict row carries it) → the saved one and its clock.
    replayIndex.set(store.turns.length, { saved: r.turnIndex, ms: r.stateBefore.elapsedMs ?? 0 });
    turnText = r.candidateText;
    savedTurnIndex = r.turnIndex;
    await runTurn(sid, r.candidateText, { onTurnRecord: x => { rec = x; }, defer: t => { deferred.push(t); } });
    // The turn has returned: its check is still pending (nothing awaited it).
    const started = pendingChecks.splice(startedBefore);
    checkerTally.started += started.length;
    checkerTally.pendingAtReturn += started.length;
    for (const c of started) {
      const v = RECORDED.get(c.key);
      if (v) { checkerTally.recorded++; c.resolve({ claims: v.claims.map(rawClaim), model: v.model, latencyMs: v.latencyMs, stopReason: 'end_turn' }); }
      else { checkerTally.noVerdict++; c.reject(new Error('no recorded verdict')); }
    }
    const before = store.events.length;
    await Promise.allSettled(deferred.map(t => t()));
    for (const e of store.events.slice(before)) {
      if (e.category !== 'math_checker' || e.landsAtMs !== undefined) continue;
      const p = e.payloadJsonb as { latencyMs?: number };
      if (e.subtype === 'verdict' || e.subtype === 'error') e.landsAtMs = (r.stateBefore.elapsedMs ?? 0) + (p.latencyMs ?? 0);
    }
    if (!rec) continue;
    const got = rec as TurnRecord;
    if (got.stateBefore.kind !== r.stateBefore.kind || (modelCalled && !savedModel)) diverged++;
    records.push({ ...got, turnIndex: r.turnIndex });
  }
  // REPLAY_EXTEND=<n> (close hold, 16 Oct): a run the saved messages leave open
  // gets up to n neutral replies — no figures, so no check starts — at the run's
  // own pace (the median gap of its last four messages), so what code does after
  // a hold (a probe, the close) is seen. Their turns carry `extended: true`.
  const extend = Number(process.env.REPLAY_EXTEND ?? 0);
  const ms = saved.map(x => x.stateBefore.elapsedMs ?? 0);
  const gaps = ms.slice(-5).slice(1).map((m, i) => m - ms.slice(-5)[i]).sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 90_000;
  let lastIndex = saved.at(-1)!.turnIndex, lastMs = ms.at(-1) ?? 0;
  for (let i = 0; i < extend && store.session.status === 'active'; i++) {
    lastIndex += 2; lastMs += gap;
    modelTurn = NEUTRAL; modelCalled = false; detections = []; judge = { answered: true, reason: 'replay' };
    store.session = { ...store.session, startedAt: new Date(Date.now() - lastMs) };
    checkerClock.nowMs = lastMs;
    currentKey = `extended#${lastIndex}`;
    let rec: TurnRecord | null = null;
    const deferred: (() => Promise<void>)[] = [];
    replayIndex.set(store.turns.length, { saved: lastIndex, ms: lastMs });
    await runTurn(sid, 'Understood. I would start with a small pilot and review it with the CEO.', { onTurnRecord: x => { rec = x; }, defer: t => { deferred.push(t); } });
    for (const c of pendingChecks.splice(0)) c.reject(new Error('no recorded verdict'));
    await Promise.allSettled(deferred.map(t => t()));
    if (rec) records.push({ ...(rec as TurnRecord), turnIndex: lastIndex, extended: true } as TurnRecord);
  }
  checkerReport(file, records, saved);
  return finish(records, header, run, file, diverged, false);
}

// The run's checker events and the turns they touched, for the step-3 report.
function checkerReport(file: string, records: TurnRecord[], saved: { turnIndex: number; stateBefore: { elapsedMs?: number | null } }[]) {
  if (!process.env.REPLAY_CHECKER) return;
  const events = store.events.filter(e => e.category === 'math_checker');
  const elapsed = saved.map(x => ({ t: x.turnIndex, ms: x.stateBefore.elapsedMs ?? 0 }));
  for (const v of events.filter(e => e.subtype === 'verdict')) {
    const n = replayIndex.get(v.turnIndex as number)?.saved ?? (v.turnIndex as number);
    const next = elapsed.find(x => x.t > n);
    const landed = elapsed.find(x => x.t > n && x.ms >= (v.landsAtMs as number));
    if (!landed) checkerTally.neverLanded++;
    else if (landed === next) checkerTally.landedNext++;
    else checkerTally.landedLater++;
  }
  if (events.length === 0) return;
  checkerOut.push({
    run: path.relative(ROOT, file).replace(/\.json$/, ''),
    events: events.map(e => ({ subtype: e.subtype, turnIndex: e.turnIndex, landsAtMs: e.landsAtMs, payload: e.payloadJsonb })),
    turns: records.map(x => {
      const check = x.checks.find(c => c.check === 'math_checker');
      const hint = (x.stateBefore.promptContext as { recomputeHint?: string } | null)?.recomputeHint ?? '';
      return { turnIndex: x.turnIndex, kind: x.stateBefore.kind, elapsedMs: x.stateBefore.elapsedMs, check: check?.detail ?? null, checkerHint: hint.includes('MATH CHECK FLAG') ? hint.slice(hint.indexOf('MATH CHECK FLAG')) : null, savedLine: x.savedLine };
    }).filter(t => t.check && ((t.check as Row).used || ((t.check as Row).decisions as unknown[])?.length)),
  });
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
    writeFileSync(path.join(OUT, 'replay-summary.json'), JSON.stringify({ ...tally, checker: process.env.REPLAY_CHECKER ? checkerTally : 'off' }, null, 1));
    if (process.env.REPLAY_CHECKER) writeFileSync(path.join(OUT, 'checker-replay.jsonl'), checkerOut.map(x => JSON.stringify(x)).join('\n') + '\n');
    log(JSON.stringify({ ...tally, skipped: tally.skipped.length, checker: checkerTally }));
    checkerOut = [];
    expect(tally.runs).toBeGreaterThan(0);
  }, 900_000);
});
