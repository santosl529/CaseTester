// Regression checks for moving a background classifier from Haiku 4.5 to 5.5
// (spec docs/superpowers/specs/2026-10-08-haiku-5-5-background-migration.md).
// Fixed inputs from saved runs — the interviewer is never called, so it cannot
// vary between arms. Each role is called through its production function with
// an explicit model (lib/models.ts backgroundRequest settings).
//
//   npx tsx scripts/eval-background.ts --role=<role> --models=<id>[:repeats],... --dry
//   LLM_BUDGET_USD=0.10 npx tsx --env-file=<env> scripts/eval-background.ts --role=<role> --models=... [--out=<dir>]
//
// Roles:
//   distress      every candidate message 4.5 labelled other than "none" plus a
//                 fixed sample of "none" (--limit), from batches 5–17; compared
//                 with 4.5's logged label (free baseline) and across repeats.
//   data_request  real exchanges (candidate + the interviewer's next turn), the
//                 production post-turn path; compared with 4.5's logged
//                 classification (count, explicit, ledger ids, response).
//   coverage      transcripts at 25% / 60% / 100% of fixed sessions; no logged
//                 per-turn baseline, so every model listed runs on them. Compared
//                 by the decisions coverage drives: all dimensions ≥ threshold
//                 (end gate) and which dimensions are below it (the steer).
//   hint_check    the hand-labelled set tests/fixtures/hint-check-labels.json.
// --dry prints item counts and an estimated cost (no calls, no budget needed).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { classifyDistress, buildDistressPrompt } from '@/lib/orchestrator/distress';
import { classifyDataRequests, buildDataRequestPrompt, type DetectedDataRequest } from '@/lib/orchestrator/data-requests';
import { checkHintDelivered, buildHintCheckPrompt } from '@/lib/orchestrator/hint-check';
import { assessCoverage, isCoverageComplete, COVERAGE_THRESHOLD, type CoverageScores } from '@/lib/scoring/coverage';
import { labelWithPeriod } from '@/lib/orchestrator/data-ledger';
import { getCaseById } from '@/lib/cases/loader';
import { costOf } from '@/lib/llm-pricing';
import { requireRunBudget } from '@/lib/llm-budget';
import type { LadderRung } from '@/lib/orchestrator/stall';

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ROLE = arg('role');
const MODELS = (arg('models') ?? 'claude-haiku-5-5:2').split(',').map(m => { const [id, n] = m.split(':'); return { id, repeats: Number(n ?? 1) }; });
const DRY = process.argv.includes('--dry');
const LIMIT = Number(arg('limit') ?? 0);
const OUT = arg('out');
const CONCURRENCY = 6;

const RUNS = 'Case Interview Runs/test runs';
const catalog = getCaseById('prof-001').dataLedger.map(d => ({ id: d.id, label: labelWithPeriod(d) }));

type Turn = { turnIndex: number; role: string; text: string };
type Ev = { category: string; subtype: string; turnIndex: number | null; payloadJsonb: Record<string, unknown> };
type Run = { dir: string; batch: string; turns: Turn[]; events: Ev[]; session: { caseId: string } };

// Saved runs, newest prompts first. Prefix replays reuse scripted lines, so
// only their first copy of a candidate text is kept (dedupe by text).
function loadRuns(batchFilter: (b: string) => boolean): Run[] {
  const out: Run[] = [];
  for (const batch of readdirSync(RUNS).filter(batchFilter).sort()) {
    const bd = path.join(RUNS, batch);
    if (!statSync(bd).isDirectory()) continue;
    for (const dir of readdirSync(bd)) {
      const d = path.join(bd, dir);
      if (!statSync(d).isDirectory()) continue;
      const f = readdirSync(d).find(x => x.endsWith('.json'));
      if (!f) continue;
      const j = JSON.parse(readFileSync(path.join(d, f), 'utf8')) as Run;
      if (j.session?.caseId !== 'prof-001') continue;
      out.push({ ...j, dir: `${batch}/${dir}`, batch, turns: [...j.turns].sort((a, b) => a.turnIndex - b.turnIndex) });
    }
  }
  return out;
}
const batchNo = (b: string) => Number(b.match(/^batch-(\d+)/)?.[1] ?? 0);

