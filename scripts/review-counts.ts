// Counts of three interviewer faults per turn and per run, for comparing
// interviewers across batches (11 Oct, outside review of batch 19 vs batch 18
// v3). Read from each run's turn file (<run>.turns.jsonl.gz): what was
// delivered, by segment kind, and what code decided. Free — no model calls.
//
//   pending  — the model's words treat data as still to come ("Once you have
//              those figures…", "…on their way") on a turn whose data line
//              released it (delivered say/tail, release or exhibit this turn)
//   grading  — a declarative sentence in say/tail that grades the candidate's
//              work ("Clear structure.", "Your bean math holds up.")
//   offer    — code offered data the candidate didn't ask for ("I can share X
//              if you'd like"), from a model-declared implicit request
//   early rec — the model asked for the recommendation while the exhibit or
//              the brainstorm was still owed, outside time pressure (v4.10
//              withholds it; batch 18 predates that)
//
// Plus first-useful and first-token latency over model turns.
//
//   npx tsx scripts/review-counts.ts [--hits=pending|grading|offer] [--runs]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from '@/lib/eval/turn-file';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import { isBareAcknowledgment } from '@/lib/orchestrator/stream-turn';
import { asksRecommendationAsk, asksBrainstorm } from '@/lib/orchestrator/spoken-close';
import { isUnderTimePressure } from '@/lib/orchestrator/pacing';
import { TOTAL_CASE_MS } from '@/lib/orchestrator/state-machine';

const ROOT = 'Case Interview Runs/test runs';

