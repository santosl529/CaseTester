// Fact checks over every saved run (12 Oct; lib/orchestrator/fact-check.ts).
// Scores each interviewer turn and each candidate message of every run record
// under `Case Interview Runs/` against the case data that run revealed:
//   F1 false fact by the interviewer · F2 candidate misquote (uncorrected next
//   turn; carried into the recommendation) · F3 false refusal · F4 delivery
//   claim without delivery.
// Free. Prints coverage, rates by batch and model, and — with --known — recall
// against the known-fault list; with --blind, agreement with batch 20's grades.
//
//   npx tsx scripts/fact-check.ts                       summary
//   npx tsx scripts/fact-check.ts --flags               every flag (JSON lines)
//   npx tsx scripts/fact-check.ts --group=batch-20      one batch label prefix
//   npx tsx scripts/fact-check.ts --known=evals/known-fact-faults.json
//   npx tsx scripts/fact-check.ts --out=<file.jsonl>    write every flag
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadCorpus, type CorpusRun, type CorpusTurn } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';
import {
  buildFactBase, findFalseFacts, findCandidateMisquotes, findFalseRefusals, findUndeliveredClaims, findEchoes, echoesOf, type Echo,
  nameHits, sentencesOf, parseFig, figureFits, FIGURE, type FactBase,
} from '@/lib/orchestrator/fact-check';
import { asksRecommendationAsk } from '@/lib/orchestrator/spoken-close';
import { checkDataTurn } from '@/lib/eval/data-check';
import { checkMathTurn } from '@/lib/eval/math-check';
import { checkFlowRun } from '@/lib/eval/flow-check';
import { poolPattern } from '@/lib/orchestrator/phrasing';

export type Flag = {
  rule: 'F1' | 'F2-next' | 'F2-rec' | 'F3' | 'F4' | 'D1' | 'D3' | 'D6' | 'D7' | 'D9' | 'STAGE' | 'CLOSE' | 'LOOP';
  sub: string;
  run: string;
  group: string;
  model: string;
  t: number;              // the interviewer turn (F1/F3/F4), or the candidate turn (F2)
  author: string;
  items: string[];
  cited: string;
  sentence: string;
};

const ROOT = 'Case Interview Runs';
const fbCache = new Map<string, FactBase>();
const factBase = (caseId: string) => {
  if (!fbCache.has(caseId)) fbCache.set(caseId, buildFactBase(getCaseById(caseId) as never));
  return fbCache.get(caseId)!;
};

function isRecAsk(t: CorpusTurn): boolean {
  if (['rec_ask', 'time_warning', 'grace_ask'].includes(t.kind)) return true;
  if (t.move === 'recommendation') return true;
  return t.segments.some(s => s.kind !== 'data' && asksRecommendationAsk(s.text));
}

// Does this interviewer turn correct the misquote: code's correction line for
// the item, or the item's true figure stated without repeating the wrong one?
function corrects(t: CorpusTurn, fb: FactBase, items: string[], wrong: number | null): boolean {
  const all = t.segments.map(s => s.text).join(' ');
  if (wrong !== null && new RegExp(`(?<![\\d.])${String(wrong).replace('.', '\\.')}(?![\\d])`).test(all.replace(/\bnot\s+\$?\d+(?:\.\d+)?/gi, ''))) return false;
  for (const seg of t.segments) {
    if (poolPattern('correct_one', 'correct_two').test(seg.text) && (seg.ids?.some(i => items.includes(i)) || nameHits(seg.text, fb).some(h => h.quantities.some(q => items.includes(q.id))))) return true;
    for (const s of sentencesOf(seg.text)) {
      for (const h of nameHits(s, fb)) {
        const qs = h.quantities.filter(q => items.includes(q.id));
        if (!qs.length) continue;
        const near = s.slice(Math.max(0, h.start - 40), h.end + 60);
        for (const m of near.matchAll(new RegExp(FIGURE, 'gi'))) {
          const f = parseFig(m[0]);
          if (f && f.unit !== 'plain' && (figureFits(f, qs, 'level') || figureFits(f, qs, 'pointChange'))) return true;
        }
      }
    }
  }
  return false;
}
const wrongValue = (cited: string) => { const m = /(\d+(?:\.\d+)?)(?!.*\d)/.exec(cited); return m ? Number(m[1]) : null; };

