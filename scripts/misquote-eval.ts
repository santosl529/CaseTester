// Misquote check, prototype for its spec (12 Oct, batch-19 review step 3):
// a figure the candidate cites for a ledger item already revealed to them,
// off beyond a tolerance, is a misquote (Rule 6 option 4: a one-sentence flat
// reset). Derived figures (points, relative changes, scenarios, arithmetic)
// must not count. Not wired into the product — this measures precision and
// recall against hand labels before anything is built. Free.
//
//   npx tsx scripts/misquote-eval.ts            the detector's flags
//   npx tsx scripts/misquote-eval.ts --broad    the quote grammar without the hypothetical guard (for labelling)
//   npx tsx scripts/misquote-eval.ts --labels=tests/orchestrator/fixtures/misquote-labelled.json [--heldout]
//                                               precision / recall against the hand labels

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadSavedTurns, savedRunDirs } from '@/lib/eval/saved-turns';
import { readTurnFile } from '@/lib/eval/turn-file';
import { readdirSync } from 'node:fs';
import { getCaseById } from '@/lib/cases/loader';
import { normalizeNumberWords } from '@/lib/number-words';

// Proposed case-authoring field (like shareBases' aliases): the words a
// candidate uses for each quotable item, whether it states levels or a
// change, and for a share item what it is a share of. prof-001's values.
type QuoteAnchor = { item: string; names: string[]; kind: 'level' | 'change'; of?: string[] };
const QUOTE_ANCHORS: QuoteAnchor[] = [
  { item: 'cogs_pct', names: ['cogs', 'cost of goods sold', 'cost of goods'], kind: 'level' },
  { item: 'labor_pct', names: ['labor', 'labour'], kind: 'level' },
  { item: 'overhead_pct', names: ['overhead', 'rent', 'occupancy'], kind: 'level' },
  { item: 'avg_ticket', names: ['ticket', 'average ticket', 'transaction value', 'average transaction', 'atv'], kind: 'level' },
  { item: 'stores_count', names: ['store count', 'footprint', 'stores'], kind: 'level' },
  { item: 'bean_price_change', names: ['beans', 'bean prices', 'bean costs', 'bean cost', 'coffee beans', 'coffee prices', 'coffee costs', 'green coffee'], kind: 'change' },
  { item: 'non_bean_input_change', names: ['other inputs', 'other input costs', 'non-bean inputs', 'non-bean costs', 'non-bean', 'dairy, packaging and food', 'dairy, packaging, and food', 'everything else'], kind: 'change' },
  { item: 'bean_share_of_cogs', names: ['beans', 'coffee beans', 'bean share'], kind: 'level', of: ['cogs', 'cost of goods'] },
];

type Unit = 'percent' | 'dollar' | 'count' | 'plain';
type Fig = { value: number; unit: Unit; text: string };

// One figure: "$6.90", "61%", "61 percent", "200 stores", "~58".
const FIG = String.raw`(?:about|roughly|around|approximately|nearly|almost|~)?\s*(\$)?(\d+(?:\.\d+)?)(?![\d.a-wyz])(?!\s*(?:-|\s)?(?:points?|pts|pp|years?|x\b|×|m\b|million|b\b|billion|k\b|cents?|ways|things|reasons|levers|times|months))\s*(%|percent|stores|locations)?`;
const LINK_LEVEL = String.raw`(?:\s*(?:is|was|were|are|'s|at|sits at|stood at|stands at|now|today|currently|then|came in at|:|—|–|-|it|has us at|of revenue|as a percent of revenue|as a share of revenue|(?:went|goes|going|moved|moves|rose|climbed|grew|fell|dropped|jumped|increased|starts|started|ends|ended|ran|runs|up|down)\s+(?:from|to|at)|from)\s*)*`;
const LINK_CHANGE = String.raw`\s*(?:(?:are|were|is|was|have|has|went|gone|got|been|prices|costs?)\s+)*(?:up|rose|risen|increased|grew|climbed|jumped)\s+(?:by\s+)?`;
const CHAIN_NEXT = String.raw`(?:\s*of revenue)?\s*(?:to|→|->|–|—|then|and then|,|and ends at|and ended at|and is now|now)\s*`;