// Deterministic spread sample.
function spread<T>(xs: T[], n: number): T[] {
  if (!n || xs.length <= n) return xs;
  const step = xs.length / n;
  return Array.from({ length: n }, (_, i) => xs[Math.floor(i * step)]);
}

async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

// ---- items per role ----
type Item = { id: string; promptChars: number; outTokens: number; call: (model: string) => Promise<unknown>; baseline?: unknown; context?: string };

function distressItems(): Item[] {
  const runs = loadRuns(b => (batchNo(b) >= 5) || b.startsWith('prefix') || b.startsWith('smoke'));
  const seen = new Set<string>();
  const rows: { id: string; text: string; label: string }[] = [];
  for (const r of runs) for (const e of r.events) {
    if (e.subtype !== 'conduct_model') continue;
    const label = (e.payloadJsonb.detail as { label?: string } | undefined)?.label;
    const text = r.turns.find(t => t.turnIndex === e.turnIndex && t.role === 'candidate')?.text;
    if (!label || !text || seen.has(text)) continue;
    seen.add(text);
    rows.push({ id: `${r.dir}@t${e.turnIndex}`, text, label });
  }
  const flagged = rows.filter(x => x.label !== 'none');
  const none = spread(rows.filter(x => x.label === 'none'), LIMIT || 250);
  return [...flagged, ...none].map(x => ({
    id: x.id, promptChars: buildDistressPrompt(x.text).length, outTokens: 40, baseline: x.label, context: x.text,
    call: async model => (await classifyDistress({ candidateText: x.text, model }))?.label ?? null,
  }));
}

type Classified = { count: number; explicit: boolean; ids: string[]; responses: string[] };
const summarize = (rs: { ledgerItemIds: string[]; explicit: boolean; response?: string }[]): Classified => ({
  count: rs.length, explicit: rs.some(r => r.explicit),
  ids: [...new Set(rs.flatMap(r => r.ledgerItemIds))].sort(),
  responses: rs.map(r => `${[...r.ledgerItemIds].sort().join('+') || '∅'}:${r.response}`).sort(),
});

function dataRequestItems(): Item[] {
  const runs = loadRuns(b => batchNo(b) >= 12 && !b.includes('cerebras'));
  const rows: Item[] = [];
  for (const r of runs) {
    const markers = r.events.filter(e => e.category === 'data_request' && e.subtype === 'classified');
    for (const m of markers) {
      const cand = r.turns.find(t => t.turnIndex === m.turnIndex && t.role === 'candidate');
      const intv = r.turns.find(t => t.turnIndex === (m.payloadJsonb.interviewerTurnIndex as number) && t.role === 'interviewer');
      if (!cand || !intv) continue;
      const logged = r.events.filter(e => e.category === 'data_request' && e.subtype !== 'classified' && e.turnIndex === m.turnIndex)
        .map(e => ({ ledgerItemIds: (e.payloadJsonb.ledgerItemIds as string[]) ?? [], explicit: !!e.payloadJsonb.explicit, response: e.subtype }));
      rows.push({
        id: `${r.dir}@t${m.turnIndex}`,
        promptChars: buildDataRequestPrompt(cand.text, intv.text, catalog).length, outTokens: 160,
        baseline: summarize(logged), context: `CANDIDATE: ${cand.text}\nINTERVIEWER: ${intv.text}`,
        call: async model => {
          const rs: DetectedDataRequest[] | null = await classifyDataRequests({ candidateText: cand.text, interviewerText: intv.text, catalog, model });
          return rs ? summarize(rs) : null;
        },
      });
    }
  }
  // Half with requests, half without, spread over runs.
  const n = LIMIT || 80;
  const withReq = rows.filter(x => (x.baseline as Classified).count > 0), without = rows.filter(x => (x.baseline as Classified).count === 0);
  return [...spread(withReq, Math.ceil(n / 2)), ...spread(without, Math.floor(n / 2))];
}

function coverageItems(): Item[] {
  const runs = spread(loadRuns(b => batchNo(b) >= 12 && batchNo(b) <= 14), LIMIT || 8);
  return runs.flatMap(r => [0.25, 0.6, 1].map(frac => {
    const upto = r.turns.slice(0, Math.max(2, Math.round(r.turns.length * frac)));
    const transcript = upto.map(t => ({ role: t.role, text: t.text }));
    return {
      id: `${r.dir}@${Math.round(frac * 100)}%`, outTokens: 90,
      promptChars: 2600 + transcript.reduce((n, t) => n + t.text.length + 20, 0),
      call: async (model: string) => assessCoverage(transcript, undefined, model),
    };
  }));
}

