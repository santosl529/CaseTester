// The fault bank and its replay harness (Phase 1 contract §4, Stream 1). Free: no API call.
//
//   npx tsx scripts/fault-bank.ts build                      specs (evals/fault-bank/specs/<tag>.json) → evals/fault-bank/<batch>.jsonl
//   npx tsx scripts/fault-bank.ts check                      every record against its RECORDED turn file: a fault record
//                                                            must fail there (it records the fault), a correct one pass
//   npx tsx scripts/fault-bank.ts wave-list               evals/fault-bank/wave-judged.md: every record the replay can't prove (Lorenzo's
//                                                            Q2 ruling: the gate counts replayable records only) with what in the wave would show it fixed
//   npx tsx scripts/fault-bank.ts run --label=<l> [--switches=<ENGINE_SWITCHES>] [--jobs=8] [--only=<id-prefix>]
//                                                            replay every record's run through tests/replay/runner-corpus.replay.test.ts
//                                                            (the slice's recorded checker verdicts, as proof.sh), then check each
//                                                            assertion against the replayed turn file; prints and writes the tables
//
// The corpus root is REPLAY_ROOT (default: the main checkout's `Case Interview Runs`). Replay output goes to
// FAULT_BANK_OUT (default /Users/lorenzo/coding/personal-projects/CaseTester-proof-out)/fault-bank-<label>/ — never
// inside the corpus root (the replay scans the whole root and would re-read its own mirrors).
//
// The baseline (contract §4.5) is `run --label=baseline` with no --switches on the contract base: every replayable
// fault record is expected to fail and every correct record to pass. A record that does otherwise is classed:
//   fault passes, line unchanged  → wrong assertion (it doesn't see the fault)
//   fault passes, line changed    → fixed on the base (the base's code already changed that turn)
//   correct fails, line unchanged → wrong assertion
//   correct fails, line changed   → the base changed it (a regression, or a replay artifact)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { FaultRecordSchema, type FaultRecord, type FaultResult } from '@/lib/eval/fault-bank';
import { SLICES, SpecSchema, sliceOf, specToRecord, findTurnFile, itemLinesOf, isReportRecord, type Slice } from '@/lib/eval/fault-bank-build';
import { evaluateRecord, scopeTurns, type BankTurn, type CaseView } from '@/lib/eval/fault-bank-assert';
import { readTurnFile } from '@/lib/eval/turn-file';
import { engineSwitchNames } from '@/lib/eval/batch-manifest';
import { getCaseById, dataLineVersions } from '@/lib/cases/loader';

const ROOT = process.env.REPLAY_ROOT ?? '/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs';
const OUT_BASE = process.env.FAULT_BANK_OUT ?? '/Users/lorenzo/coding/personal-projects/CaseTester-proof-out';
const BANK = 'evals/fault-bank';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);

function loadBank(): FaultRecord[] {
  return readdirSync(BANK).filter(f => f.endsWith('.jsonl')).sort().flatMap(f =>
    readFileSync(path.join(BANK, f), 'utf8').split('\n').filter(Boolean).map((l, i) => {
      try { return FaultRecordSchema.parse(JSON.parse(l)); } catch (e) { throw new Error(`${f}:${i + 1}: ${(e as Error).message}`); }
    }));
}

const linesCache = new Map<string, CaseView>();
function linesFor(caseId: string) {
  if (!linesCache.has(caseId)) {
    const c = getCaseById(caseId);
    const versions = Object.fromEntries(c.dataLedger.map(i => [i.id, dataLineVersions(i.value)?.versions ?? []]));
    linesCache.set(caseId, { lines: itemLinesOf(c, versions), exhibits: Object.fromEntries(c.exhibits.map(e => [e.id, e.coversLedgerItems ?? []])) });
  }
  return linesCache.get(caseId)!;
}

