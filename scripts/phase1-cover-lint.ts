// The Phase 1 cover lint (contract §5 Stream 2 Task 2, docs/superpowers/plans/2026-10-22-phase1-contract.md;
// Lorenzo: "Cover lint (a script): flag any phrase on two items; run every new or changed cover against every
// candidate ask in batches 28–38; list what each newly matches. Put everything you weren't sure about in a
// separate list."; his ruling to Stream 2, 22 Oct: "Run the cover lint on the MERGED view — the base case plus
// the overlay, as loaded through applyPhase1Overlay with itemCovers on … Collisions and new matches must be
// counted against the base covers too"). Free and deterministic: no model calls. Per case:
//   (1) every phrase, folded as a tagged case folds it, on two items' covers in the merged view (base covers
//       plus the overlay's) — "at BASE" when the same items shared it with itemCovers off, else "new";
//   (2) every ask in the case's b28–b38 runs whose coverage (fact-check.ts coverageDetail) changes from
//       itemCovers off to on: each model-declared request (`requests[].what`, read with the candidate's asking
//       sentence the engine picks, turn-data.ts askSentenceFor, on a tagged case) and each candidate asking or question
//       sentence (request-signal.ts askingSentences) taken as the ask — with the items it gains, the overlay
//       phrases that brought each, the model's own mapping, tagsAgree's verdict, and whether one of the item's
//       coverExcludes words is in the ask. Nothing in today's matching reads coverExcludes (fact-check.ts is
//       Stream 4's), so a gain an exclusion word would block is still a gain here;
//   (3) the gains not judged by hand ("answers" / "wrong") in the judgements file: the unsure list;
//   (4) the count per overlay cover;
//   (5) item tags against the case-level tags (an item in an entity's items has that entity; an item in
//       `forecast` has the forecast period), and what the overlay leaves out (tags, askPhrases, covers under 10,
//       exhibit summaries).
// prof-001 is untagged: its views are read twice, as itemCovers alone (literal matching) and with tagMatching
// on in both (the fold, the entity gate) — the wave runs it with both.
//
//   npx tsx scripts/phase1-cover-lint.ts [--runs <test runs dir>] [--out <dir>] [--case <id>] [--judgements <file.json>]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { buildFactBase, coverageDetail, coverPhraseSpans, sentencesOf, type FactBase } from '@/lib/orchestrator/fact-check';
import { tagsAgree } from '@/lib/orchestrator/item-tags';
import { askingSentences, properNames } from '@/lib/orchestrator/request-signal';
import { askSentenceFor } from '@/lib/orchestrator/turn-data';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { CaseSchema, type Case } from '@/lib/cases/schema';
import { Phase1OverlaySchema, applyPhase1Overlay, type Phase1Overlay } from '@/lib/cases/phase1-overlay';
import type { EngineSwitch } from '@/lib/cases/engine-switches';
import { duplicatePhrases, type Duplicate } from './cover-lint';

const RUNS = '/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs/test runs';
const OUT = '/Users/lorenzo/coding/personal-projects/CaseTester-proof-out/phase1-s2';
// Batches 28–38 (the run folders, not their review folders).
const BATCH = /^batch-(?:2[89]|3[0-8])-.*runs-\d+-\d+$/;

// The case with the overlay, itemCovers off and on; `also` on in both (prof-001's tagMatching).
export function phase1Views(raw: Case, overlay: Phase1Overlay, also: EngineSwitch[] = []): { off: Case; on: Case } {
  const env = (names: string[]) => (names.length ? { ENGINE_SWITCHES: `${raw.id}=${names.join(',')}` } : {});
  return { off: applyPhase1Overlay(raw, overlay, env(also)), on: applyPhase1Overlay(raw, overlay, env([...also, 'itemCovers'])) };
}