function hintItems(): Item[] {
  const set = JSON.parse(readFileSync('tests/fixtures/hint-check-labels.json', 'utf8')) as { items: { id: string; rung: LadderRung; candidateText: string; interviewerText: string; hint: boolean }[] };
  return set.items.map(x => ({
    id: x.id, baseline: x.hint, outTokens: 30, context: `CANDIDATE: ${x.candidateText}\nINTERVIEWER: ${x.interviewerText}`,
    promptChars: buildHintCheckPrompt(x.rung, x.candidateText, x.interviewerText).length,
    call: async model => (await checkHintDelivered({ rung: x.rung, candidateText: x.candidateText, interviewerText: x.interviewerText, model }))?.hint ?? null,
  }));
}

// ---- reports ----
const below = (c: CoverageScores | null) => c ? Object.entries(c).filter(([, v]) => (v as number) < COVERAGE_THRESHOLD).map(([k]) => k).sort().join(',') : 'ERROR';

function report(items: Item[], results: Record<string, unknown[][]>) {
  const ids = Object.keys(results);
  for (const m of ids) {
    const runs = results[m];
    const errors = runs.flat().filter(x => x === null).length;
    console.log(`\n[${m}] ${runs.length} items × ${runs[0]?.length ?? 0} · no verdict / error ${errors}`);
  }
  if (ROLE === 'distress' || ROLE === 'hint_check') {
    const flagOf = (v: unknown) => ROLE === 'distress' ? (v === 'distress' || v === 'risk_to_self') : v === true;
    for (const m of ids) {
      const rs = results[m];
      let agree = 0, extra = 0, missed = 0, labelDiff = 0, unstable = 0;
      rs.forEach((reps, i) => {
        const base = items[i].baseline;
        if (new Set(reps.map(String)).size > 1) unstable++;
        for (const v of reps) {
          if (v === base) agree++; else labelDiff++;
          if (v !== null && flagOf(v) && !flagOf(base)) extra++;
          if (v !== null && !flagOf(v) && flagOf(base)) missed++;
        }
      });
      const n = rs.length * (rs[0]?.length ?? 1);
      const what = ROLE === 'distress' ? 'vs 4.5 logged label' : 'vs hand label';
      console.log(`  [${m}] ${what}: same ${agree}/${n} · ${ROLE === 'distress' ? 'fires where 4.5 did not' : 'false "hint" (ladder advances wrongly)'} ${extra} · ${ROLE === 'distress' ? 'misses 4.5\'s fire' : 'false "no hint"'} ${missed} · any label difference ${labelDiff} · items unstable across repeats ${unstable}`);
      rs.forEach((reps, i) => { if (reps.some(v => v !== items[i].baseline)) console.log(`    ${items[i].id}: base ${items[i].baseline} got ${reps.join('/')} — ${String(items[i].context).slice(0, 220).replace(/\s+/g, ' ')}`); });
    }
  }
  if (ROLE === 'data_request') {
    for (const m of ids) {
      const rs = results[m] as (Classified | null)[][];
      const tally = { count: 0, explicit: 0, ids: 0, responses: 0, n: 0, unstable: 0 };
      rs.forEach((reps, i) => {
        const b = items[i].baseline as Classified;
        if (new Set(reps.map(r => JSON.stringify(r))).size > 1) tally.unstable++;
        for (const r of reps) {
          if (!r) continue;
          tally.n++;
          if (r.count === b.count) tally.count++;
          if (r.explicit === b.explicit) tally.explicit++;
          if (r.ids.join() === b.ids.join()) tally.ids++;
          if (r.responses.join() === b.responses.join()) tally.responses++;
        }
      });
      console.log(`  [${m}] vs 4.5 logged, of ${tally.n}: same request count ${tally.count} · same "any explicit ask" ${tally.explicit} · same ledger ids ${tally.ids} · same ids+responses ${tally.responses} · items unstable across repeats ${tally.unstable}`);
      rs.forEach((reps, i) => {
        const b = items[i].baseline as Classified;
        const diff = reps.filter(r => r && (r.explicit !== b.explicit || r.ids.join() !== b.ids.join()));
        if (diff.length) console.log(`    ${items[i].id}: 4.5 ${JSON.stringify(b)} · ${m} ${diff.map(r => JSON.stringify(r)).join(' | ')}\n      ${String(items[i].context).slice(0, 300).replace(/\s+/g, ' ')}`);
      });
    }
  }
  if (ROLE === 'coverage') {
    const [a, ...rest] = ids;
    const scoresOf = (m: string, i: number) => results[m][i] as (CoverageScores | null)[];
    for (const m of ids) {
      const unstable = items.filter((_, i) => new Set(scoresOf(m, i).map(below)).size > 1).length;
      const spreadPts = items.flatMap((_, i) => { const s = scoresOf(m, i).filter(Boolean) as CoverageScores[]; return s.length > 1 ? Object.keys(s[0]).map(k => Math.abs((s[0] as Record<string, number>)[k] - (s[1] as Record<string, number>)[k])) : []; });
      console.log(`  [${m}] below-threshold set changes across its own repeats on ${unstable}/${items.length} points · repeat |Δ| median ${pct(spreadPts, 0.5)} p90 ${pct(spreadPts, 0.9)}`);
    }
    for (const m of rest) {
      let gate = 0, steer = 0; const deltas: number[] = [];
      items.forEach((it, i) => {
        const x = scoresOf(a, i)[0], ys = scoresOf(m, i);
        for (const y of ys) {
          if (!x || !y) continue;
          if (isCoverageComplete(x) === isCoverageComplete(y)) gate++;
          if (below(x) === below(y)) steer++;
          for (const k of Object.keys(x)) deltas.push(Math.abs((x as Record<string, number>)[k] - ((y as Record<string, number>)[k] ?? 0)));
        }
        console.log(`    ${it.id}: ${a} below [${below(x)}] · ${m} below ${ys.map(y => `[${below(y)}]`).join(' ')}`);
      });
      const n = items.length * (results[m][0]?.length ?? 1);
      console.log(`  [${m}] vs ${a}: same end-gate decision ${gate}/${n} · same below-threshold set (steer) ${steer}/${n} · per-dimension |Δ| median ${pct(deltas, 0.5)} p90 ${pct(deltas, 0.9)}`);
    }
  }
}