function fig(m: RegExpExecArray | RegExpMatchArray, i: number): Fig {
  const unit: Unit = m[i] ? 'dollar' : m[i + 2] && /^(%|percent)/.test(m[i + 2]) ? 'percent' : m[i + 2] ? 'count' : 'plain';
  return { value: Number(m[i + 1]), unit, text: m[0].trim() };
}

// The figures a sentence quotes for one anchor: a chain right after it.
function quotedAfter(rest: string, a: QuoteAnchor, current?: number): Fig[] {
  const out: Fig[] = [];
  const first = new RegExp(`^${a.kind === 'change' ? LINK_CHANGE : LINK_LEVEL}${FIG}`, 'i').exec(rest);
  if (!first) return out;
  out.push(fig(first, 1));
  let pos = first[0].length;
  if (a.kind === 'level' && current !== undefined) {
    // A chain runs through the item's periods ("42% to 58%", "42 → 50 → 58");
    // a figure after its current value is a projection, not a quote.
    const next = new RegExp(`^${CHAIN_NEXT}${FIG}`, 'i');
    for (let m = next.exec(rest.slice(pos)); m && !(current !== undefined && out.some(f => Math.abs(f.value - current) < 1e-9)); m = next.exec(rest.slice(pos))) { out.push(fig(m, 1)); pos += m[0].length; }
  }
  const after = rest.slice(pos);
  // A breakdown, not a level: "16 of those are COGS — 11.8 from dairy, …".
  if (/^\s*from\s+(?!\$?\d|two|2\b|last|the prior|a year)/i.test(after)) return [];
  // A share of something else ("89% of the problem", "75% of COGS") is not this item's level;
  // a share item's quote must say what it is a share of.
  const ofWhat = /^\s*of\s+(?:the\s+|that\s+|this\s+)?([\w-]+(?:\s+[\w-]+)?)/i.exec(after)?.[1]?.toLowerCase();
  if (a.of) { if (!ofWhat || !a.of.some(o => ofWhat.startsWith(o))) return []; }
  else if (ofWhat && !/^(?:revenue|sales|rev)\b/.test(ofWhat)) return [];
  // Arithmetic on the quoted figure ("58/110", "42 × 0.25") ends the quote there: keep what came before.
  if (/^\s*(?:[/÷×*]|divided|times)/.test(after) && out.length > 0) out.pop();
  return out;
}

function figuresBefore(before: string): Fig {
  const m = /(\$)?(\d+(?:\.\d+)?)\s*(%)?\s*$/.exec(before)!;
  return { value: Number(m[2]), unit: m[1] ? 'dollar' : m[3] ? 'percent' : 'plain', text: m[0].trim() };
}
const unitsFit = (cand: Unit, item: Unit) => cand === item || cand === 'plain' || item === 'plain' || (cand === 'dollar' && item === 'percent');
function allowed(f: Fig, targets: { value: number; unit: Unit }[]): boolean {
  const decimals = (f.text.match(/\.(\d+)/)?.[1].length) ?? 0;
  const rounding = decimals === 0 ? 0.5 : 0.5 * 10 ** -decimals;
  const hedged = /\b(?:about|roughly|around|approximately|nearly|almost)\b|~/i.test(f.text);
  // A hedged figure may be a round version of the true one: a multiple of 10
  // within 5, of 5 within 2.5 ("roughly 40%" for 37.5%, "about 60%" for 58%);
  // "about 44%" for 42% is not a rounding, it's a misquote.
  const roundness = f.value % 10 === 0 ? 5 : f.value % 5 === 0 ? 2.5 : rounding;
  return targets.some(t => unitsFit(f.unit, t.unit) && Math.abs(f.value - t.value) <= (hedged ? Math.max(rounding, roundness) : rounding) + 1e-9);
}

