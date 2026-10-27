// The safe direction, replayed (Phase 1, switch `equationClears`; Lorenzo's ruling of
// 27 Oct, round 4).
//
// The question the ruling asks is one-sided: how many FALSE doubts does the candidate's own
// verified arithmetic clear, and how many REAL errors does it shield — which must be 0. So
// this script replays both corpora the brief names, and prints every clear in full so each
// can be read by hand against the candidate's own words:
//
//   --arm=voice    the 131 recorded `voice-live` candidate messages. Two sides: the code
//                  flags the reader raises on them today, and the RECORDED checker claims
//                  of the 10 sessions that have a db-dump — which is where the three graded
//                  probes of the round-2 report's §A2 live.
//   --arm=speech   the whole typed corpus rewritten as STT would hand it over
//                  (`speech-replay.ts`'s own transform), which is where candidates state a
//                  full chain and the clearing can actually act.
//   --arm=claims   the doubt-probe side at scale: every recorded message of the corpus whose
//                  checker verdict carried a FLAGGED claim — the line that would have been
//                  spoken — re-vetted with the equations of that same message. Sampled
//                  systematically (every n-th of the 508, never the first N) with `--sample`.
//
// Selection is free and happens first: only a message that HAS a doubt to clear — a code
// flag, or a recorded flagged claim — is ever sent to the extractor. `--dry` prints the
// selection and stops, so the paid part is budgeted before a cent is spent.
//
//   npx tsx scripts/equation-clears-replay.ts --arm=speech --dry
//   LLM_BUDGET_USD=0.25 LLM_BUDGET_FILE=<f> npx tsx --env-file=<main>/.env.local \
//     scripts/equation-clears-replay.ts --arm=speech [--limit=N] [--cache=<f.jsonl>]
//
// Paid: one Haiku 5.5 extractor call per selected message (~$0.0005), concurrency 4, each
// one cached by id in `--cache` so a re-read of the results costs nothing.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { switchOn } from '@/lib/cases/engine-switches';
import { checkCandidateMath, type RecomputeFlag } from '@/lib/orchestrator/recompute';
import { clearedByEquation, sameBreath, type EquationCheck } from '@/lib/orchestrator/checker-equations';
import { vetCheckerClaims, type VettedClaim } from '@/lib/orchestrator/math-checker';
import { extractEquations } from '@/lib/orchestrator/equation-extractor';
import { requireRunBudget } from '@/lib/llm-budget';
import { voiceTurns } from './voice-math-measure';
import { toSpokenText } from './speech-replay';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k: string) => process.argv.includes(`--${k}`);
const ROOT = arg('root') ?? process.env.CORPUS_ROOT ?? 'Case Interview Runs';
const ARM = (arg('arm') ?? 'voice') as 'voice' | 'speech' | 'claims';
const SAMPLE = Number(arg('sample') ?? '0') || 0;
const LIMIT = Number(arg('limit') ?? '0') || Infinity;
const CACHE = arg('cache');
const OUT = arg('out');

const mathOpts = (caseId: string) => {
  const c = getCaseById(caseId);
  return {
    spokenReadings: switchOn(c, 'spokenMathParser'), speechNormalization: switchOn(c, 'speechNormalization'),
    ofAsMultiplication: switchOn(c, 'ofAsMultiplication'), scaleWordReading: switchOn(c, 'scaleWordReading'),
  };
};

// ── what there is to clear ──────────────────────────────────────────────────
type Item = {
  id: string; caseId: string; text: string; priors: string[]; revealed: string[];
  flags: RecomputeFlag[];              // code's own flags on the message, under the arm's switches
  claims: VettedClaim[];               // the recorded checker claims (voice arm, db-dump sessions)
};

function voiceItems(): Item[] {
  const turns = voiceTurns(ROOT);
  const bySession = new Map<string, typeof turns>();
  for (const t of turns) bySession.set(t.session, [...(bySession.get(t.session) ?? []), t]);
  const recorded = recordedClaims();
  const caseData = getCaseById('prof-001');
  const out: Item[] = [];
  for (const [session, ts] of bySession) {
    ts.sort((a, b) => a.t - b.t);
    ts.forEach((t, i) => {
      const flags = checkCandidateMath(t.text, caseData, t.revealed, mathOpts('prof-001')).flags;
      const claims = recorded.get(textKey(session, t.text)) ?? [];
      if (flags.length === 0 && claims.filter(c => c.flag).length === 0) return;
      out.push({ id: `${session}:${t.t}`, caseId: 'prof-001', text: t.text, priors: ts.slice(0, i).map(x => x.text), revealed: t.revealed, flags, claims });
    });
  }
  return out;
}