async function main() {
  const build = { distress: distressItems, data_request: dataRequestItems, coverage: coverageItems, hint_check: hintItems }[ROLE as string];
  if (!build) throw new Error('--role=distress|data_request|coverage|hint_check');
  const items = build();
  const est = MODELS.reduce((sum, m) => sum + items.reduce((s, it) => {
    const tokIn = (it.promptChars / 4) * (m.id === 'claude-haiku-5-5' ? 1.35 : 1);
    return s + m.repeats * costOf({ model: m.id, inputTokens: Math.round(tokIn), outputTokens: it.outTokens });
  }, 0), 0);
  console.log(`${ROLE}: ${items.length} items · ${MODELS.map(m => `${m.id}×${m.repeats}`).join(', ')} · estimated $${est.toFixed(3)} (chars/4 tokens, ×1.35 for Haiku 5.5)`);
  if (DRY) return;
  const budget = requireRunBudget(`eval-background ${ROLE}`);
  const results: Record<string, unknown[][]> = {};
  const latencies: Record<string, number[]> = {};
  for (const m of MODELS) {
    latencies[m.id] = [];
    results[m.id] = await pool(items, async it => {
      const reps: unknown[] = [];
      for (let r = 0; r < m.repeats; r++) {
        const t0 = Date.now();
        try { reps.push(await it.call(m.id)); } catch (err) { console.error(`  ${it.id}: ${err instanceof Error ? err.message : err}`); reps.push(null); if (budget.exceeded) throw err; }
        latencies[m.id].push(Date.now() - t0);
      }
      return reps;
    });
    console.log(`[${m.id}] latency median ${pct(latencies[m.id], 0.5)}ms p90 ${pct(latencies[m.id], 0.9)}ms max ${Math.max(...latencies[m.id])}ms`);
  }
  report(items, results);
  console.log(`\n[budget] ${budget.summary()}`);
  if (OUT) {
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, `${ROLE}.json`), JSON.stringify({ role: ROLE, models: MODELS, latencies, items: items.map((it, i) => ({ id: it.id, baseline: it.baseline, results: Object.fromEntries(Object.entries(results).map(([m, r]) => [m, r[i]])) })) }, null, 1));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