// The figures an item states (its timeframes, unit read from its value text),
// plus the shown exhibit's column for it.
function itemTargets(item: { value: string; timeframes?: Record<string, string> }, exhibitCol: number[]): { value: number; unit: Unit }[] {
  const t = Object.keys(item.timeframes ?? {}).map(n => {
    const m = new RegExp(`(\\$)?${n.replace('.', '\\.')}\\s*(%|percent|stores)?`).exec(item.value);
    const unit: Unit = m?.[1] ? 'dollar' : m?.[2] === 'stores' ? 'count' : m?.[2] ? 'percent' : 'plain';
    return { value: Number(n), unit };
  });
  // The item's own change counts as stated: in points ("COGS is 16", "overhead 2") and relative ("rose 38%").
  const tf = item.timeframes ?? {};
  const cur = Object.entries(tf).find(([, p]) => p === 'current')?.[0];
  const pri = Object.entries(tf).find(([, p]) => p === 'prior')?.[0];
  const derived = cur !== undefined && pri !== undefined
    ? [{ value: Number(cur) - Number(pri), unit: 'plain' as Unit }, { value: Math.round(((Number(cur) - Number(pri)) / Number(pri)) * 1000) / 10, unit: 'percent' as Unit }]
    : [];
  return [...t, ...exhibitCol.map(v => ({ value: v, unit: 'percent' as Unit })), ...derived];
}

// Not a quote: a hypothetical or projection anywhere before the anchor in the
// sentence, a conclusion ("so COGS is 48.7%"), or a sum ("labor plus overhead is 36").
const HYPOTHETICAL = /\b(?:if|suppose|assume|assuming|say|would|could|will|target|scenario|pro forma|after a|post-|next year|another year|going forward|trend continues|in a year)\b/i;
// A sentence that indexes or does arithmetic restates figures on its own base
// ("Index COGS at 100", "on 115 of revenue, COGS is 66.7", "16 ÷ 18 = 88.9%").
const INDEXED_OR_ARITHMETIC = /\bindex|\bindexing|\bbase(?:line)?\b|\$100 of revenue|\brevenue (?:at |of )?(?:100|115)\b|\bon (?:100|115)\b|\bcall [\w ]{0,20}\b100\b|[=÷×≈−]|\s-\s|\bdivided by\b|\btimes\b|\bminus\b|\bextrapolat|\brun rate\b|\bone more year\b|\bproject(?:ed|ion)?\b|\bnext year\b|\bwould\b|\bof the (?:problem|decline|gap|story|drop|change|increase|swing|deterioration)\b/i;
// The anchor as the object of a preposition ("the largest line in COGS at 25%", "25% of COGS").
const PREPOSITION = /\b(?:in|of|within|inside|into|from|with)\s+(?:the\s+|total\s+)?$/i;
const CONCLUSION = /\b(?:so|which (?:makes|puts)|that (?:puts|makes|takes)|meaning|new|takes)\s+(?:the\s+)?$/i;
const SUM = /(?:\bplus|\band|\+|&)\s+$/i;

type Flag = { run: string; turn: number; item: string; cited: string; ledger: string; sentence: string };