// An exclusion word in a text: a whole word, a plural or possessive ending alike (item-tags.ts's reading).
export function excludedBy(text: string, excludes: string[]): string | null {
  for (const x of excludes) {
    const w = x.toLowerCase().trim().replace(/['’]s?$/, '');
    const re = new RegExp(`(?<![a-z0-9])${w.split(/[\s-]+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]+')}(?:e?s)?(?:['’]s?)?(?![a-z0-9])`, 'i');
    if (re.test(text)) return x;
  }
  return null;
}

export function collisions(id: string, on: Case, off: Case): Duplicate[] {
  return duplicatePhrases(id, on.factAnchors?.covers ?? {}, off.factAnchors?.covers ?? {}, {});
}

export type AskTurn = { run: string; turnIndex: number; text: string; phase?: Phase; asks?: { what: string; itemIds: string[] }[] };
export type Verdict = 'answers' | 'wrong' | 'unsure';
export type Gain = { item: string; phrases: string[]; excludedBy: string | null; tags: 'agree' | 'entity' | 'forecast'; verdict?: Verdict; note?: string };
export type AskRow = {
  run: string; turnIndex: number; source: 'model' | 'candidate'; what: string; sentence?: string; mapped?: string[];
  before: string[]; after: string[]; gained: Gain[]; lost: string[];
};

const coveredIds = (d: ReturnType<typeof coverageDetail>) => [...new Set([...d.items, ...d.promptFacts, ...d.coarse.flatMap(c => c.ids.map(i => `${i} (coarse)`))])].sort();
// A candidate's asks: the engine's asking sentences, and every question sentence besides (the lint reads more
// than the engine does: a sentence the engine skips today may be read by Stream 4's broader cues).
export function candidateAsks(t: AskTurn): string[] {
  const asking = askingSentences(t.text, t.phase ?? 'ANALYSIS');
  return [...new Set([...asking, ...sentencesOf(t.text).filter(s => s.trim().endsWith('?'))])];
}
const bare = (id: string) => id.replace(/ \(coarse\)$/, '');

// Every ask whose coverage changes from itemCovers off to on.
export function askDiff(off: Case, on: Case, overlay: Phase1Overlay, turns: AskTurn[]): AskRow[] {
  const fbOff = buildFactBase(off), fbOn = buildFactBase(on);
  const names = properNames(on.sttKeyterms);
  const out: AskRow[] = [];
  const row = (t: AskTurn, source: AskRow['source'], what: string, sentenceOf: (fb: FactBase) => string | undefined, mapped?: string[]) => {
    const sOff = sentenceOf(fbOff), sOn = sentenceOf(fbOn);
    const before = coveredIds(coverageDetail(what, fbOff, { sentence: sOff }));
    const after = coveredIds(coverageDetail(what, fbOn, { sentence: sOn }));
    if (before.join() === after.join()) return;
    const texts = [what, ...(sOn ? [sOn] : [])];
    const gained = after.filter(a => !before.map(bare).includes(bare(a))).map(a => {
      const item = bare(a);
      const phrases = (overlay.items[item]?.covers ?? []).filter(p => texts.some(x => coverPhraseSpans(x, p, fbOn.answerGate).length > 0));
      const excludes = on.dataLedger.find(d => d.id === item)?.coverExcludes ?? [];
      return { item: a, phrases, excludedBy: excludedBy(texts.join('\n'), excludes), tags: tagsAgree(texts.join('\n'), item, fbOn).why ?? 'agree' } as Gain;
    });
    const lost = before.filter(b => !after.map(bare).includes(bare(b)));
    out.push({ run: t.run, turnIndex: t.turnIndex, source, what, ...(sOn ? { sentence: sOn } : {}), ...(mapped ? { mapped } : {}), before, after, gained, lost });
  };
  for (const t of turns) {
    const asking = askingSentences(t.text, t.phase ?? 'ANALYSIS');
    for (const a of t.asks ?? []) row(t, 'model', a.what, fb => (fb.answerGate ? askSentenceFor(a.what, asking, names) : undefined), a.itemIds);
    for (const s of candidateAsks(t)) row(t, 'candidate', s, () => undefined);
  }
  return out;
}

// Per overlay cover, the asks (model requests and candidate asking sentences) it matches in the merged view.
export function coverCounts(on: Case, overlay: Phase1Overlay, turns: AskTurn[]): { item: string; phrase: string; count: number }[] {
  const folded = buildFactBase(on).answerGate;
  const texts = turns.flatMap(t => [...(t.asks ?? []).map(a => a.what), ...candidateAsks(t)]);
  return Object.entries(overlay.items).flatMap(([item, x]) => (x.covers ?? []).map(phrase => ({
    item, phrase, count: texts.filter(s => coverPhraseSpans(s, phrase, folded).length > 0).length,
  })));
}

// Item tags against the case-level tags (the case's factAnchors.tags, or the overlay's factTags for prof-001).
export function tagProblems(c: Case, overlay: Phase1Overlay): string[] {
  const t = c.factAnchors?.tags ?? overlay.factTags;
  const out: string[] = [];
  for (const [id, x] of Object.entries(overlay.items)) {
    if (!x.tags || !t) continue;
    const owner = t.entities.find(e => e.items.includes(id))?.id ?? 'client';
    if (x.tags.entity !== owner) out.push(owner === 'client' ? `${id}: tagged "${x.tags.entity}" but in no entity's items (the client's)` : `${id}: in entity "${owner}" but tagged "${x.tags.entity}"`);
    if (t.forecast.includes(id) && !x.tags.period.includes('forecast')) out.push(`${id}: in factAnchors.tags.forecast but its period has no "forecast"`);
    if (!t.forecast.includes(id) && x.tags.period.includes('forecast')) out.push(`${id}: period "forecast" but not in factAnchors.tags.forecast`);
  }
  return out;
}

// What the overlay leaves out: every item's tags and askPhrases, 10 covers an item (base and overlay), every exhibit's summary.
export function completeness(on: Case, overlay: Phase1Overlay): string[] {
  const out: string[] = [];
  for (const d of on.dataLedger) {
    const x = overlay.items[d.id];
    if (!x?.tags) out.push(`${d.id}: no tags`);
    if (!x?.askPhrases) out.push(`${d.id}: no askPhrases`);
    const n = on.factAnchors?.covers[d.id]?.length ?? 0;
    if (n < 10) out.push(`${d.id}: covers ${n} (under 10)`);
    if (n > 20 && (x?.covers?.length ?? 0) > 0) out.push(`${d.id}: covers ${n} (over 20, the overlay adds ${x!.covers!.length})`);
  }
  for (const e of on.exhibits) if (!overlay.exhibits[e.id]) out.push(`${e.id}: no summary`);
  // An exclusion word in the item's own covers would block them, were exclusions read.
  for (const d of on.dataLedger) for (const x of d.coverExcludes ?? []) {
    for (const p of on.factAnchors?.covers[d.id] ?? []) if (excludedBy(p, [x])) out.push(`${d.id}: exclusion "${x}" is in its own cover "${p}"`);
  }
  return out;
}

// The overlay merged with every Phase 1 switch on: the case must still load (cycles, anchors on items with no timeframes).
export function fullMergeProblem(raw: Case, overlay: Phase1Overlay): string | null {
  try { applyPhase1Overlay(raw, overlay, { ENGINE_SWITCHES: `${raw.id}=phase1` }); return null; } catch (e) { return `with every switch on: ${(e as Error).message.split('\n').slice(0, 3).join(' ')}`; }
}

export type Judgement = { caseId: string; run: string; turnIndex: number; source: AskRow['source']; item: string; verdict: Exclude<Verdict, 'unsure'> | 'unsure'; what?: string; note?: string };
// A gain's hand verdict; one with none is unsure. A judgement names the ask by run, turn, source and item
// (and `what`, when one turn has two asks gaining the same item).
export function applyJudgements(caseId: string, rows: AskRow[], judgements: Judgement[]): AskRow[] {
  return rows.map(r => ({ ...r, gained: r.gained.map(g => {
    const j = judgements.find(x => x.caseId === caseId && x.run === r.run && x.turnIndex === r.turnIndex && x.source === r.source && x.item === bare(g.item) && (x.what === undefined || x.what === r.what));
    return { ...g, verdict: j?.verdict ?? 'unsure', ...(j?.note ? { note: j.note } : {}) };
  }) }));
}

export type CaseReport = { id: string; label?: string; collisions: Duplicate[]; rows: AskRow[]; counts: { item: string; phrase: string; count: number }[]; tagProblems: string[]; completeness: string[] };
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
export function renderPhase1Lint(reports: CaseReport[], meta: { runs?: string; turns?: Record<string, number> } = {}): string {
  const name = (r: CaseReport) => r.label ?? r.id;
  const out = ['# Phase 1 cover lint (Stream 2)', '',
    `The merged view: each case with its overlay (cases/phase1/<id>.json) through applyPhase1Overlay, itemCovers off against on. Corpus: ${meta.runs ?? RUNS}, batches 28–38 — the interviewer model's declared requests (with the candidate's asking sentence the engine picks) and the candidate's asking and question sentences. Generated by scripts/phase1-cover-lint.ts.`, ''];
  out.push('## 1. Phrases on two items', '', '| case | phrase (folded) | items | status |', '|---|---|---|---|');
  for (const r of reports) for (const d of r.collisions) out.push(`| ${name(r)} | ${cell(d.phrase)} | ${d.items.join(', ')} | ${d.status} |`);
  out.push('', '## 2. New matches', '', 'Each ask whose coverage changes with itemCovers on. gained: item ← overlay phrase(s); excl: a coverExcludes word in the ask (not read by today\'s matching); tags: tagsAgree on the merged case; verdict: the hand judgement.', '');
  for (const r of reports) {
    out.push(`### ${name(r)}${meta.turns ? ` (${meta.turns[r.id] ?? 0} candidate turns)` : ''}`, '');
    if (r.rows.length === 0) { out.push('No changes.', ''); continue; }
    out.push('| # | run | turn | source | ask | asking sentence | model mapped | off | on | gained | lost |', '|---|---|---|---|---|---|---|---|---|---|---|');
    r.rows.forEach((x, i) => out.push(`| ${i + 1} | ${x.run} | t${x.turnIndex} | ${x.source} | ${cell(x.what)} | ${cell(x.sentence ?? '')} | ${x.mapped ? x.mapped.join(', ') || '—' : ''} | ${x.before.join(', ') || '—'} | ${x.after.join(', ') || '—'} | ${x.gained.map(g => `${g.item} ← ${g.phrases.map(cell).join('; ') || '(base phrase)'}${g.excludedBy ? ` [excl: ${g.excludedBy}]` : ''}${g.tags !== 'agree' ? ` [tags: ${g.tags}]` : ''} — ${g.verdict ?? 'unsure'}${g.note ? ` (${cell(g.note)})` : ''}`).join('<br>')} | ${x.lost.join(', ')} |`));
    out.push('');
  }
  out.push('## 3. Unsure', '', 'Gains with no hand verdict, or judged unsure.', '', '| case | run | turn | source | ask | item | phrases | note |', '|---|---|---|---|---|---|---|---|');
  for (const r of reports) for (const x of r.rows) for (const g of x.gained) if ((g.verdict ?? 'unsure') === 'unsure') out.push(`| ${name(r)} | ${x.run} | t${x.turnIndex} | ${x.source} | ${cell(x.what)} | ${g.item} | ${g.phrases.map(cell).join('; ')} | ${cell(g.note ?? '')} |`);
  out.push('', '## 4. Count per overlay cover', '', '| case | item | phrase | matches |', '|---|---|---|---|');
  for (const r of reports) for (const c of r.counts) out.push(`| ${name(r)} | ${c.item} | ${cell(c.phrase)} | ${c.count} |`);
  out.push('', '## 5. Tags and completeness', '');
  for (const r of reports) {
    out.push(`### ${name(r)}`, '');
    const lines = [...r.tagProblems.map(p => `tags: ${p}`), ...r.completeness];
    out.push(...(lines.length ? lines.map(l => `- ${l}`) : ['Nothing.']), '');
  }
  return out.join('\n') + '\n';
}

// Candidate turns per case id: each run's candidate messages, the model's declared requests and the phase.
export function loadTurns(runs: string, batch: RegExp = BATCH): Map<string, AskTurn[]> {
  const byCase = new Map<string, AskTurn[]>();
  for (const b of readdirSync(runs).filter(x => batch.test(x)).sort()) {
    for (const run of readdirSync(path.join(runs, b)).sort()) {
      const dir = path.join(runs, b, run);
      if (!existsSync(dir) || !readdirSync(dir).length) continue;
      for (const f of readdirSync(dir).filter(x => /^live-run-.*\.json$/.test(x))) {
        const doc = JSON.parse(readFileSync(path.join(dir, f), 'utf-8')) as { session: { caseId: string }; turns: { role: string; text: string; turnIndex: number }[] };
        const asks = new Map<number, { what: string; itemIds: string[] }[]>();
        const phases = new Map<number, Phase>();
        const rec = path.join(dir, f.replace(/\.json$/, '.turns.jsonl.gz'));
        if (existsSync(rec)) {
          for (const line of gunzipSync(readFileSync(rec)).toString('utf-8').split('\n')) {
            if (!line.trim()) continue;
            const r = JSON.parse(line) as { type: string; turnIndex: number; stateBefore?: { phase?: Phase }; parsedTurn?: { requests?: { what: string; itemIds?: string[] }[] } | null };
            if (r.type !== 'turn') continue;
            asks.set(r.turnIndex, (r.parsedTurn?.requests ?? []).map(q => ({ what: q.what, itemIds: q.itemIds ?? [] })));
            if (r.stateBefore?.phase) phases.set(r.turnIndex, r.stateBefore.phase);
          }
        }
        const list = byCase.get(doc.session.caseId) ?? [];
        for (const t of doc.turns) if (t.role === 'candidate') list.push({ run: `${b}/${run}`, turnIndex: t.turnIndex, text: t.text, phase: phases.get(t.turnIndex), asks: asks.get(t.turnIndex) ?? [] });
        byCase.set(doc.session.caseId, list);
      }
    }
  }
  return byCase;
}

export function lintPhase1Case(raw: Case, overlay: Phase1Overlay, turns: AskTurn[], judgements: Judgement[], also: EngineSwitch[] = [], label?: string): CaseReport {
  const { off, on } = phase1Views(raw, overlay, also);
  return {
    id: raw.id, ...(label ? { label } : {}), collisions: collisions(raw.id, on, off),
    rows: applyJudgements(raw.id, askDiff(off, on, overlay, turns), judgements),
    counts: coverCounts(on, overlay, turns), tagProblems: tagProblems(on, overlay), completeness: [...[fullMergeProblem(raw, overlay)].filter((x): x is string => x !== null), ...completeness(on, overlay)],
  };
}

function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const runs = arg('--runs') ?? RUNS;
  const outDir = arg('--out') ?? OUT;
  // Hand verdicts: --judgements <file>, else every judgements*.json in the output directory.
  const only = arg('--case');
  const jFiles = arg('--judgements') ? [arg('--judgements')!] : existsSync(outDir) ? readdirSync(outDir).filter(f => /^judgements.*\.json$/.test(f)).map(f => path.join(outDir, f)) : [];
  const judgements: Judgement[] = jFiles.flatMap(f => JSON.parse(readFileSync(f, 'utf-8')) as Judgement[]);
  const turns = loadTurns(runs);
  const reports: CaseReport[] = [];
  for (const f of readdirSync('cases/phase1').filter(x => x.endsWith('.json') && (!only || x === `${only}.json`)).sort()) {
    const overlay = Phase1OverlaySchema.parse(JSON.parse(readFileSync(path.join('cases/phase1', f), 'utf-8')));
    const raw = CaseSchema.parse(JSON.parse(readFileSync(path.join('cases', f), 'utf-8')));
    const t = turns.get(raw.id) ?? [];
    reports.push(lintPhase1Case(raw, overlay, t, judgements));
    if (!raw.factAnchors?.tags && overlay.factTags) reports.push(lintPhase1Case(raw, overlay, t, judgements, ['tagMatching'], `${raw.id} (tagMatching on)`));
  }
  const counts = Object.fromEntries([...turns].map(([id, t]) => [id, t.length]));
  mkdirSync(outDir, { recursive: true });
  const stem = only ? `cover-lint-${only}` : 'cover-lint';
  writeFileSync(path.join(outDir, `${stem}.md`), renderPhase1Lint(reports, { runs, turns: counts }));
  writeFileSync(path.join(outDir, `${stem}.json`), JSON.stringify(reports, null, 1));
  for (const r of reports) {
    const gains = r.rows.flatMap(x => x.gained);
    const by = (v: Verdict) => gains.filter(g => (g.verdict ?? 'unsure') === v).length;
    console.log(`${r.label ?? r.id}: ${r.collisions.filter(d => d.status === 'new').length} new collisions (${r.collisions.length} in all), ${r.rows.length} changed asks, ${gains.length} gains — answers ${by('answers')}, wrong ${by('wrong')}, unsure ${by('unsure')}; lost ${r.rows.flatMap(x => x.lost).length}; tag problems ${r.tagProblems.length}`);
  }
  console.log(`wrote ${outDir}/${stem}.md`);
}

if (process.argv[1]?.endsWith('phase1-cover-lint.ts')) main();