function build() {
  const specDir = path.join(BANK, 'specs');
  const byBatch = new Map<string, FaultRecord[]>();
  const ids = new Set<string>();
  for (const f of readdirSync(specDir).filter(x => x.endsWith('.json')).sort()) {
    const slice = sliceOf(f.replace(/\.json$/, ''));
    const specs = (JSON.parse(readFileSync(path.join(specDir, f), 'utf8')) as unknown[]).map((s, i) => {
      const r = SpecSchema.safeParse(s);
      if (!r.success) throw new Error(`${f}[${i}] ${(s as { id?: string }).id ?? ''}: ${r.error.message}`);
      return r.data;
    });
    const runs = new Map<string, ReturnType<typeof readTurnFile> & { rel: string }>();
    for (const spec of specs) {
      if (ids.has(spec.id)) throw new Error(`duplicate id ${spec.id}`);
      ids.add(spec.id);
      if (!runs.has(spec.p)) {
        const rel = findTurnFile(ROOT, slice, spec.p);
        runs.set(spec.p, { ...readTurnFile(path.join(ROOT, rel)), rel });
      }
      const run = runs.get(spec.p)!;
      const rec = specToRecord(spec, slice, { turnFile: run.rel, header: run.header, turns: run.turns });
      byBatch.set(slice.batch, [...(byBatch.get(slice.batch) ?? []), rec]);
    }
  }
  for (const [batch, recs] of byBatch) writeFileSync(path.join(BANK, `${batch}.jsonl`), recs.map(r => JSON.stringify(r)).join('\n') + '\n');
  const all = [...byBatch.values()].flat();
  console.log(`built ${all.length} records (${all.filter(r => r.kind === 'fault').length} fault, ${all.filter(r => r.kind === 'correct').length} correct) in ${byBatch.size} files`);
}

const turnsOf = (file: string): BankTurn[] => readTurnFile(file).turns;

// Against the recording itself: a fault record must fail (its assertions describe the right behaviour, which the
// recording lacks), a correct record must pass. Report records are skipped (scoring, not a turn).
function check(): number {
  const recs = loadBank();
  const bad: string[] = [];
  for (const r of recs) {
    if (isReportRecord(r)) continue;
    const res = evaluateRecord(r, turnsOf(path.join(ROOT, r.turnFile)), linesFor(r.caseId));
    const want = r.kind === 'correct';
    if (res.pass !== want) bad.push(`${r.id}: ${r.kind} record ${res.pass ? 'passes' : 'fails'} on the recording${res.failed.length ? ` — ${res.failed.map(f => `${f.assertion.kind}${f.assertion.must ? '' : ' (must not)'}: ${f.saw}`).join(' / ')}` : ''}`);
  }
  console.log(`checked ${recs.length} records against their recordings: ${bad.length} wrong`);
  for (const b of bad) console.log(`  ✗ ${b}`);
  return bad.length;
}

// CK31 as replay31.sh defines it, plus the slice's file; b38l's verdicts converted from the run records.
function checkerFiles(slice: Slice, out: string): string {
  const sh = readFileSync(path.join(ROOT, 'replays/2026-10-18/tools/replay31.sh'), 'utf8');
  const ck31 = /^CK="([^"]*)"/m.exec(sh)?.[1];
  if (!ck31) throw new Error('CK= not found in replay31.sh');
  if (slice.verdicts) return `${ck31},${path.join(ROOT, slice.verdicts)}`;
  const dir = path.join(out, 'verdicts');
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${slice.tag}-verdicts.jsonl`);
  const rows: string[] = [];
  const waveDir = path.join(ROOT, 'test runs', slice.wave);
  for (const persona of readdirSync(waveDir).sort()) {
    for (const j of readdirSync(path.join(waveDir, persona)).filter(x => /^live-run-.*\.json$/.test(x)).sort()) {
      const run = JSON.parse(readFileSync(path.join(waveDir, persona, j), 'utf8')) as { events: { category: string; subtype: string; turnIndex: number; payloadJsonb: Record<string, unknown> }[] };
      for (const e of run.events) {
        if (e.category !== 'math_checker' || e.subtype !== 'verdict') continue;
        const { candidateTurnIndex: _drop, ...p } = e.payloadJsonb;
        void _drop;
        rows.push(JSON.stringify({ id: `test runs/${slice.wave}/${persona}/${j.replace(/\.json$/, '')}#t${e.turnIndex + 1}`, ...p }));
      }
    }
  }
  writeFileSync(f, rows.join('\n') + '\n');
  return `${ck31},${f}`;
}

// Finding 14 of the Stream 1 review: --switches is plumbed but, at the base, consumed by nothing — so a typo'd
// case id ('prof-01=phase1') would silently give switches-off results. The replay stamps engineSwitchNames(case)
// into every mirror header; this asserts it is exactly what --switches asks for, run by run.
const switchCache = new Map<string, string>();
function assertSwitches(mirror: string, caseId: string, switches: string | undefined) {
  const want = switchCache.get(caseId) ?? (() => {
    const v = engineSwitchNames(getCaseById(caseId), { ENGINE_SWITCHES: switches }).join(',');
    switchCache.set(caseId, v);
    return v;
  })();
  const got = readTurnFile(mirror).header.engineSwitches;
  if (got === undefined) throw new Error(`${mirror}: the mirror header carries no engineSwitches — the replay is older than the switch stamp`);
  if (got.join(',') !== want) throw new Error(`${mirror}: the replay ran with switches [${got.join(',')}], but --switches=${switches ?? '(off)'} means [${want}] for ${caseId}`);
}