export function checkRun(run: CorpusRun): Flag[] {
  const fb = factBase(run.caseId);
  const flags: Flag[] = [];
  const base = { run: run.id, group: run.group, model: run.model };
  const turns = run.turns.filter(t => !t.seeded);
  // Misquotes still standing (cited by the candidate, never corrected): their
  // figures, which the interviewer must not repeat as fact.
  let open: Echo[] = [];
  for (const [k, t] of turns.entries()) {
    const revealed = new Set([...t.revealedBefore, ...t.releasedNow]);
    const ctx = {
      revealed, exhibitShown: t.shownBefore.length > 0 || !!t.exhibitNow,
      // A correction line delivers the item's figure too ("Given the corrected figure, …").
      // A correction or a restatement ("As I mentioned: …") delivers its figures too.
      deliveredNow: t.releasedNow.length > 0 || !!t.exhibitNow || t.segments.some(s => poolPattern('correct_one', 'correct_two').test(s.text))
        || t.segments.some(s => s.kind === 'data' && poolPattern('earlier', 'restate').test(s.text)),
      deliveredPrev: false, refusedNow: t.segments.some(s => /\bI don't have\b/i.test(s.text) || poolPattern('refuse').test(s.text)),
      deferredNow: t.segments.some(s => s.kind === 'data' && (/\b(?:I'll share .* once we've settled|I can share .* if you'd like|Let's settle your structure before)\b/.test(s.text) || poolPattern('defer', 'gate_defer', 'offer', 'unmapped_defer').test(s.text))),
    };
    // F2 on the message this turn answers.
    const c = t.candidateText;
    const ms = c ? findCandidateMisquotes(c, fb, new Set(t.revealedBefore), t.shownBefore) : [];
    const prevI = k > 0 ? turns[k - 1] : undefined;
    const inRec = !!prevI && isRecAsk(prevI);
    for (const m of ms) {
      const corrected = corrects(t, fb, m.items, wrongValue(m.cited));
      if (!corrected) {
        flags.push({ ...base, rule: 'F2-next', sub: m.kind, t: t.t - 1, author: 'candidate', items: m.items, cited: m.cited, sentence: m.sentence });
        open.push(...echoesOf(m, fb));
      }
      if (inRec) flags.push({ ...base, rule: 'F2-rec', sub: m.kind, t: t.t - 1, author: 'candidate', items: m.items, cited: m.cited, sentence: m.sentence });
    }
    // A correction this turn closes the item's open echoes.
    open = open.filter(e => !corrects(t, fb, e.items, e.value));
    for (const seg of t.segments) {
      if (seg.kind !== 'data') {
        for (const f of findFalseFacts(seg.text, fb, revealed)) flags.push({ ...base, rule: 'F1', sub: f.rule, t: t.t, author: `${seg.kind}/${seg.author}`, items: f.items, cited: f.cited, sentence: f.sentence });
        for (const f of findEchoes(seg.text, open.filter(e => !ms.some(m => m.cited === e.cited)), fb)) flags.push({ ...base, rule: 'F1', sub: 'F1-echo', t: t.t, author: `${seg.kind}/${seg.author}`, items: f.items, cited: f.cited, sentence: f.sentence });
        for (const f of findUndeliveredClaims(seg.text, fb, ctx)) flags.push({ ...base, rule: 'F4', sub: f.why, t: t.t, author: `${seg.kind}/${seg.author}`, items: f.items, cited: f.claim, sentence: f.sentence });
      }
      for (const f of findFalseRefusals(seg.text, fb, revealed, { covers: true })) flags.push({ ...base, rule: 'F3', sub: 'refusal', t: t.t, author: `${seg.kind}/${seg.author}`, items: f.items, cited: f.refused, sentence: f.sentence });
    }
    for (const f of checkDataTurn(t, fb, { openBefore: t.openBefore })) flags.push({ ...base, rule: f.rule, sub: f.sub, t: t.t, author: 'turn', items: f.items, cited: f.sub, sentence: f.text });
    for (const m of checkMathTurn(t, getCaseById(run.caseId) as never)) if (!m.handled) flags.push({ ...base, rule: 'D6', sub: m.error.kind, t: t.t, author: 'candidate', items: [], cited: `${m.error.what}: ${m.error.stated} vs ${m.error.expected.join('/')}`, sentence: m.error.span });
  }
  for (const f of checkFlowRun(run, getCaseById(run.caseId) as never)) flags.push({ ...base, rule: f.rule, sub: f.sub, t: f.t, author: 'turn', items: [], cited: f.sub, sentence: f.text });
  return flags;
}

type Known = { run: string; t: number; rule: string; quote?: string; source: string; note?: string; scope?: 'in' | 'outside' };

// A known fault is caught when its run has a flag of the rule at the turn
// (F1/F3/F4: that interviewer turn; F2-next: a misquote flagged at or before
// that candidate turn; F2-rec: that candidate turn ±1).
export function caught(k: Known, flags: Flag[]): boolean {
  const own = flags.filter(f => f.run.includes(k.run) || f.run.endsWith(k.run.replace(/\.turns\.jsonl\.gz$/, '')));
  if (k.rule === 'F2-next') return own.some(f => f.rule === 'F2-next' && f.t <= k.t);
  if (k.rule === 'F2-rec') return own.some(f => f.rule === 'F2-rec' && Math.abs(f.t - k.t) <= 1);
  return own.some(f => f.rule === k.rule && f.t === k.t);
}

// The model screens (Case Interview Runs/replays/*/): single saved turns
// replayed through other models. Raw outputs (results JSON: say + question)
// get F1 and the model's own refusals; delivered text (the "> " lines of the
// delivery / replay review files) gets F1 and F3. No run state, so no F2/F4.
const REPLAY_KNOWN: { folder: string; needle: RegExp; rule: 'F1' | 'F3'; source: string; scope?: 'outside' }[] = [
  { folder: 'model-screen-qwen38', needle: /Average ticket is up 2\.1%/, rule: 'F1', source: 'qwen38 hand-review (Maya t7 run 2)' },
  { folder: 'model-screen-qwen38-low', needle: /beans are 42% of COGS/i, rule: 'F1', source: 'qwen38-low hand-review (Derek t10 run 1)' },
  { folder: 'model-screen-qwen38-low', needle: /other inputs[^.]{0,40}3 points of revenue/i, rule: 'F1', source: 'qwen38-low hand-review (Derek t10 run 1)' },
  { folder: 'model-screen-qwen38', needle: /I don't have a cost breakdown by line item for both years/, rule: 'F3', source: 'qwen38 hand-review (Connor t2 run 1)' },
  { folder: 'model-screen-gptoss-low', needle: /I don't have full cost breakdown/i, rule: 'F3', source: 'gptoss-low hand-review (Nikhil t2 run 1)' },
  { folder: 'model-screen-gptoss-low', needle: /I don't have framework for analysis/i, rule: 'F3', source: 'gptoss-low hand-review (Maya t7 run 1) — not case data; disputed', scope: 'outside' },
];

function replayTexts(dir: string): { where: string; text: string; delivered: boolean }[] {
  const out: { where: string; text: string; delivered: boolean }[] = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (/^replay-results-.*\.json$/.test(f)) {
      const items = JSON.parse(readFileSync(p, 'utf8')) as { id: string; runs?: Record<string, { turn?: { say?: string; question?: string } }[]> }[];
      for (const it of items) for (const [arm, runs] of Object.entries(it.runs ?? {})) runs.forEach((r, i) => {
        const t = [r.turn?.say, r.turn?.question].filter(Boolean).join(' ');
        if (t) out.push({ where: `${f} ${it.id} ${arm} run ${i + 1}`, text: t, delivered: false });
      });
    } else if (/\.md$/.test(f) && !/hand-review/.test(f)) {
      for (const [n, line] of readFileSync(p, 'utf8').split('\n').entries()) if (/^>\s/.test(line)) out.push({ where: `${f}:${n + 1}`, text: line.replace(/^>\s*/, ''), delivered: true });
    }
  }
  return out;
}

function replayMain(): void {
  const fb = factBase('prof-001');
  const root = path.join(ROOT, 'replays');
  const found: { folder: string; where: string; rule: string; text: string }[] = [];
  for (const day of readdirSync(root)) {
    if (!statSync(path.join(root, day)).isDirectory()) continue;
    for (const folder of readdirSync(path.join(root, day))) {
      const dir = path.join(root, day, folder);
      if (!statSync(dir).isDirectory()) continue;
      for (const x of replayTexts(dir)) {
        for (const f of findFalseFacts(x.text, fb)) found.push({ folder, where: x.where, rule: 'F1', text: `${f.cited} | ${f.sentence}` });
        for (const f of findFalseRefusals(x.text, fb, new Set(), { covers: true })) found.push({ folder, where: x.where, rule: 'F3', text: `${f.items.join(',')} | ${f.sentence}` });
      }
    }
  }
  for (const f of found) console.log(`${f.rule} ${f.folder} ${f.where.slice(0, 60)} | ${f.text.slice(0, 170)}`);
  console.log(`\nreplay screens: ${found.length} flags`);
  for (const k of REPLAY_KNOWN) {
    const hit = found.some(f => f.folder === k.folder && f.rule === k.rule && k.needle.test(f.text));
    console.log(`  ${hit ? 'caught' : 'MISS  '} ${k.rule} ${k.source}${k.scope ? ' (outside)' : ''}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--replays')) { replayMain(); return; }
  const arg = (k: string) => args.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  const group = arg('group');
  // --root: a mirror corpus from tests/replay/runner-corpus.replay.test.ts.
  const { runs: all, skipped } = loadCorpus(arg('root') ?? ROOT, id => getCaseById(id) as never);
  const runs = group ? all.filter(r => r.group.startsWith(group)) : all;
  const flags = runs.flatMap(checkRun);
  if (arg('out')) writeFileSync(arg('out')!, flags.map(f => JSON.stringify(f)).join('\n') + '\n');
  if (args.includes('--flags')) { for (const f of flags) console.log(JSON.stringify(f)); return; }

  console.log(`coverage: ${all.length} runs parsed (${all.filter(r => r.format === 'turn_file').length} turn files, ${all.filter(r => r.format === 'record').length} records), ${skipped.length} skipped`);
  for (const s of skipped) console.log(`  skipped ${s.path}: ${s.reason}`);
  const seeded = all.reduce((n, r) => n + r.turns.filter(t => t.seeded).length, 0);
  console.log(`  seeded turns excluded: ${seeded}`);

  // Rates per batch label and model.
  const rows = new Map<string, { runs: number; turns: number; c: Record<string, number> }>();
  for (const r of runs) {
    const key = `${r.group} · ${r.model}`;
    const row = rows.get(key) ?? { runs: 0, turns: 0, c: {} };
    row.runs++; row.turns += r.turns.filter(t => !t.seeded).length;
    rows.set(key, row);
  }
  // Counted once per turn and rule (a turn with two F1 sentences is one F1 turn).
  const perTurn = new Map<string, Flag>();
  for (const f of flags) perTurn.set(`${f.run}|${f.t}|${f.rule}`, f);
  for (const f of perTurn.values()) { const row = rows.get(`${f.group} · ${f.model}`)!; row.c[f.rule] = (row.c[f.rule] ?? 0) + 1; }
  const rules = ['F1', 'F2-next', 'F2-rec', 'F3', 'F4', 'D1', 'D3', 'D6', 'D7', 'D9', 'STAGE', 'CLOSE', 'LOOP'];
  console.log(`\n${'batch · model'.padEnd(46)} runs turns  ${rules.map(r => r.padStart(8)).join('')}   (turns flagged / per 100 turns)`);
  for (const [k, v] of [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    console.log(`${k.padEnd(46)} ${String(v.runs).padStart(4)} ${String(v.turns).padStart(5)}  ${rules.map(r => `${v.c[r] ?? 0}/${((100 * (v.c[r] ?? 0)) / Math.max(1, v.turns)).toFixed(1)}`.padStart(8)).join('')}`);
  }
  console.log(`\nflagged turns: ${rules.map(r => `${r} ${[...perTurn.values()].filter(f => f.rule === r).length}`).join(' · ')}`);

  const knownFile = arg('known');
  if (knownFile && existsSync(knownFile)) {
    const known = (JSON.parse(readFileSync(knownFile, 'utf8')) as Known[]).filter(k => !group || runs.some(r => r.id.includes(k.run)));
    console.log(`\nrecall against ${knownFile} (${known.length} known faults in scope of this run set):`);
    for (const scope of ['in', 'outside'] as const) {
      const ks = known.filter(k => (k.scope ?? 'in') === scope);
      if (!ks.length) continue;
      console.log(scope === 'in' ? '  within the detectors\' definitions:' : '  outside the definitions (premises, unanchored echoes, disputed) — reported, not counted:');
      for (const r of rules) {
        const kr = ks.filter(k => k.rule === r);
        if (!kr.length) continue;
        const misses = kr.filter(k => !caught(k, flags));
        console.log(`    ${r}: ${kr.length - misses.length}/${kr.length}`);
        for (const m of misses) console.log(`      MISS ${m.run} t${m.t} — ${m.quote ?? ''} (${m.source})${m.note ? ` — ${m.note}` : ''}`);
      }
    }
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('fact-check')) main();