// The recorded verdicts of the sessions that have a db-dump: the claims the checker really
// made on these messages, as they were vetted at the time. The dump's `turnIndex` counts
// every turn of the session and the agent's jsonl counts its own accepted turns, so the two
// numberings do NOT line up (9813d6ce's message 19 in the dump is turnSeq 14 in the jsonl).
// The claims are therefore keyed by the candidate's own TEXT, which both sides hold.
const textKey = (session: string, text: string) => `${session}:${text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40)}`;

function recordedClaims(): Map<string, VettedClaim[]> {
  const out = new Map<string, VettedClaim[]>();
  const dir = path.join(ROOT, 'voice-live');
  if (!existsSync(dir)) return out;
  const walk = (d: string): string[] => readdirSync(d).flatMap((f: string) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith('-db-dump.json') ? [p] : [];
  });
  for (const f of walk(dir)) {
    const session = path.basename(f).slice(0, 8);
    const dump = JSON.parse(readFileSync(f, 'utf8')) as {
      turns?: { turnIndex?: number; role?: string; text?: string }[];
      events?: { category?: string; subtype?: string; payloadJsonb?: { candidateTurnIndex?: number; claims?: VettedClaim[] } }[];
    };
    const textOf = new Map((dump.turns ?? []).filter(t => t.role === 'candidate').map(t => [t.turnIndex, t.text ?? '']));
    for (const e of dump.events ?? []) {
      if (e.category !== 'math_checker' || e.subtype !== 'verdict') continue;
      const n = e.payloadJsonb?.candidateTurnIndex;
      const text = n === undefined ? undefined : textOf.get(n);
      if (!text) continue;
      out.set(textKey(session, text), e.payloadJsonb?.claims ?? []);
    }
  }
  return out;
}

function speechItems(): Item[] {
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const out: Item[] = [];
  for (const run of runs) {
    const caseData = getCaseById(run.caseId);
    const priors: string[] = [];
    for (const t of run.turns) {
      if (t.seeded || !t.candidateText) continue;
      const spoken = toSpokenText(t.candidateText);
      const flags = checkCandidateMath(spoken, caseData, t.revealedBefore, mathOpts(run.caseId)).flags;
      if (flags.length > 0) out.push({ id: `${run.id}:${t.t}`, caseId: run.caseId, text: spoken, priors: [...priors], revealed: t.revealedBefore, flags, claims: [] });
      priors.push(spoken);
    }
  }
  return out;
}

// ── the extractor, cached ───────────────────────────────────────────────────
type Cached = { id: string; equations: EquationCheck[] };
function loadCache(): Map<string, EquationCheck[]> {
  const m = new Map<string, EquationCheck[]>();
  if (!CACHE || !existsSync(CACHE)) return m;
  for (const l of readFileSync(CACHE, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l) as Cached;
    m.set(r.id, r.equations);
  }
  return m;
}

async function pool<T>(xs: T[], n: number, f: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    for (;;) { const k = i++; if (k >= xs.length) return; await f(xs[k]); }
  }));
}

// ── the clears, one by one ──────────────────────────────────────────────────
type Clear = { id: string; kind: 'code flag' | 'doubt probe'; how: string; doubted: string; expected: number | null; span: string; expression: string; quoted: string; text: string; errorType: string };

function clearsFor(item: Item, equations: EquationCheck[]): Clear[] {
  const out: Clear[] = [];
  for (const f of item.flags) {
    const c = clearedByEquation({ value: f.candidateValue, expected: f.expected, span: f.span }, equations, item.text);
    if (c) out.push({ id: item.id, kind: 'code flag', errorType: `code:${f.kind ?? 'step'}`, how: c.how, doubted: `${f.kind ?? 'step'}:${f.stepId} at ${f.candidateValue} (expected ${f.expected})`, expected: f.expected, span: f.span, expression: c.check.expression, quoted: c.check.quoted, text: item.text });
  }
  const flagged = item.claims.filter(c => c.flag);
  if (flagged.length > 0) {
    const ctx = { caseData: getCaseById(item.caseId), revealedIds: item.revealed, shownExhibitIds: [], candidateTexts: [...item.priors, item.text] };
    const after = vetCheckerClaims(flagged, { ...ctx, equations } as never);
    after.forEach((v, i) => {
      if (v.flag) return;
      const note = v.vetNotes.find(n => n.includes('their own arithmetic'));
      if (!note) return;   // dropped for another reason: not this switch's doing
      out.push({ id: item.id, kind: 'doubt probe', errorType: `checker:${flagged[i].errorType ?? 'none'}`, how: 'vet', doubted: `"${flagged[i].candidateValue}" (right ${flagged[i].correctValue ?? '?'})`, expected: flagged[i].correctValue, span: flagged[i].span, expression: note, quoted: '', text: item.text });
    });
  }
  return out;
}

