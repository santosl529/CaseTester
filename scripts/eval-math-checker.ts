// Evaluation of the background math checker (math checker step 2, 13 Oct).
// Each labelled candidate message (evals/math-checker-labels.json, built by
// scripts/build-math-labels.ts) is checked by each arm with the case, what had
// been revealed, the transcript before it and the message — exactly the live
// input — and the verdicts are vetted for FR-4 as live. Fixed inputs from
// saved runs: the interviewer is never called.
//
//   npx tsx scripts/eval-math-checker.ts --dry [--arms=sonnet55-medium,opus55-medium] [--set=all|recall|precision] [--limit=N]
//   ... --ids=<file>   only the label ids listed (one per line)
//   npx tsx scripts/eval-math-checker.ts --revet=<a.jsonl>[,<b.jsonl>]   $0: re-vet recorded
//       verdicts under the current vetting rules (a later file wins for the same id)
//   LLM_BUDGET_USD=<cap> npx tsx --env-file=<main checkout>/.env.local scripts/eval-math-checker.ts --out=<dir> [...]
//
// Reports per arm (the pick order of the brief):
//   1. false flags per 100 candidate claims, every one listed — a flag on a
//      precision message, or on a figure a recall message has right
//      (mustNotFlag);
//   2. recall: recall messages whose labelled wrong claim was flagged (the
//      claim's figure in the flagged span), borderline ones apart;
//   3. latency median / p90, and on replies to a recommendation ask;
//   4. cost per call and per interview (mean gated messages per batch-21 run);
//   plus agreement with the scoring judge's math verdicts where the run was
//   scored (a flagged / unflagged claim quoted in the judge's quantitative
//   needsWork / wentWell).
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus, type CorpusRun } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import { mathCheckerConfig, type MathCheckerConfig } from '@/lib/models';
import { costOf, assertPriced } from '@/lib/llm-pricing';
import { requireRunBudget, BudgetExceededError } from '@/lib/llm-budget';
import { asksRecommendationAsk } from '@/lib/orchestrator/spoken-close';
import {
  buildCheckerSystem, buildCheckerUser, checkMathClaims, vetCheckerClaims, statesQuantitativeClaim,
  type CheckerClaim, type CheckerInput, type CheckerTurn, type VettedClaim,
} from '@/lib/orchestrator/math-checker';
import type { MathLabel } from './build-math-labels';
import type { LlmUsage } from '@/lib/llm-usage';

const ROOT = 'Case Interview Runs';
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const DRY = process.argv.includes('--dry');
const ARMS = (arg('arms') ?? 'sonnet55-medium,opus55-medium').split(',');
const SET = arg('set') ?? 'all';
const LIMIT = Number(arg('limit') ?? 0);
const OUT = arg('out');
const CONCURRENCY = Number(arg('concurrency') ?? 6);
// --ids=<file>: only these label ids (one per line), e.g. a rerun of chosen messages.
// --revet=<files>: recorded verdicts (an earlier run's jsonl), re-vetted — no calls.
const REVET = arg('revet')?.split(',') ?? null;
type Recorded = { id: string; latencyMs: number; usd: number; model: string; error?: string; claims: Partial<CheckerClaim>[] };
const recorded = REVET ? new Map(REVET.flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Recorded)).map(r => [r.id, r])) : null;
const IDS = recorded ? new Set(recorded.keys()) : arg('ids') ? new Set(readFileSync(arg('ids')!, 'utf8').split('\n').map(x => x.trim()).filter(Boolean)) : null;
// Output tokens per call for the estimate: adaptive thinking at medium plus
// the JSON (≈150 tokens a claim). No measured figure yet — the paid run
// replaces it; an assumption, stated in the report.
const EST_OUT_TOKENS: Record<string, number> = { 'claude-sonnet-5-5': 2500, 'claude-opus-5-5': 3000 };

