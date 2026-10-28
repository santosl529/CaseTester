// When the verdict arrives, measured against the turn boundary (Phase 1, item E's
// asynchronous variant; the round-2 report's §E.6, on Lorenzo's go of 27 Oct).
//
// The latency question for this checker is NOT added turn time. `startMathCheck` returns
// a job whose promise nothing in `plan-turn`, `session-runner` or `settle-turn` awaits;
// verdicts are read from stored `math_checker` event rows on a later turn. So the checker
// is off the interviewer's critical path, and the synchronous widening's +4,236 ms at p90
// never delayed speech — it delayed **when the verdict becomes available**, which pushes a
// probe or a correction a turn later, or past the close.
//
// So the number that decides it is verdict arrival against the next turn:
//   today          the checker alone                    (round 2's recorded off arm)
//   synchronous    the checker with the second task     (round 2's recorded on arm)
//   asynchronous   max(checker, extractor), in parallel (this script's calls)
// counted against two kinds of turn boundary:
//   (a) the real one — the 15 recorded `voice-live` sessions' candidate-turn gaps, the only
//       live speech timings that exist (n=115 gaps);
//   (b) each labelled message's own run window, which is a harness pacing artefact
//       (`--pace=human` runs sit at ~92 s, fast ones at ~9 s) and is reported for honesty,
//       not for deciding.
//
//   npx tsx scripts/equation-extractor-latency.ts --dry --pair=<off.jsonl>,<on.jsonl>
//   LLM_BUDGET_USD=0.10 LLM_BUDGET_FILE=<f> npx tsx --env-file=<main>/.env.local \
//     scripts/equation-extractor-latency.ts --pair=<off.jsonl>,<on.jsonl> [--out=<f.jsonl>]
//
// Paid: one Haiku 5.5 call per labelled message, one at a time (concurrency 1, so the
// numbers are not queueing artefacts — the same discipline the round-2 pair used).
import { appendFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus, type CorpusRun } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { requireRunBudget } from '@/lib/llm-budget';
import { costOf } from '@/lib/llm-pricing';
import { extractEquations, buildExtractorPrompt, EQUATION_EXTRACTOR_MODEL_ID } from '@/lib/orchestrator/equation-extractor';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k: string) => process.argv.includes(`--${k}`);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';
const OUT = arg('out');

type Recorded = { id: string; latencyMs: number; usd: number };
const rows = (f: string) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Recorded);

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};

// ── (a) the real turn boundary: the recorded voice sessions ─────────────────
// A candidate turn's checker fires when their speech ends; the next turn is planned when
// the next message's speech ends. So the window is the gap between consecutive
// `speechEndAt`s of the accepted candidate turns of a session.
export function voiceTurnGaps(root: string): number[] {
  const dir = path.join(root, 'voice-live');
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.jsonl')) files.push(p); } };
  walk(dir);
  const out: number[] = [];
  for (const f of files) {
    const ends = readFileSync(f, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as { speechEndAt?: number; cancelled?: boolean }; } catch { return null; } })
      .filter((r): r is { speechEndAt: number; cancelled?: boolean } => Boolean(r?.speechEndAt) && !r?.cancelled)
      .map(r => r.speechEndAt).sort((a, b) => a - b);
    for (let i = 1; i < ends.length; i++) {
      const g = ends[i] - ends[i - 1];
      if (g > 0 && g < 600_000) out.push(g);   // a gap over 10 minutes is a pause in the session, not a turn
    }
  }
  return out.sort((a, b) => a - b);
}

// ── the labelled messages, with their own run's window ─────────────────────
type Item = { id: string; run: CorpusRun; t: number; message: string; priors: string[]; windowMs: number | null; off: number; on: number };

function items(): Item[] {
  const [offFile, onFile] = (arg('pair') ?? '').split(',');
  if (!offFile || !onFile) throw new Error('--pair=<off.jsonl>,<on.jsonl> is required (round 2\'s recorded checker latencies)');
  const off = new Map(rows(offFile).map(r => [r.id, r.latencyMs]));
  const on = new Map(rows(onFile).map(r => [r.id, r.latencyMs]));
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const out: Item[] = [];
  for (const [id, offMs] of off) {
    const [runId, tPart] = id.split('#t');
    const run = runs.find(r => r.id === runId);
    if (!run) { console.log(`!! no run for ${id}`); continue; }
    const t = Number(tPart);
    const i = run.turns.findIndex(x => x.t === t);
    const here = run.turns[i], next = run.turns[i + 1];
    if (!here?.candidateText) { console.log(`!! no candidate text at ${id}`); continue; }
    out.push({
      id, run, t, message: here.candidateText,
      // the candidate's own earlier messages, as the live job passes them
      priors: run.turns.slice(0, i).filter(x => x.candidateText).map(x => x.candidateText),
      windowMs: here.elapsedMs !== undefined && next?.elapsedMs !== undefined ? next.elapsedMs - here.elapsedMs : null,
      off: offMs, on: on.get(id) ?? NaN,
    });
  }
  return out;
}