// The object is data, not the candidate's own work ("once you have a number",
// "before you rely on that", "before we use that weighted figure" stay out).
const DATA_OBJECT = /(?:them|those|these|that|it|both|(?:the )?(?!(?:a|an|your|my|this|that)\b)[\w&' -]{0,30}?(?:figures?|numbers?|data|prices?|breakdown|split|history|change|share|percentages|line items|cost structure|count|revenue|exhibit))\b/.source;
export const PENDING_DATA = new RegExp([
  `\\bonce you(?:'ve| have)? (?:have|had|got|get|see|seen|read|look at|looked at|hear|heard)? ?${DATA_OBJECT}`,
  /\bbefore (?:those|these|the|that|they|it)\b[^.?!]{0,30}\b(?:come|comes|arrive|arrives|land|lands)(?: in)?\b/.source,
  `\\bbefore (?:we|you) (?:get to|get into|go into|look at|see|read|dig into) ${DATA_OBJECT}`,
  /\b(?:are|is|'re|'s) on (?:their|its) way\b/.source,
  /\bcoming (?:up|through)(?: now)?\b/.source,
  /\b(?:you'?re|you are) about to (?:hear|see|get)\b/.source,
  /\bwhen (?:those|these|they|the \w+) (?:come in|arrive|land)\b/.source,
].join('|'), 'i');

const GRADE = new RegExp([
  /\b(?:clear(?:er|ly)?|clean(?:ly)?|good|great|nice|excellent|solid|strong|sound|sharp|crisp|tight|thorough|valid|reasonable|logical|well[- ](?:done|structured|reasoned))\b/.source,
  /\b(?:that'?s|you'?re|you are|that is|it'?s|this is) (?:right|correct)\b|^right,\s|\bcorrect(?:ly)?\b/.source,
  /\b(?:holds? up|holds? together|(?:that|it|this|math|logic|which|figure|number) holds)\b/.source,
  /\b(?:ties? out|reconcil(?:es|ed)|checks? out|adds? up|closes? cleanly|closes the gap|makes sense|spot[- ]on|exactly right|on (?:the right )?track)\b/.source,
  /\bholds(?=[.,!])|\bthe right (?:direction|one|question|call|instinct|place)\b|\baccounts for (?:all|the full|the whole|the entire)\b/.source,
].join('|'), 'i');
// A probe that only mentions a verdict word ("Walk me through whether that
// holds…", "Suppose the pilot shows a clear gain") asks, it doesn't grade.
const PROBE_OPENER = /^(?:walk me through|talk me through|tell me|explain|suppose|assume|say|imagine|what|how|why|which)\b/i;
// Restating the candidate's claim back ("You said … accounts for the entire
// decline", "…if volume holds") isn't a verdict on it.
const RESTATEMENT = /^(?:before we go further, )?you(?:'ve)? (?:said|made clear|sized|assumed|argued)\b|\b(?:if|assuming) (?:volume|traffic|demand) holds\b/i;

export function sentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
}

export function gradingSentences(text: string): string[] {
  return sentences(text).filter(s => !s.endsWith('?') && !isBareAcknowledgment(s) && !PROBE_OPENER.test(s) && !RESTATEMENT.test(s) && GRADE.test(s));
}

type RunRef = { group: string; label: string; file: string };

function turnFileIn(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find(x => x.endsWith('.turns.jsonl.gz'));
  return f ? path.join(dir, f) : null;
}

function manifestRuns(batch: string, group: string, only?: (r: { version: string; personaId: number }) => boolean): RunRef[] {
  const m = JSON.parse(readFileSync(path.join(ROOT, batch, 'manifest.json'), 'utf8')) as { version: string; runs: { personaId: number; status: string; version: string; runDir: string | null; runNumber: number }[] };
  return m.runs.filter(r => r.status === 'done' && r.runDir && r.version === m.version && (!only || only(r)))
    .map(r => ({ group, label: `${path.basename(path.dirname(r.runDir!))}/${path.basename(r.runDir!)}`, file: turnFileIn(r.runDir!) }))
    .filter((r): r is RunRef => r.file !== null);
}

function check(t: TurnRecord, name: string) { return t.checks.find(c => c.check === name); }

type TurnHit = { run: string; turn: number; kind: 'pending' | 'grading' | 'offer'; text: string; code: boolean };

export function turnFaults(t: TurnRecord): { pending: string[]; grading: string[]; offers: string[]; codeTail: boolean } {
  const dd = check(t, 'data_decisions')?.detail as { releases?: string[]; offers?: string[]; exhibit?: string | null } | undefined;
  const released = (dd?.releases?.length ?? 0) > 0 || Boolean(dd?.exhibit);
  const own = t.delivered.filter(d => d.kind === 'say' || d.kind === 'tail');
  // A tail that isn't the model's question is code's (a replacement, stage or rung line).
  const q = t.parsedTurn?.question?.trim() ?? '';
  const codeTail = own.some(d => d.kind === 'tail' && q !== '' && !d.text.includes(q.slice(0, 40)));
  const text = own.map(d => d.text).join(' ');
  return {
    pending: released ? sentences(text).filter(s => PENDING_DATA.test(s)) : [],
    grading: gradingSentences(text),
    offers: dd?.offers ?? [],
    codeTail,
  };
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; }
function p90(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)] : NaN; }

function main() {
  const args = process.argv.slice(2);
  const hitsOf = args.find(a => a.startsWith('--hits='))?.split('=')[1];
  const perRun = args.includes('--runs');
  const b19 = manifestRuns('batch-19', 'haiku-b19');
  const travis = turnFileIn(path.join(ROOT, 'batch-19-oct-11-travis-listed', '30-travis-the-immediate-abuser'));
  if (travis) b19.push({ group: 'haiku-b19', label: 'batch-19-oct-11-travis-listed/30-travis-the-immediate-abuser', file: travis });
  const smokeDir = 'Case Interview Runs/default-candidate';
  const smoke = readdirSync(smokeDir).find(f => f.includes('b284faee') && f.endsWith('.turns.jsonl.gz'));
  const b19Personas = new Set(b19.map(r => Number(path.basename(r.label).split('-')[0])));
  const runs: RunRef[] = [
    ...b19,
    ...(smoke ? [{ group: 'haiku-smoke', label: 'default-candidate/b284faee', file: path.join(smokeDir, smoke) }] : []),
    ...manifestRuns('batch-18', 'sonnet-b18v3-same', r => b19Personas.has(r.personaId)),
    ...manifestRuns('batch-18', 'sonnet-b18v3-other', r => !b19Personas.has(r.personaId)),
  ];
  const combined: Record<string, string> = { 'sonnet-b18v3-same': 'sonnet-b18v3-all', 'sonnet-b18v3-other': 'sonnet-b18v3-all' };

  const hits: TurnHit[] = [];
  type Agg = { runs: number; modelTurns: number; pendingT: number; pendingR: number; gradingT: number; gradingS: number; gradingR: number; offerT: number; offerItems: number; offerR: number; turn2Clear: number; earlyRec: number; earlyRecR: number; useful: number[]; ttft: number[] };
  const blank = (): Agg => ({ runs: 0, modelTurns: 0, pendingT: 0, pendingR: 0, gradingT: 0, gradingS: 0, gradingR: 0, offerT: 0, offerItems: 0, offerR: 0, turn2Clear: 0, earlyRec: 0, earlyRecR: 0, useful: [], ttft: [] });
  const agg: Record<string, Agg> = {};
  const runRows: string[] = [];
  for (const r of runs) {
    const { turns } = readTurnFile(r.file);
    const a = (agg[r.group] ??= blank());
    a.runs++;
    let p = 0, g = 0, o = 0, e = 0;
    let firstModel = true;
    let brainstormAsked = false;
    for (const t of turns) {
      const brainstormBefore = brainstormAsked;
      if (t.delivered.some(d => asksBrainstorm(d.text))) brainstormAsked = true;
      if (t.stateBefore.kind !== 'model') continue;
      a.modelTurns++;
      if (asksRecommendationAsk(t.parsedTurn?.question ?? '') && (t.stateBefore.shownExhibitIds.length === 0 || !brainstormBefore)
        && !isUnderTimePressure(t.stateBefore.elapsedMs ?? 0, TOTAL_CASE_MS)) { a.earlyRec++; e++; }
      const f = turnFaults(t);
      if (f.pending.length) { a.pendingT++; p++; f.pending.forEach(s => hits.push({ run: r.label, turn: t.turnIndex + 1, kind: 'pending', text: s, code: f.codeTail })); }
      if (f.grading.length) { a.gradingT++; a.gradingS += f.grading.length; g += f.grading.length; f.grading.forEach(s => hits.push({ run: r.label, turn: t.turnIndex + 1, kind: 'grading', text: s, code: f.codeTail })); }
      if (f.offers.length) { a.offerT++; a.offerItems += f.offers.length; o++; hits.push({ run: r.label, turn: t.turnIndex + 1, kind: 'offer', text: `${f.offers.join(' | ')}  ⟵ cand: ${t.candidateText.replace(/\s+/g, ' ').slice(0, 220)}`, code: true }); }
      if (firstModel && f.grading.some(s => /^(?:\w+[.,]\s*)?clear\b/i.test(s))) a.turn2Clear++;
      firstModel = false;
      const tm = t.timing;
      const useful = tm.first_useful_delivered ?? Math.min(tm.data_line_delivered ?? Infinity, tm.tail_delivered ?? Infinity);
      if (Number.isFinite(useful)) a.useful.push(useful);
      if (tm.model_first_token != null && tm.model_request != null) a.ttft.push(tm.model_first_token - tm.model_request);
    }
    if (p) a.pendingR++;
    if (g) a.gradingR++;
    if (o) a.offerR++;
    if (e) a.earlyRecR++;
    runRows.push(`${r.group}\t${r.label}\tpending=${p}\tgrading=${g}\toffer-turns=${o}\tearly-rec=${e}`);
  }
  // Combined rows (sums of their groups).
  for (const [from, to] of Object.entries(combined)) {
    const a = agg[from];
    if (!a) continue;
    const c = (agg[to] ??= blank());
    for (const k of Object.keys(a) as (keyof Agg)[]) {
      if (Array.isArray(a[k])) (c[k] as number[]).push(...(a[k] as number[]));
      else (c[k] as number) += a[k] as number;
    }
  }

  console.log('| group | runs | model turns | pending: turns / runs with ≥1 | grading: sentences (per run) / runs with ≥1 / first-turn "clear…" | offers: turns (items) / runs with ≥1 | early rec ask: turns / runs | first useful median / p90 (s) | first token median / p90 (s) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [k, a] of Object.entries(agg)) {
    console.log(`| ${k} | ${a.runs} | ${a.modelTurns} | ${a.pendingT} / ${a.pendingR} | ${a.gradingS} (${(a.gradingS / a.runs).toFixed(2)}) / ${a.gradingR} / ${a.turn2Clear} | ${a.offerT} (${a.offerItems}) / ${a.offerR} | ${a.earlyRec} / ${a.earlyRecR} | ${(median(a.useful) / 1000).toFixed(2)} / ${(p90(a.useful) / 1000).toFixed(2)} (n=${a.useful.length}) | ${(median(a.ttft) / 1000).toFixed(2)} / ${(p90(a.ttft) / 1000).toFixed(2)} |`);
  }
  if (perRun) console.log('\n' + runRows.join('\n'));
  if (hitsOf) {
    console.log(`\n## ${hitsOf} hits`);
    for (const h of hits.filter(h => h.kind === hitsOf)) console.log(`- ${h.run} t${h.turn}${h.code ? ' [code tail]' : ''}: ${h.text}`);
  }
}

if (process.argv[1]?.endsWith('review-counts.ts')) main();
