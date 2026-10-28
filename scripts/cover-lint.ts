// The cover lint (round 6 Task 69; Lorenzo, 21 Oct: "Add the missing covers from
// the audit. Each must be multi-word and specific, with no bare "cost" or
// "flights". … Lint: flag any phrase that appears in two items' covers; run every
// new or changed cover against every candidate ask in batches 28–37; list what
// each newly matches."). Free and deterministic: no model calls. Per case it lists
//   (1) every phrase, folded as a tagged case folds it (fact-check.ts coverageOf
//       (a)), in two items' covers — "intended" when INTENDED_PAIRS lists it, "at
//       BASE" when the same items already shared it there, else "new";
//   (2) every ask in that case's b28–b37 runs — each candidate sentence, and each
//       ask the interviewer model declared (`requests[].what`, the text coverageOf
//       reads; from the run's turns.jsonl.gz) — that a phrase new or changed since
//       BASE matches, and every one an existing phrase newly matches through the
//       fold, with run, turn and text — plus what the engine does with that text
//       taken as the ask (coverageDetail: given, coarse, dropped by entity or
//       region, or not covered by a cut beside it), tagsAgree's verdict, and for a
//       model ask the items the model mapped it to itself;
//   (2b) every model ask whose coverage changes from BASE (the literal match on the
//       model's words, untagged, BASE's covers) to now (the tagged case: the fold,
//       the entity and geography exclusions, and the candidate's asking sentence
//       the engine picks for it, turn-data.ts askSentenceFor) — Lorenzo counts the
//       sentence as part of the normalization ("Match the candidate's own sentence
//       as well as the model's rewording"), and a literal phrase can newly match
//       through it;
//   (3) the count per phrase.
// BASE is be1217b (the round's base). Each listed match is judged by hand
// ("answers" / "doesn't"); a new phrase with a match that doesn't answer is
// narrowed or removed.
//
//   npx tsx scripts/cover-lint.ts [--runs <test runs dir>] [--out <file.md>]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { buildFactBase, coverageDetail, coverPhraseSpans, foldCoverPhrase, sentencesOf, type FactBase } from '@/lib/orchestrator/fact-check';
import { tagsAgree } from '@/lib/orchestrator/item-tags';
import { askingSentences, properNames } from '@/lib/orchestrator/request-signal';
import { askSentenceFor } from '@/lib/orchestrator/turn-data';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { loadCases } from '@/lib/cases/loader';
import type { Case } from '@/lib/cases/schema';

const BASE = 'be1217b';
const RUNS = 'Case Interview Runs/test runs';
const OUT = 'Case Interview Runs/replays/2026-10-21/round6/cover-lint.md';
// Batches 28–37 (the run folders, not their review folders).
const BATCH = /^batch-(?:2[89]|3[0-7])-.*runs-\d+-\d+$/;

// Phrases deliberately on two items (folded form, items sorted).
export const INTENDED_PAIRS: Record<string, { phrase: string; items: string[] }[]> = {
  // Task 69 data: a by-route fare ask is both routes' fares.
  'prof-002': [
    { phrase: 'average fare by route', items: ['lakeport_fare', 'port_avery_per_flight'] },
    { phrase: 'fare by route', items: ['lakeport_fare', 'port_avery_per_flight'] },
  ],
};

type Covers = Record<string, string[]>;
// `asks`: the interviewer model's declared requests on this turn (its `what` and item ids).
// `phase`: the phase the turn was read in (askingSentences reads it; ANALYSIS when unknown).
export type CandidateTurn = { run: string; turnIndex: number; text: string; phase?: Phase; asks?: { what: string; itemIds: string[] }[] };
export type Duplicate = { phrase: string; items: string[]; status: 'intended' | 'at BASE' | 'new' };
export type Match = {
  item: string; phrase: string; kind: 'new' | 'normalized'; source: 'candidate' | 'model'; run: string; turnIndex: number; sentence: string;
  ask?: boolean; mapped?: string[]; engine: 'given' | 'coarse' | 'dropped: entity' | 'dropped: region' | 'not covered'; tags: 'agree' | 'entity' | 'forecast';
};
export type Count = { item: string; phrase: string; kind: 'new' | 'normalized'; count: number };
// An item answered at the coarser cut reads "id (coarse)".
export type AskChange = { run: string; turnIndex: number; what: string; mapped: string[]; sentence?: string; before: string[]; after: string[]; dropped: string[] };
export type CaseLint = { id: string; tagged: boolean; duplicates: Duplicate[]; matches: Match[]; counts: Count[]; askChanges: AskChange[] };

// Folded phrase → the items whose covers carry it.
function phraseOwners(covers: Covers): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const [item, phrases] of Object.entries(covers)) for (const p of phrases) {
    const f = foldCoverPhrase(p);
    owners.set(f, (owners.get(f) ?? new Set()).add(item));
  }
  return owners;
}