// ── the claim side at scale: the corpus's own recorded flagged claims ───────
// Every run record that holds `math_checker` verdict rows (205 of them). A message counts
// when its verdict carried at least one FLAGGED claim — the line the engine was about to
// speak. The claims are re-vetted here with the same context on both sides, so the only
// difference between the two readings is the equations: a `flag` that goes true → false is
// this switch's doing and nothing else's.
type RunFile = {
  session?: { caseId?: string };
  turns?: { turnIndex?: number; role?: string; text?: string; timestampMs?: number }[];
  revealed?: { ledgerItemId?: string; revealedAtMs?: number }[];
  events?: { category?: string; subtype?: string; payloadJsonb?: { candidateTurnIndex?: number; claims?: VettedClaim[] } }[];
};

function claimItems(): Item[] {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json') && statSync(p).size < 8_000_000) files.push(p);
    }
  };
  walk(ROOT);
  const out: Item[] = [];
  for (const f of files.sort()) {
    let run: RunFile;
    try { run = JSON.parse(readFileSync(f, 'utf8')) as RunFile; } catch { continue; }
    const caseId = run.session?.caseId;
    const verdicts = (run.events ?? []).filter(e => e.category === 'math_checker' && e.subtype === 'verdict');
    if (!caseId || verdicts.length === 0) continue;
    let caseData;
    try { caseData = getCaseById(caseId); } catch { continue; }
    const candidates = (run.turns ?? []).filter(t => t.role === 'candidate' && t.text);
    for (const v of verdicts) {
      const n = v.payloadJsonb?.candidateTurnIndex;
      const claims = (v.payloadJsonb?.claims ?? []).filter(c => c.flag);
      if (n === undefined || claims.length === 0) continue;
      const turn = candidates.find(t => t.turnIndex === n);
      if (!turn?.text) continue;
      const at = turn.timestampMs;
      const revealed = (run.revealed ?? []).filter(r => r.ledgerItemId && (at === undefined || r.revealedAtMs === undefined || r.revealedAtMs <= at)).map(r => r.ledgerItemId!);
      out.push({
        id: `${path.relative(ROOT, f)}:${n}`, caseId, text: turn.text,
        priors: candidates.filter(t => (t.turnIndex ?? 0) < n).map(t => t.text!),
        revealed: revealed.length ? revealed : caseData.dataLedger.map(d => d.id),
        flags: [], claims,
      });
    }
  }
  // Systematic, never the first N: every n-th row of the whole ordered set.
  if (!SAMPLE || SAMPLE >= out.length) return out;
  const step = out.length / SAMPLE;
  return Array.from({ length: SAMPLE }, (_, i) => out[Math.floor(i * step)]);
}