type Item = {
  label: MathLabel; run: CorpusRun; input: CheckerInput; recTurn: boolean;
  judge: { wrong: string[]; right: string[] } | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

function isRecAsk(t: CorpusRun['turns'][number] | undefined): boolean {
  if (!t) return false;
  if (['rec_ask', 'time_warning', 'grace_ask', 'rec_revision', 'rec_math_probe'].includes(t.kind)) return true;
  return t.move === 'recommendation' || asksRecommendationAsk(t.heard);
}

// The scoring judge's quantitative verdicts, when the run was scored.
function judgeQuotes(run: CorpusRun): Item['judge'] {
  const file = path.join(ROOT, `${run.id}.json`);
  if (!existsSync(file)) return null;
  const q = (JSON.parse(readFileSync(file, 'utf8')) as { score?: { rubricJsonb?: { quantitative?: { wentWell?: { quotes: string[] }[]; needsWork?: { quotes: string[] }[] } } } }).score?.rubricJsonb?.quantitative;
  if (!q) return null;
  return { wrong: (q.needsWork ?? []).flatMap(x => x.quotes).map(norm), right: (q.wentWell ?? []).flatMap(x => x.quotes).map(norm) };
}

function buildItems(): Item[] {
  const labels = (JSON.parse(readFileSync('evals/math-checker-labels.json', 'utf8')) as MathLabel[])
    .filter(l => SET === 'all' || (SET === 'recall' ? l.label === 'error' : l.label === 'correct'))
    .filter(l => !IDS || IDS.has(l.id));
  if (IDS) for (const id of IDS) if (!labels.some(l => l.id === id)) throw new Error(`--ids: no label ${id}`);
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const byId = new Map(runs.map(r => [r.id, r]));
  const items = labels.map(label => {
    const run = byId.get(label.run);
    if (!run) throw new Error(`${label.id}: run not in corpus`);
    const turns = [...run.turns].sort((a, b) => a.t - b.t);
    const at = turns.findIndex(x => x.t === label.t);
    const caseData = getCaseById(run.caseId);
    const transcript: CheckerTurn[] = [{ role: 'interviewer', text: caseData.prompt }];
    for (const u of turns.slice(0, at)) {
      if (u.candidateText) transcript.push({ role: 'candidate', text: u.candidateText });
      if (u.heard) transcript.push({ role: 'interviewer', text: u.heard });
    }
    const t = turns[at];
    return {
      label, run, recTurn: isRecAsk(turns[at - 1]), judge: judgeQuotes(run),
      input: { revealedIds: t.revealedBefore, shownExhibitIds: t.shownBefore, transcript, message: t.candidateText },
    };
  });
  // With --ids, in the file's order: a capped run spends on the first ones first.
  if (IDS) { const order = [...IDS]; items.sort((a, b) => order.indexOf(a.label.id) - order.indexOf(b.label.id)); }
  return LIMIT ? items.slice(0, LIMIT) : items;
}

// Mean candidate messages through the gate per interview, batch 21 (the
// current interviewer): the per-interview cost multiplier.
function gatedPerInterview(): number {
  const { runs } = loadCorpus(ROOT, id => getCaseById(id) as never);
  const b21 = runs.filter(r => r.group.startsWith('batch-21'));
  const n = b21.map(r => r.turns.filter(t => !t.seeded && t.candidateText && statesQuantitativeClaim(t.candidateText)).length);
  return n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
}

function estimate(items: Item[], cfg: MathCheckerConfig): number {
  const seen = new Set<string>();
  return items.reduce((sum, it) => {
    const sys = Math.round(buildCheckerSystem(getCaseById(it.run.caseId)).length / 4);
    const user = Math.round(buildCheckerUser(getCaseById(it.run.caseId), it.input).length / 4);
    // The system prompt is cached per case: the first call writes it, the rest read it.
    const first = !seen.has(it.run.caseId); seen.add(it.run.caseId);
    return sum + costOf({ model: cfg.model, inputTokens: user, outputTokens: EST_OUT_TOKENS[cfg.model] ?? 3000, cacheWriteTokens: first ? sys : 0, cacheReadTokens: first ? 0 : sys });
  }, 0);
}

// A flagged claim is the labelled wrong claim when its span or figure carries
// one of the label's figures.
const mentions = (c: VettedClaim, needles: string[] | undefined) => (needles ?? []).some(n => norm(`${c.span} ${c.candidateValue}`).includes(norm(n)));

type Outcome = { item: Item; claims: VettedClaim[]; latencyMs: number; usd: number; model: string; error?: string };

function report(arm: string, outs: Outcome[], perInterview: number) {
  const ok = outs.filter(o => !o.error);
  const claims = ok.flatMap(o => o.claims.map(c => ({ o, c })));
  const flagged = claims.filter(x => x.c.flag);
  const falseFlags = flagged.filter(({ o, c }) => (o.item.label.label === 'correct' && !mentions(c, o.item.label.match))
    || (mentions(c, o.item.label.mustNotFlag) && !mentions(c, o.item.label.match)));
  const recall = ok.filter(o => o.item.label.label === 'error');
  const hit = (o: Outcome) => o.claims.some(c => c.flag && mentions(c, o.item.label.match));
  const firm = recall.filter(o => !o.item.label.borderline);
  const borderline = recall.filter(o => o.item.label.borderline);
  const otherOnRecall = recall.flatMap(o => o.claims.filter(c => c.flag && !mentions(c, o.item.label.match) && !mentions(c, o.item.label.mustNotFlag)).map(c => ({ o, c })));
  const lat = ok.map(o => o.latencyMs);
  const recLat = ok.filter(o => o.item.recTurn).map(o => o.latencyMs);
  const usd = ok.reduce((s, o) => s + o.usd, 0);
  console.log(`\n=== ${arm} (${ok[0]?.model ?? '?'}) — ${ok.length}/${outs.length} messages answered${outs.length - ok.length ? `, ${outs.length - ok.length} failed` : ''}`);
  console.log(`claims ${claims.length} · flagged ${flagged.length}`);
  console.log(`1. false flags ${falseFlags.length} → ${(100 * falseFlags.length / Math.max(1, claims.length)).toFixed(2)} per 100 claims`);
  for (const { o, c } of falseFlags) console.log(`   FALSE? ${o.item.label.id} [${c.errorType}/${c.confidence}] "${c.span}" → ${c.correctValue ?? `${c.correctLow}–${c.correctHigh}`} (${c.derivation.slice(0, 160)})`);
  console.log(`2. recall ${firm.filter(hit).length}/${firm.length} firm · ${borderline.filter(hit).length}/${borderline.length} borderline · any flag in the message ${recall.filter(o => o.claims.some(c => c.flag)).length}/${recall.length}`);
  for (const o of firm.filter(x => !hit(x))) console.log(`   MISS ${o.item.label.id}: ${o.item.label.claim}`);
  console.log(`   other flags on recall messages (read: a real second error, or false): ${otherOnRecall.length}`);
  for (const { o, c } of otherOnRecall) console.log(`   OTHER ${o.item.label.id} [${c.errorType}/${c.confidence}] "${c.span}"`);
  console.log(`3. latency median ${pct(lat, 0.5)}ms p90 ${pct(lat, 0.9)}ms · replies to a recommendation ask (${recLat.length}): median ${pct(recLat, 0.5)}ms p90 ${pct(recLat, 0.9)}ms`);
  console.log(`4. cost $${usd.toFixed(3)} for ${ok.length} calls → $${(usd / Math.max(1, ok.length)).toFixed(4)} a call → ≈$${(perInterview * usd / Math.max(1, ok.length)).toFixed(3)} an interview (${perInterview.toFixed(1)} gated messages)`);
  const judged = claims.filter(({ o }) => o.item.judge).map(({ o, c }) => {
    const s = norm(c.span);
    const inQuote = (qs: string[]) => qs.some(q => q.includes(s.slice(0, 60)) || s.includes(q.slice(0, 60)));
    return { flag: c.flag, judge: inQuote(o.item.judge!.wrong) ? 'wrong' : inQuote(o.item.judge!.right) ? 'right' : null };
  }).filter(x => x.judge);
  const agree = judged.filter(x => (x.judge === 'wrong') === x.flag).length;
  console.log(`5. agreement with the scoring judge (claims quoted in its quantitative verdicts): ${judged.length ? `${agree}/${judged.length}` : 'none in this set'}`);
  const vet = ok.flatMap(o => o.claims.filter(c => c.flag)).map(c => c.vetNotes).flat();
  console.log(`FR-4 vetting: ${flagged.filter(x => x.c.correctionLine).length} code-written corrections, ${vet.filter(n => n.startsWith('correction withheld')).length} withheld (provenance/truth), ${flagged.filter(x => x.c.pointerLine).length} pointer probes kept, ${vet.filter(n => n.startsWith('pointer dropped')).length} dropped, ${vet.filter(n => n.startsWith('probe withheld')).length} probes replaced`);
  // Every line that would go out, for reading.
  for (const { o, c } of flagged) {
    console.log(`   LINES ${o.item.label.id} [${o.item.label.label}] "${c.span}" (${c.codeQuantity.kind}${c.codeQuantity.stepId ? ` ${c.codeQuantity.stepId}` : ''}${c.codeQuantity.price !== null ? ` price ${c.codeQuantity.price}` : ''}${c.codeQuantity.target !== null ? ` target ${c.codeQuantity.target}` : ''})`);
    console.log(`      probe: ${c.probeLine}`);
    if (c.correctionLine) console.log(`      correction (code): ${c.correctionLine}`);
    if (c.pointerLine) console.log(`      pointer: ${c.pointerLine}`);
    for (const n of c.vetNotes) console.log(`      · ${n}`);
  }
  for (const { o, c } of claims.filter(x => !x.c.flag && x.c.vetNotes.length)) console.log(`   DROPPED ${o.item.label.id} [${o.item.label.label}] "${c.span}": ${c.vetNotes.join('; ')}`);
}

async function main() {
  const items = buildItems();
  const perInterview = gatedPerInterview();
  const cfgs = ARMS.map(a => ({ arm: a, cfg: mathCheckerConfig(a) }));
  const recall = items.filter(i => i.label.label === 'error').length;
  console.log(`${items.length} labelled messages (${recall} recall, ${items.length - recall} precision; ${items.filter(i => i.recTurn).length} replies to a recommendation ask; ${items.filter(i => i.judge).length} from scored runs) · ${perInterview.toFixed(1)} gated messages per batch-21 interview`);
  let total = 0;
  for (const { arm, cfg } of cfgs) {
    const est = estimate(items, cfg);
    total += est;
    console.log(`  ${arm} (${cfg.model}, effort ${cfg.effort}): estimated $${est.toFixed(2)} — ≈$${(est / items.length).toFixed(4)} a message, ≈$${(perInterview * est / items.length).toFixed(3)} an interview (chars/4 tokens; ${EST_OUT_TOKENS[cfg.model]} output tokens a call assumed; system prompt cached per case)`);
  }
  console.log(`  total estimated $${total.toFixed(2)}`);
  if (DRY) return;
  if (recorded) {
    // Recorded before a field existed: its neutral value.
    const asClaim = (c: Partial<CheckerClaim>): CheckerClaim => ({
      pointer: '', actualShare: null, codeQuantity: { kind: 'none', stepId: null, price: null, target: null }, ...c,
    } as CheckerClaim);
    const outs: Outcome[] = items.map(item => {
      const r = recorded.get(item.label.id)!;
      const caseData = getCaseById(item.run.caseId);
      const claims = vetCheckerClaims(r.claims.map(asClaim), {
        caseData, revealedIds: item.input.revealedIds, shownExhibitIds: item.input.shownExhibitIds,
        candidateTexts: [...item.input.transcript.filter(t => t.role === 'candidate').map(t => t.text), item.input.message],
      });
      return { item, claims, latencyMs: r.latencyMs, usd: r.usd, model: r.model, error: r.error };
    });
    report(`revet (${REVET!.join(', ')})`, outs, perInterview);
    return;
  }
  cfgs.forEach(c => assertPriced(c.cfg.model));
  const budget = requireRunBudget('eval-math-checker');
  if (OUT && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  for (const { arm, cfg } of cfgs) {
    const outs: Outcome[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const k = next++;
        const item = items[k];
        const caseData = getCaseById(item.run.caseId);
        let usd = 0;
        const onUsage = (u: LlmUsage) => { usd += costOf(u); };
        try {
          const r = await checkMathClaims({ caseData, input: item.input, config: cfg, onUsage });
          const claims = vetCheckerClaims(r.claims, {
            caseData, revealedIds: item.input.revealedIds, shownExhibitIds: item.input.shownExhibitIds,
            candidateTexts: [...item.input.transcript.filter(t => t.role === 'candidate').map(t => t.text), item.input.message],
          });
          outs[k] = { item, claims, latencyMs: r.latencyMs, usd, model: r.model };
        } catch (err) {
          outs[k] = { item, claims: [], latencyMs: 0, usd, model: cfg.model, error: err instanceof Error ? err.message : String(err) };
          console.error(`  ${arm} ${item.label.id}: ${outs[k].error}`);
          if (err instanceof BudgetExceededError || budget.exceeded) throw err;
        }
        if (OUT) appendFileSync(path.join(OUT, `${arm}.jsonl`), JSON.stringify({ id: item.label.id, label: item.label.label, recTurn: item.recTurn, latencyMs: outs[k].latencyMs, usd: outs[k].usd, model: outs[k].model, error: outs[k].error, claims: outs[k].claims }) + '\n');
      }
    }));
    report(arm, outs, perInterview);
  }
  console.log(`\n[budget] ${budget.summary()}`);
  if (OUT) writeFileSync(path.join(OUT, 'README.txt'), `eval-math-checker ${new Date().toISOString()} arms=${ARMS.join(',')} set=${SET} items=${items.length}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