export function duplicatePhrases(caseId: string, covers: Covers, baseCovers: Covers | null, intended: typeof INTENDED_PAIRS = INTENDED_PAIRS): Duplicate[] {
  const base = phraseOwners(baseCovers ?? {});
  const out: Duplicate[] = [];
  for (const [phrase, set] of phraseOwners(covers)) {
    if (set.size < 2) continue;
    const items = [...set].sort();
    const same = (xs: string[]) => xs.length === items.length && [...xs].sort().every((x, i) => x === items[i]);
    const status = (intended[caseId] ?? []).some(p => foldCoverPhrase(p.phrase) === phrase && same(p.items)) ? 'intended'
      : same([...(base.get(phrase) ?? [])]) ? 'at BASE' : 'new';
    out.push({ phrase, items, status });
  }
  return out.sort((a, b) => a.phrase.localeCompare(b.phrase));
}

// What the engine does with a sentence taken as the ask, for one item.
function engineOn(sentence: string, item: string, fb: FactBase): Match['engine'] {
  const d = coverageDetail(sentence, fb);
  if (d.items.includes(item) || d.promptFacts.includes(item)) return 'given';
  if (d.coarse.some(c => c.ids.includes(item))) return 'coarse';
  const dropped = d.dropped[0];
  return dropped ? `dropped: ${dropped.why}` : 'not covered';
}

export function lintCase(input: { id: string; caseData: Case; baseCovers: Covers | null; turns: CandidateTurn[] }): CaseLint {
  const { id, caseData, baseCovers, turns } = input;
  const fb = buildFactBase(caseData);
  const covers: Covers = caseData.factAnchors?.covers ?? {};
  const tagged = fb.answerGate;
  // A candidate sentence the engine reads as an asking one (the sentence (d) reads; numbered lines split alike).
  const asking = (t: CandidateTurn) => { const a = askingSentences(t.text, t.phase ?? 'ANALYSIS'); return (s: string) => a.some(x => x === s || x.includes(s) || s.includes(x)); };
  const sentences: { run: string; turnIndex: number; sentence: string; source: Match['source']; ask?: boolean; mapped?: string[] }[] = turns.flatMap(t => {
    const isAsk = asking(t);
    return [
      ...[...new Set(sentencesOf(t.text))].map(sentence => ({ run: t.run, turnIndex: t.turnIndex, sentence, source: 'candidate' as const, ask: isAsk(sentence) })),
      ...(t.asks ?? []).map(a => ({ run: t.run, turnIndex: t.turnIndex, sentence: a.what, source: 'model' as const, mapped: a.itemIds })),
    ];
  });
  const matches: Match[] = [], counts: Count[] = [];
  for (const [item, phrases] of Object.entries(covers)) for (const phrase of phrases) {
    const isNew = baseCovers === null || !(baseCovers[item] ?? []).some(p => p.toLowerCase() === phrase.toLowerCase());
    if (!isNew && !tagged) continue;   // untagged and unchanged: BASE's literal matches
    const kind = isNew ? 'new' : 'normalized';
    const hits = sentences.filter(s => coverPhraseSpans(s.sentence, phrase, tagged).length > 0
      && (isNew || coverPhraseSpans(s.sentence, phrase, false).length === 0));
    if (isNew || hits.length > 0) counts.push({ item, phrase, kind, count: hits.length });
    for (const s of hits) {
      matches.push({
        item, phrase, kind, source: s.source, run: s.run, turnIndex: s.turnIndex, sentence: s.sentence, ...(s.ask !== undefined ? { ask: s.ask } : {}), ...(s.mapped ? { mapped: s.mapped } : {}),
        engine: engineOn(s.sentence, item, fb), tags: tagsAgree(s.sentence, item, fb).why ?? 'agree',
      });
    }
  }
  return { id, tagged, duplicates: duplicatePhrases(id, covers, baseCovers), matches, counts, askChanges: askChanges(caseData, fb, baseCovers, turns) };
}