async function main(): Promise<void> {
  const items = (ARM === 'voice' ? voiceItems() : ARM === 'speech' ? speechItems() : claimItems()).slice(0, LIMIT === Infinity ? undefined : LIMIT);
  const cache = loadCache();
  const todo = items.filter(i => !cache.has(i.id));
  console.log(`arm ${ARM} · ENGINE_SWITCHES=${process.env.ENGINE_SWITCHES ?? '(unset)'}`);
  console.log(`${items.length} messages with something to clear (${items.reduce((s, i) => s + i.flags.length, 0)} code flags, ${items.reduce((s, i) => s + i.claims.filter(c => c.flag).length, 0)} recorded flagged claims) · ${cache.size} cached · ${todo.length} to call`);
  if (has('dry')) {
    for (const i of items.slice(0, 40)) console.log(`  ${i.id}  flags=${i.flags.map(f => `${f.stepId}@${f.candidateValue}→${f.expected}`).join(' ')}  claims=${i.claims.filter(c => c.flag).map(c => c.candidateValue).join(' | ')}`);
    return;
  }
  const budget = requireRunBudget('equation-clears-replay');
  if (CACHE) mkdirSync(path.dirname(CACHE), { recursive: true });
  let failed = 0;
  await pool(todo, 4, async item => {
    if (budget.exceeded) return;
    const r = await extractEquations({ message: item.text, priorMessages: item.priors });
    if (!r) { failed++; return; }
    cache.set(item.id, r.equations);
    if (CACHE) appendFileSync(CACHE, JSON.stringify({ id: item.id, equations: r.equations } satisfies Cached) + '\n');
  });
  console.log(`[budget] ${budget.summary()}${failed ? ` · ${failed} calls failed or were refused` : ''}`);

  const clears: Clear[] = [];
  let read = 0;
  for (const item of items) {
    const eqs = cache.get(item.id);
    if (!eqs) continue;
    read++;
    clears.push(...clearsFor(item, eqs));
  }
  const lines: string[] = [];
  const say = (s: string) => { lines.push(s); console.log(s); };
  say(`\n=== ${ARM}: ${read} messages read, ${clears.length} clears ===`);
  for (const c of clears) {
    say(`\n[${c.kind} · ${c.how} · ${c.errorType}] ${c.id}`);
    say(`  doubt   : ${c.doubted}`);
    say(`  span    : ${c.span}`);
    say(`  equation: ${c.expression}  ("${c.quoted}")`);
    say(`  message : ${c.text}`);
  }
  // Why a clear did or did not happen, per doubt — the denominator the clears are counted
  // against, and where the rule stops short: the figure matched but not the breath, or the
  // breath matched but not the figure.
  let doubts = 0, flaggedBaseline = 0, eligibleNearby = 0, figureOnly = 0, breathOnly = 0;
  for (const item of items) {
    const eqs0 = cache.get(item.id);
    if (!eqs0) continue;
    const eligible = eqs0.filter(e => e.verdict === 'correct' && e.confirmed && !e.rescued);
    const ctx = { caseData: getCaseById(item.caseId), revealedIds: item.revealed, shownExhibitIds: [], candidateTexts: [...item.priors, item.text] };
    const base = item.claims.filter(c => c.flag).length ? vetCheckerClaims(item.claims.filter(c => c.flag), ctx as never) : [];
    const doubtRows = [
      ...item.flags.map(f => ({ value: f.candidateValue, expected: f.expected as number | null, span: f.span })),
      ...base.filter(v => v.flag).map(v => ({ value: Number((v.candidateValue.match(/\d[\d,]*(?:\.\d+)?/) ?? ['NaN'])[0].replace(/,/g, '')), expected: v.correctValue, span: v.span })),
    ];
    doubts += doubtRows.length;
    flaggedBaseline += base.filter(v => v.flag).length;
    for (const d of doubtRows) {
      const sameFigure = eligible.filter(e => Math.abs(e.stated - d.value) <= Math.max(0.05, Math.abs(d.value) * 0.01) || (d.expected !== null && Math.abs(e.stated - d.expected) <= Math.max(0.05, Math.abs(d.expected) * 0.01)));
      const inBreath = eligible.filter(e => sameBreath(e.quoted, d.span, item.text));
      if (sameFigure.length && inBreath.length) eligibleNearby++;
      else if (sameFigure.length) figureOnly++;
      else if (inBreath.length) breathOnly++;
    }
  }
  const byType = new Map<string, number>();
  for (const c of clears) byType.set(c.errorType, (byType.get(c.errorType) ?? 0) + 1);
  const eqs = items.flatMap(i => cache.get(i.id) ?? []);
  say(`\nequations read: ${eqs.length} · correct ${eqs.filter(e => e.verdict === 'correct').length} · unclear ${eqs.filter(e => e.verdict === 'unclear').length} · incorrect ${eqs.filter(e => e.verdict === 'incorrect').length}`);
  say(`confirmed in his own words: ${eqs.filter(e => e.confirmed).length} · rescued: ${eqs.filter(e => e.rescued).length}`);
  say(`clearing-eligible (correct, confirmed, not rescued): ${eqs.filter(e => e.verdict === 'correct' && e.confirmed && !e.rescued).length}`);
  say(`clears by the kind of doubt: ${[...byType].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}`);
  say(`doubts in the denominator: ${doubts} (${flaggedBaseline} of them checker claims still flagged on a re-vet)`);
  say(`  an eligible equation in the same breath AND on the figure: ${eligibleNearby} · on the figure only: ${figureOnly} · in the breath only: ${breathOnly}`);
  if (OUT) { mkdirSync(path.dirname(OUT), { recursive: true }); writeFileSync(OUT, lines.join('\n') + '\n'); }
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