function replayOne(dir: string, filter: string, ck: string, switches: string | undefined): Promise<number> {
  const env: NodeJS.ProcessEnv = { ...process.env, REPLAY_RUNNER: '1', REPLAY_OUT: dir, REPLAY_ROOT: ROOT, REPLAY_FILTER: filter, REPLAY_CHECKER: ck };
  if (switches) env.ENGINE_SWITCHES = switches; else delete env.ENGINE_SWITCHES;
  return new Promise(resolve => {
    const child = spawn('npx', ['vitest', 'run', 'tests/replay/runner-corpus.replay.test.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    child.on('close', code => { writeFileSync(`${dir}.log`, log); resolve(code ?? 1); });
  });
}

async function pool<T>(items: T[], jobs: number, f: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(jobs, q.length) }, async () => { while (q.length) await f(q.shift()!); }));
}

// `gated`: the record the gate counts — replayable, not skipped, and (for a fault record) owned by a stream
// Phase 1 builds. `phase2` and `none` FAULT records are excluded explicitly (finding 3 of the Stream 1 review):
// nothing in Phase 1 touches them, so the condition would be unmeetable by construction. Every correct record is
// counted whoever owns it — gate condition 1 requires all of them to pass, both ways.
type Row = FaultResult & { kind: FaultRecord['kind']; batch: string; cls: string; sev: string; stream: string; replayable: boolean; changed: boolean; baseline: string; gated: boolean };
const PHASE1_STREAMS = new Set(['2', '3', '4']);

function wordsAt(turns: BankTurn[], n: number) { return turns.find(t => t.turnIndex === n - 1)?.delivered.map(s => s.text).join(' ') ?? null; }

function baselineClass(r: FaultRecord, res: FaultResult, changed: boolean): string {
  if (res.skipped) return res.skipped;
  if (r.kind === 'fault') return res.pass ? (changed ? 'fixed_on_base' : 'WRONG_ASSERTION') : 'fails_as_expected';
  return res.pass ? 'passes_as_expected' : (changed ? 'base_changed_it' : 'WRONG_ASSERTION');
}

async function run() {
  const label = arg('label');
  if (!label) throw new Error('--label=<label> is required');
  const switches = arg('switches');
  const jobs = Number(arg('jobs') ?? 8);
  const out = path.join(OUT_BASE, `fault-bank-${label}`);
  if (path.resolve(out).startsWith(path.resolve(ROOT))) throw new Error('the replay output must be outside the corpus root');
  mkdirSync(out, { recursive: true });
  const recs = loadBank().filter(r => !arg('only') || r.id.startsWith(arg('only')!));
  const runFiles = [...new Set(recs.map(r => r.turnFile))];
  const t0 = Date.now();
  const ck = new Map<string, string>(SLICES.map(s => [s.wave, checkerFiles(s, out)]));
  const failedRuns: string[] = [];
  await pool(runFiles, jobs, async tf => {
    const [, wave, persona] = tf.split('/');
    const code = await replayOne(path.join(out, 'replay', `${wave}--${persona}`), `${wave}/${persona}/`, ck.get(wave)!, switches);
    if (code !== 0) failedRuns.push(tf);
  });
  const replayMs = Date.now() - t0;
  const rows: Row[] = [];
  for (const r of recs) {
    const mirror = path.join(out, 'replay', `${r.turnFile.split('/')[1]}--${r.turnFile.split('/')[2]}`, r.turnFile);
    const meta = { kind: r.kind, batch: r.batch, cls: r.grade.class, sev: r.grade.severity, stream: String(r.stream), replayable: r.replayable };
    if (isReportRecord(r)) { rows.push({ id: r.id, pass: false, failed: [], skipped: 'not_replayable', ...meta, changed: false, baseline: 'report', gated: false }); continue; }
    if (!existsSync(mirror)) { rows.push({ id: r.id, pass: false, failed: [], skipped: 'run_missing', ...meta, changed: false, baseline: 'run_missing', gated: false }); continue; }
    assertSwitches(mirror, r.caseId, switches);
    const replayed = turnsOf(mirror);
    const recorded = turnsOf(path.join(ROOT, r.turnFile));
    const res = evaluateRecord(r, replayed, linesFor(r.caseId));
    const last = Math.max(...recorded.map(t => t.turnIndex + 1));
    const scopes = [...new Set(r.assertions.flatMap(a => scopeTurns(a, r.turn, last)))];
    const changed = scopes.some(n => wordsAt(replayed, n) !== wordsAt(recorded, n));
    const own = replayed.find(t => t.turnIndex === r.turn - 1);
    const kindChanged = own && own.stateBefore.kind !== recorded.find(t => t.turnIndex === r.turn - 1)?.stateBefore.kind;
    const result: FaultResult = { ...res, ...(kindChanged ? { skipped: 'diverged' as const } : {}), ...(!r.replayable ? { skipped: 'not_replayable' as const } : {}) };
    const gated = r.replayable && !result.skipped && (r.kind === 'correct' || PHASE1_STREAMS.has(String(r.stream)));
    rows.push({ ...result, ...meta, changed, baseline: baselineClass(r, { ...res, ...(kindChanged ? { skipped: 'diverged' as const } : {}) }, changed), gated });
  }
  const md = report(rows, recs, { label, switches: switches ?? '(off)', replayMs, runs: runFiles.length, failedRuns });
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(rows, null, 1));
  writeFileSync(path.join(out, 'results.md'), md);
  console.log(md.split('\n## Records')[0]);
  console.log(`→ ${out}/results.md`);
}