// What coverageDetail gives an ask: its items and prompt facts, the coarse ones marked.
const covered = (d: ReturnType<typeof coverageDetail>) => [...new Set([...d.items, ...d.promptFacts, ...d.coarse.flatMap(c => c.ids.map(i => `${i} (coarse)`))])].sort();
function askChanges(caseData: Case, fb: FactBase, baseCovers: Covers | null, turns: CandidateTurn[]): AskChange[] {
  if (baseCovers === null) return [];
  const fa = { ...caseData.factAnchors!, covers: baseCovers };
  delete fa.tags;
  const baseFb = buildFactBase({ ...caseData, factAnchors: fa });
  const names = properNames(caseData.sttKeyterms);
  const out: AskChange[] = [];
  for (const t of turns) {
    const asking = askingSentences(t.text, t.phase ?? 'ANALYSIS');
    for (const a of t.asks ?? []) {
      const sentence = fb.answerGate ? askSentenceFor(a.what, asking, names) : undefined;
      const now = coverageDetail(a.what, fb, { sentence });
      const before = covered(coverageDetail(a.what, baseFb)), after = covered(now);
      const dropped = now.dropped.map(d => d.why);
      if (before.join() === after.join() && dropped.length === 0) continue;
      out.push({ run: t.run, turnIndex: t.turnIndex, what: a.what, mapped: a.itemIds, ...(sentence ? { sentence } : {}), before, after, dropped });
    }
  }
  return out;
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
export function renderLint(lints: CaseLint[], meta: { runs?: string; turns?: Record<string, number> } = {}): string {
  const out: string[] = ['# Cover lint (round 6 Task 69)', '',
    `BASE ${BASE}. Corpus: ${meta.runs ?? RUNS}, batches 28–37: candidate turns by sentence, and the interviewer model's declared asks. Generated by scripts/cover-lint.ts; each match is judged by hand in the Task 69 report.`, ''];
  out.push('## 1. Phrases in two items\' covers', '', '| case | phrase (folded) | items | status |', '|---|---|---|---|');
  for (const l of lints) for (const d of l.duplicates) out.push(`| ${l.id} | ${cell(d.phrase)} | ${d.items.join(', ')} | ${d.status} |`);
  out.push('', '## 2. Matches', '', 'new: a phrase new or changed since BASE, every match. normalized: an existing phrase, where only the fold matches it.', '');
  for (const l of lints) {
    out.push(`### ${l.id} (${l.tagged ? 'tagged' : 'untagged'}${meta.turns ? `; ${meta.turns[l.id] ?? 0} candidate turns` : ''})`, '');
    if (l.matches.length === 0) { out.push('No matches.', ''); continue; }
    out.push('| # | item | phrase | kind | run | turn | source | text | engine | tags | model mapped |', '|---|---|---|---|---|---|---|---|---|---|---|');
    const source = (m: Match) => (m.source === 'model' ? 'model ask' : m.ask ? 'candidate ask' : 'candidate, no ask');
    l.matches.forEach((m, i) => out.push(`| ${i + 1} | ${m.item} | ${cell(m.phrase)} | ${m.kind} | ${m.run} | t${m.turnIndex} | ${source(m)} | ${cell(m.sentence)} | ${m.engine} | ${m.tags} | ${m.mapped ? m.mapped.join(', ') || '—' : ''} |`));
    out.push('');
  }
  out.push('## 2b. Model asks whose coverage changes', '', 'BASE: the literal match on the model\'s words, BASE\'s covers, untagged. Now: the tagged case, with the candidate\'s asking sentence the engine picks.', '');
  for (const l of lints) {
    out.push(`### ${l.id}`, '');
    if (l.askChanges.length === 0) { out.push('No changes.', ''); continue; }
    out.push('| # | run | turn | model ask | model mapped | asking sentence | BASE | now | dropped |', '|---|---|---|---|---|---|---|---|---|');
    l.askChanges.forEach((c, i) => out.push(`| ${i + 1} | ${c.run} | t${c.turnIndex} | ${cell(c.what)} | ${c.mapped.join(', ') || '—'} | ${cell(c.sentence ?? '')} | ${c.before.join(', ') || '—'} | ${c.after.join(', ') || '—'} | ${c.dropped.join(', ')} |`));
    out.push('');
  }
  out.push('## 3. Count per phrase', '', '| case | item | phrase | kind | matches |', '|---|---|---|---|---|');
  for (const l of lints) for (const c of l.counts) out.push(`| ${l.id} | ${c.item} | ${cell(c.phrase)} | ${c.kind} | ${c.count} |`);
  return out.join('\n') + '\n';
}

// Candidate turns per case id, from each run's live-run JSON.
function loadTurns(runs: string): Map<string, CandidateTurn[]> {
  const byCase = new Map<string, CandidateTurn[]>();
  for (const batch of readdirSync(runs).filter(b => BATCH.test(b)).sort()) {
    for (const run of readdirSync(path.join(runs, batch)).sort()) {
      const dir = path.join(runs, batch, run);
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
        for (const t of doc.turns) if (t.role === 'candidate') list.push({ run: `${batch}/${run}`, turnIndex: t.turnIndex, text: t.text, phase: phases.get(t.turnIndex), asks: asks.get(t.turnIndex) ?? [] });
        byCase.set(doc.session.caseId, list);
      }
    }
  }
  return byCase;
}

function baseCoversOf(id: string): Covers | null {
  try {
    const raw = execFileSync('git', ['show', `${BASE}:cases/${id}.json`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return (JSON.parse(raw) as Case).factAnchors?.covers ?? {};
  } catch { return null; }
}

function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const runs = arg('--runs') ?? RUNS;
  const outFile = arg('--out') ?? OUT;
  const turns = loadTurns(runs);
  const lints = loadCases().filter(c => turns.has(c.id)).sort((a, b) => a.id.localeCompare(b.id))
    .map(c => lintCase({ id: c.id, caseData: c, baseCovers: baseCoversOf(c.id), turns: turns.get(c.id)! }));
  const counts = Object.fromEntries([...turns].map(([id, t]) => [id, t.length]));
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderLint(lints, { runs, turns: counts }));
  for (const l of lints) console.log(`${l.id}: ${l.duplicates.length} shared phrases (${l.duplicates.filter(d => d.status === 'new').length} new), ${l.matches.length} matches`);
  console.log(`wrote ${outFile}`);
}

// Not when imported (scripts/phase1-cover-lint.ts also ends in cover-lint.ts).
if (path.basename(process.argv[1] ?? '') === 'cover-lint.ts') main();