const share = (latencies: number[], gaps: number[]) => {
  let fit = 0;
  for (const l of latencies) for (const g of gaps) if (l < g) fit++;
  return fit / (latencies.length * gaps.length);
};

async function main(): Promise<void> {
  const list = items();
  const gaps = voiceTurnGaps(ROOT);
  console.log(`${list.length} labelled messages · ${gaps.length} real voice turn gaps (p10 ${pct(gaps, 0.1)} · p50 ${pct(gaps, 0.5)} · p90 ${pct(gaps, 0.9)} ms)`);
  console.log(`extractor: ${EQUATION_EXTRACTOR_MODEL_ID}, prompt ~${Math.ceil(buildExtractorPrompt(list[0]?.message ?? '', list[0]?.priors ?? []).length / 4)} input tokens with the candidate's earlier messages`);
  if (has('dry')) {
    const est = list.reduce((s, it) => s + costOf({ model: EQUATION_EXTRACTOR_MODEL_ID, inputTokens: Math.ceil(buildExtractorPrompt(it.message, it.priors).length / 4), outputTokens: 900, cacheReadTokens: 0, cacheWriteTokens: 0 }), 0);
    console.log(`dry: ${list.length} calls, ~$${est.toFixed(4)} in all`);
    return;
  }
  const ex: number[] = [];
  let usd = 0;
  for (const it of list) {
    const t0 = Date.now();
    const r = await extractEquations({ message: it.message, priorMessages: it.priors, onUsage: u => { usd += costOf(u); } });
    const ms = Date.now() - t0;
    ex.push(ms);
    const eq = r?.equations ?? [];
    console.log(`${it.id.slice(-28)} extractor ${ms}ms · checker off ${it.off} / on ${it.on} · ${eq.length} equations (${eq.filter(e => e.verdict === 'correct').length} correct, ${eq.filter(e => e.verdict === 'unclear').length} unclear, ${eq.filter(e => e.verdict === 'incorrect').length} incorrect) · sheet ${r?.answerSheet.length ?? 0}`);
    if (OUT) appendFileSync(OUT, JSON.stringify({ id: it.id, extractorMs: ms, offMs: it.off, onMs: it.on, windowMs: it.windowMs, equations: r?.equations ?? null, answerSheet: r?.answerSheet ?? null }) + '\n');
  }
  const asyncArr = list.map((it, i) => Math.max(it.off, ex[i]));
  console.log(`\n=== verdict arrival, ms`);
  for (const [name, xs] of [['today (checker alone)', list.map(i => i.off)], ['synchronous widening', list.map(i => i.on)], ['extractor alone', ex], ['asynchronous = max(checker, extractor)', asyncArr]] as const) {
    console.log(`${String(name).padEnd(38)} p50 ${String(pct([...xs], 0.5)).padStart(7)}  p90 ${String(pct([...xs], 0.9)).padStart(7)}  max ${String(Math.max(...xs)).padStart(7)}`);
  }
  console.log(`\n=== lands before the next turn (the ${gaps.length} real voice gaps × the ${list.length} messages)`);
  for (const [name, xs] of [['today', list.map(i => i.off)], ['synchronous', list.map(i => i.on)], ['asynchronous', asyncArr]] as const) {
    console.log(`${String(name).padEnd(14)} ${(share([...xs], gaps) * 100).toFixed(1)}%  (too late ${((1 - share([...xs], gaps)) * 100).toFixed(1)}%)`);
  }
  console.log(`\n=== each message against its own run's window (a harness pacing artefact — see the header)`);
  for (const [i, it] of list.entries()) {
    const w = it.windowMs;
    const mark = (ms: number) => (w === null ? 'no later turn' : ms < w ? 'in time' : 'TOO LATE');
    console.log(`${it.id.slice(-28)} window ${String(w ?? '—').padStart(7)}  today ${mark(it.off)} · sync ${mark(it.on)} · async ${mark(asyncArr[i])}`);
  }
  console.log(`\nspend this run: $${usd.toFixed(4)}`);
}

if (!has('dry')) requireRunBudget('equation-extractor-latency');
void main();