function report(rows: Row[], recs: FaultRecord[], m: { label: string; switches: string; replayMs: number; runs: number; failedRuns: string[] }): string {
  const L: string[] = [];
  const rep = rows.filter(r => r.replayable && r.baseline !== 'report');
  const count = (xs: Row[], p: (r: Row) => boolean) => xs.filter(p).length;
  L.push(`# Fault bank — ${m.label}`, '', `Switches: \`${m.switches}\` · ${rows.length} records (${count(rows, r => r.kind === 'fault')} fault, ${count(rows, r => r.kind === 'correct')} correct) · ${m.runs} runs replayed in ${(m.replayMs / 1000).toFixed(0)} s${m.failedRuns.length ? ` · **replay failed: ${m.failedRuns.join(', ')}**` : ''}`, '');
  // Finding 4 of the Stream 1 review: partition on `skipped` FIRST. A skipped record is neither a pass nor a fail —
  // the replay never looked at it — so the old table double-counted the diverged rows inside "fail".
  L.push('## Summary', '',
    'Every record is first partitioned on `skipped`: `not_replayable` (contract §4.3 / Q2, judged in the wave),',
    '`diverged` (the replay wrote another kind of turn there, so its assertions have no subject), `vacuous` (a',
    'must-not whose window holds no replayed turn) and `run_missing`. Pass and fail are counted only over the rest.', '',
    '| kind | records | skipped | counted | pass | fail |', '|---|---:|---:|---:|---:|---:|');
  for (const k of ['fault', 'correct'] as const) {
    const xs = rows.filter(r => r.kind === k);
    const live = xs.filter(r => !r.skipped);
    L.push(`| ${k} | ${xs.length} | ${count(xs, r => !!r.skipped)} | ${live.length} | ${count(live, r => r.pass)} | ${count(live, r => !r.pass)} |`);
  }
  L.push('', '| skipped | fault | correct |', '|---|---:|---:|');
  for (const why of ['not_replayable', 'diverged', 'vacuous', 'run_missing'] as const) {
    const xs = rows.filter(r => r.skipped === why);
    if (xs.length) L.push(`| ${why} | ${count(xs, r => r.kind === 'fault')} | ${count(xs, r => r.kind === 'correct')} |`);
  }
  L.push('', 'How a diverged record is judged: not by this harness. The replay drives one turn at a time with the saved',
    'model output, so when code now writes a turn the model wrote (or the other way round) the saved declarations for',
    'that turn are gone and the turn the replay writes answers a different question. Those records are read by hand',
    'against the before/after lines in `## Failed assertions` below, and otherwise go to the wave with the',
    '`not_replayable` ones (contract §4.3).', '',
    `Not replayable (judged in the wave, contract §4.3 / Q2): ${count(rows, r => !r.replayable)} (report records ${count(rows, r => r.baseline === 'report')}).`, '');
  // Gate condition 1 (contract §6), with the streams Phase 1 does not build excluded explicitly.
  const gate = rows.filter(r => r.gated);
  const excluded = rows.filter(r => r.kind === 'fault' && r.replayable && !PHASE1_STREAMS.has(r.stream));
  L.push('## Gate condition 1 (contract §6)', '',
    `Counted: replayable fault records owned by streams 2, 3 and 4, not skipped — **${count(gate, r => r.kind === 'fault' && r.pass)} pass / ${count(gate, r => r.kind === 'fault')}**.`,
    `Excluded: ${excluded.length} replayable fault records owned by \`phase2\` or \`none\` (${excluded.map(r => r.id).join(', ') || 'none'}) — no Phase 1 stream touches them.`,
    `Correct records, not skipped: **${count(rows.filter(r => r.kind === 'correct' && !r.skipped), r => r.pass)} pass / ${count(rows, r => r.kind === 'correct' && !r.skipped)}** (all must pass, switches off and on).`, '');
  L.push('## Baseline classes (contract §4.5)', '', '| class | records |', '|---|---:|');
  const classes = new Map<string, number>();
  for (const r of rep) classes.set(r.baseline, (classes.get(r.baseline) ?? 0) + 1);
  for (const [c, n] of [...classes].sort()) L.push(`| ${c} | ${n} |`);
  const table = (title: string, key: (r: Row) => string) => {
    L.push('', `## By ${title}`, '', `| ${title} | fault pass / n | correct pass / n |`, '|---|---:|---:|');
    const keys = [...new Set(rep.map(key))].sort();
    for (const k of keys) {
      const xs = rep.filter(r => key(r) === k);
      const f = xs.filter(r => r.kind === 'fault'), c = xs.filter(r => r.kind === 'correct');
      L.push(`| ${k} | ${count(f, r => r.pass)} / ${f.length} | ${count(c, r => r.pass)} / ${c.length} |`);
    }
  };
  table('batch', r => r.batch);
  table('stream', r => r.stream);
  table('class', r => r.cls);
  L.push('', '## Records', '', '| id | kind | sev | class | stream | replayable | gated | result | changed | baseline |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${r.id} | ${r.kind} | ${r.sev} | ${r.cls} | ${r.stream} | ${r.replayable ? 'yes' : 'no'} | ${r.gated ? 'yes' : ''} | ${r.skipped ?? (r.pass ? 'pass' : 'FAIL')} | ${r.changed ? 'yes' : ''} | ${r.baseline} |`);
  L.push('', '## Failed assertions (what the replay delivered)', '');
  const byId = new Map(recs.map(r => [r.id, r]));
  for (const r of rows.filter(x => x.failed.length)) {
    L.push(`- **${r.id}** (${r.kind}, ${byId.get(r.id)!.turn ? `t${byId.get(r.id)!.turn}` : ''}): ${r.failed.map(f => `\`${JSON.stringify(f.assertion)}\` — ${f.saw.replace(/\|/g, '/')}`).join('; ')}`);
  }
  return L.join('\n') + '\n';
}

// Records the replay can't prove, with what the wave would show (contract §4.3; Lorenzo's Q2 ruling, 22 Oct).
function waveList() {
  const recs = loadBank().filter(r => !r.replayable);
  const esc = (x: string) => x.replace(/\|/g, '/').replace(/\n/g, ' ');
  const L = ['# Fault-bank records judged in the wave', '',
    'Generated by `npx tsx scripts/fault-bank.ts wave-list` from `evals/fault-bank/*.jsonl`. Lorenzo\'s Q2 ruling (22 Oct): the gate counts only replayable fault records; each record below says what in the wave would show it fixed — the observable outcome, the persona or case likely to trigger it, and which grade (auditor or hand) would see it.', '',
    `${recs.length} records (${recs.filter(r => r.kind === 'fault').length} fault, ${recs.filter(r => r.grade.class === 'report_false').length} of them report faults).`, '',
    '| id | sev | class | stream | what in the wave would show it fixed |', '|---|---|---|---|---|'];
  for (const r of recs) L.push(`| ${r.id} | ${r.grade.severity} | ${r.grade.class} | ${r.stream} | ${esc(r.replayNote ?? '')} |`);
  writeFileSync(path.join(BANK, 'wave-judged.md'), L.join('\n') + '\n');
  console.log(`wrote ${BANK}/wave-judged.md (${recs.length} records)`);
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'wave-list') waveList();
else if (cmd === 'check') process.exitCode = check() ? 1 : 0;
else if (cmd === 'run') run().catch(e => { console.error(e); process.exit(1); });
else { console.error('usage: fault-bank.ts build | check | wave-list | run --label=<l> [--switches=…] [--jobs=n] [--only=<id-prefix>]'); process.exit(2); }