type Ledger = { id: string; value: string; timeframes?: Record<string, string> }[];
function scan(text: string, revealed: Set<string>, ledger: Ledger, exhibitCols: Record<string, number[]>, broad: boolean): Omit<Flag, 'run' | 'turn'>[] {
  const out: Omit<Flag, 'run' | 'turn'>[] = [];
  const seen = new Set<string>();
  const sentences = normalizeNumberWords(text).split(/(?<=[.?!])\s+|\n+/).map(x => x.trim());
  // A figure the candidate computed earlier in the message is theirs, not a
  // quote ("52.3 over 31.5 is about 66% growth … grew 66%").
  const ARITH = /[=÷×/*]|\bover\b|\bdivided\b|\btimes\b|\bminus\b|\bplus\b|\bgives\b/i;
  const computedEarlier = (v: number, idx: number) => sentences.slice(0, idx).some(x => ARITH.test(x) && new RegExp(`(?<![\\d.])${String(v).replace('.', '\\.')}(?:0*)(?![\\d])`).test(x));
  // A message that indexes restates every figure on its own base ("Today, per index: … overhead 16.1000").
  const indexedMessage = /\bindex|\bbase-?100\b|\bon (?:100|115)\b|\brevenue (?:of |at )?115\b/i.test(text);
  for (const [idx, raw] of sentences.entries()) {
    if (!broad && indexedMessage) break;
    const s = raw.trim();
    const lower = s.toLowerCase();
    for (const a of QUOTE_ANCHORS) {
      if (!revealed.has(a.item)) continue;
      const item = ledger.find(i => i.id === a.item)!;
      const targets = itemTargets(item, exhibitCols[a.item] ?? []);
      for (const n of a.names) {
        for (const m of lower.matchAll(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'))) {
          const at = (m.index ?? 0) + n.length;
          const before = s.slice(0, m.index ?? 0);
          if (!broad && (HYPOTHETICAL.test(before) || INDEXED_OR_ARITHMETIC.test(s) || CONCLUSION.test(before.slice(-25)) || SUM.test(before.slice(-12)) || PREPOSITION.test(before.slice(-20)))) continue;
          const current = Object.entries(item.timeframes ?? {}).find(([, p]) => p === 'current' || p === 'both')?.[0];
          // The anchor already quoted ("a $6.80 ticket is about $0.34"): what follows is another quantity.
          if (!broad && /\$?\d+(?:\.\d+)?\s*%?\s*$/.test(before) && allowed(figuresBefore(before), targets)) continue;
          const quoted = quotedAfter(s.slice(at), a, current !== undefined ? Number(current) : undefined);
          // A contrast with the correct figure ("Market beans are up 40%, but our per-unit cost is up ~96%").
          const contrast = /\b(?:but|whereas|while|versus|vs\.?|compared)\b/i.test(s) && quoted.some(f => allowed(f, targets)) === false
            && QUOTE_ANCHORS.filter(o => o.item === a.item).some(o => o.names.some(nm => s.toLowerCase().split(nm).length > 2 || new RegExp(`${nm}[^.]*?${targets.map(t => t.value).filter(v => v > 1).join('|')}`, 'i').test(s)));
          if (!broad && contrast) continue;
          for (const f of quoted) {
            if (allowed(f, targets)) continue;
            if (!broad && computedEarlier(f.value, idx)) continue;
            // Same anchor word, another revealed item that states it ("beans were 25%" vs "beans up 40%").
            const shared = QUOTE_ANCHORS.filter(o => o.item !== a.item && revealed.has(o.item) && o.names.includes(n));
            if (shared.some(o => allowed(f, itemTargets(ledger.find(i => i.id === o.item)!, exhibitCols[o.item] ?? [])))) continue;
            const key = `${a.item}:${f.value}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ item: a.item, cited: f.text, ledger: targets.map(t => `${t.value}${t.unit === 'percent' ? '%' : ''}`).join('/'), sentence: s.slice(0, 220) });
          }
        }
      }
    }
  }
  return out;
}

type Rec = { turnIndex: number; candidateText: string; stateBefore: { revealedIds: string[]; shownExhibitIds: string[] } };
function legacyRecords(dir: string): Rec[] {
  const f = readdirSync(dir).find(x => x.endsWith('.json') && !x.includes('turns'))!;
  const run = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
    turns: { turnIndex: number; role: string; text: string; timestampMs: number }[];
    revealed: { ledgerItemId: string; revealedAtMs: number }[];
    analytics: { eventType: string; createdAt: string; payloadJsonb: { exhibitId?: string } }[];
  };
  return run.turns.filter(t => t.role === 'candidate').map(t => ({
    turnIndex: t.turnIndex, candidateText: t.text,
    stateBefore: {
      revealedIds: run.revealed.filter(r => r.revealedAtMs <= t.timestampMs).map(r => r.ledgerItemId),
      shownExhibitIds: run.analytics.filter(a => a.eventType === 'exhibit_shown' && Date.parse(a.createdAt) <= t.timestampMs).map(a => a.payloadJsonb.exhibitId ?? 'exhibit-a'),
    },
  }));
}

function main() {
  const args = process.argv.slice(2);
  const broad = args.includes('--broad');
  const labelsFile = args.find(a => a.startsWith('--labels='))?.split('=')[1];
  const heldout = args.includes('--heldout');
  const flags: Flag[] = [];
  for (const dir of savedRunDirs('Case Interview Runs/test runs', heldout ? ['batch-12', 'batch-13', 'batch-14', 'batch-15', 'batch-16', 'batch-17'] : ['batch-18', 'batch-19'])) {
    const tf = readdirSync(dir).find(f => f.endsWith('.turns.jsonl.gz'));
    // Held-out batches (12–17) have no turn file: what was revealed and shown
    // before each candidate turn comes from the record's timestamps.
    const records = tf ? readTurnFile(path.join(dir, tf)).turns : legacyRecords(dir);
    const caseData = getCaseById('prof-001');
    const ledger = caseData.dataLedger as Ledger;
    const exhibits = caseData.exhibits as { id: string; data: Record<string, unknown>[] }[];
    const run = loadSavedTurns(dir)[0]?.run ?? dir;
    for (const t of records) {
      const revealed = new Set(t.stateBefore.revealedIds);
      // A shown exhibit's column for an item counts as stated (exhibit-a: COGS 42 / 50 / 58).
      const exhibitCols: Record<string, number[]> = {};
      for (const e of exhibits.filter(x => t.stateBefore.shownExhibitIds.includes(x.id))) {
        for (const col of Object.keys(e.data[0] ?? {})) {
          const a = QUOTE_ANCHORS.find(q => q.names.includes(col.toLowerCase()));
          if (a) exhibitCols[a.item] = e.data.map(r => Number(r[col])).filter(Number.isFinite);
        }
      }
      for (const f of scan(t.candidateText, revealed, ledger, exhibitCols, broad)) flags.push({ run, turn: t.turnIndex, ...f });
    }
  }
  if (labelsFile) {
    const scanned = heldout ? ['batch-12', 'batch-13', 'batch-14', 'batch-15', 'batch-16', 'batch-17'] : ['batch-18', 'batch-19'];
    const labels = (JSON.parse(readFileSync(labelsFile, 'utf8')) as { run: string; turn: number; item: string; cited: string; misquote: boolean }[])
      .filter(l => scanned.some(b => l.run.startsWith(b)));
    const key = (x: { run: string; turn: number; item: string; cited: string }) => `${x.run}|${x.turn}|${x.item}|${x.cited}`;
    const truth = new Set(labels.filter(l => l.misquote).map(key));
    const flagged = new Set(flags.map(key));
    const tp = [...flagged].filter(k => truth.has(k));
    const fp = [...flagged].filter(k => !truth.has(k));
    const fn = [...truth].filter(k => !flagged.has(k));
    console.log(`labelled misquotes ${truth.size}; flagged ${flagged.size}; TP ${tp.length}; FP ${fp.length}; FN ${fn.length}`);
    console.log(`precision ${(tp.length / Math.max(1, flagged.size)).toFixed(2)}  recall ${(tp.length / Math.max(1, truth.size)).toFixed(2)}`);
    for (const k of fp) console.log('  FP', k);
    for (const k of fn) console.log('  FN', k);
    return;
  }
  for (const f of flags) console.log(JSON.stringify(f));
  console.error(`${flags.length} ${broad ? 'broad candidates' : 'flags'}`);
}

main();
