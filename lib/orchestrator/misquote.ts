// Rule 6 option 4, decided in code (v4.11, 12 Oct): a figure the candidate
// states for a ledger item already revealed to them, in quote form ("COGS
// went from 42% to 61%", "the ticket is $6.90"), that matches none of the
// item's figures is a misquote; code speaks one flat correction from the
// ledger's own wording. Batch 19 (Haiku 5.5): Tyler's "61%" (the exhibit says
// 58%) ran from t5 into his recommendation, never named.
//
// A quote grammar, not "a number near a keyword" (that version flagged 836
// of 1,582 mentions — the candidate's own working): an anchor for a revealed
// item (the case's `quoteAnchors`), then only linking words ("is / at / went
// from / rose to / starts at … ends at"), then a figure or a chain through
// the item's periods; for a change item, "up / rose (by) N%". Derived figures
// never trigger it — points, multiples, years, cents; hypotheticals and
// projections; index or arithmetic sentences and indexed messages; a figure
// computed earlier in the message; shares of something else ("89% of the
// problem", "75% of COGS"); sums; prepositional anchors ("in COGS at 25%");
// a figure after an already-quoted anchor; a contrast with the correct
// figure; a breakdown ("COGS — 11.8 from dairy"). Measured over batches 12–19
// (scripts/misquote-eval.ts, hand labels in
// tests/orchestrator/fixtures/misquote-labelled.json): precision 0.86 / recall
// 0.86 on the tuning set; 0.40 precision on the held-out set's first pass.
import { normalizeNumberWords } from '@/lib/number-words';

export type QuoteAnchor = { item: string; names: string[]; kind: 'level' | 'change'; of?: string[] };
type LedgerItem = { id: string; value: string; timeframes?: Record<string, string> };
type Unit = 'percent' | 'dollar' | 'count' | 'plain';
type Fig = { value: number; unit: Unit; text: string };
export type Misquote = { item: string; cited: string; sentence: string };

// One figure: "$6.90", "61%", "61 percent", "200 stores", "~58".
const FIG = String.raw`(?:about|roughly|around|approximately|nearly|almost|~)?\s*(\$)?(\d+(?:\.\d+)?)(?![\d.a-wyz])(?!\s*(?:-|\s)?(?:points?|pts|pp|years?|x\b|×|m\b|million|b\b|billion|k\b|cents?|ways|things|reasons|levers|times|months))\s*(%|percent|stores|locations)?`;
const LINK_LEVEL = String.raw`(?:\s*(?:is|was|were|are|'s|at|sits at|stood at|stands at|now|today|currently|then|came in at|:|—|–|-|it|has us at|of revenue|as a percent of revenue|as a share of revenue|(?:went|goes|going|moved|moves|rose|climbed|grew|fell|dropped|jumped|increased|starts|started|ends|ended|ran|runs|up|down)\s+(?:from|to|at)|from)\s*)*`;
const LINK_CHANGE = String.raw`\s*(?:(?:are|were|is|was|have|has|went|gone|got|been|prices|costs?)\s+)*(?:up|rose|risen|increased|grew|climbed|jumped)\s+(?:by\s+)?`;
const CHAIN_NEXT = String.raw`(?:\s*of revenue)?\s*(?:to|→|->|–|—|then|and then|,|and ends at|and ended at|and is now|now)\s*`;

function fig(m: RegExpExecArray, i: number): Fig {
  const unit: Unit = m[i] ? 'dollar' : m[i + 2] && /^(%|percent)/.test(m[i + 2]) ? 'percent' : m[i + 2] ? 'count' : 'plain';
  return { value: Number(m[i + 1]), unit, text: m[0].trim() };
}

// The figures quoted for one anchor: a chain right after it.
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
    for (let m = next.exec(rest.slice(pos)); m && !out.some(f => Math.abs(f.value - current) < 1e-9); m = next.exec(rest.slice(pos))) {
      out.push(fig(m, 1));
      pos += m[0].length;
    }
  }
  const after = rest.slice(pos);
  // A breakdown, not a level: "16 of those are COGS — 11.8 from dairy, …".
  if (/^\s*from\s+(?!\$?\d|two|2\b|last|the prior|a year)/i.test(after)) return [];
  // A share of something else is not this item's level; a share item's quote
  // must say what it is a share of.
  const ofWhat = /^\s*of\s+(?:the\s+|that\s+|this\s+)?([\w-]+(?:\s+[\w-]+)?)/i.exec(after)?.[1]?.toLowerCase();
  if (a.of) { if (!ofWhat || !a.of.some(o => ofWhat.startsWith(o.toLowerCase()))) return []; }
  else if (ofWhat && !/^(?:revenue|sales|rev)\b/.test(ofWhat)) return [];
  // Arithmetic on the last figure ("58/110") ends the quote before it.
  if (/^\s*(?:[/÷×*]|divided|times)/.test(after) && out.length > 0) out.pop();
  return out;
}

const unitsFit = (cand: Unit, item: Unit) => cand === item || cand === 'plain' || item === 'plain' || (cand === 'dollar' && item === 'percent');
function allowed(f: Fig, targets: { value: number; unit: Unit }[]): boolean {
  const decimals = f.text.match(/\.(\d+)/)?.[1].length ?? 0;
  const rounding = decimals === 0 ? 0.5 : 0.5 * 10 ** -decimals;
  const hedged = /\b(?:about|roughly|around|approximately|nearly|almost)\b|~/i.test(f.text);
  // A hedged figure may be a round version of the true one: a multiple of 10
  // within 5, of 5 within 2.5 ("roughly 40%" for 37.5%, "about 60%" for 58%);
  // "about 44%" for 42% is not a rounding, it's a misquote.
  const roundness = f.value % 10 === 0 ? 5 : f.value % 5 === 0 ? 2.5 : rounding;
  return targets.some(t => unitsFit(f.unit, t.unit) && Math.abs(f.value - t.value) <= (hedged ? Math.max(rounding, roundness) : rounding) + 1e-9);
}

// The figures an item states (its timeframes, unit read from its value
// text), the shown exhibit's column for it, and its own change in points and
// relative terms ("COGS is 16", "rose 38%").
function itemTargets(item: LedgerItem, exhibitCol: number[]): { value: number; unit: Unit }[] {
  const tf = item.timeframes ?? {};
  const stated = Object.keys(tf).map(n => {
    const m = new RegExp(`(\\$)?${n.replace('.', '\\.')}\\s*(%|percent|stores)?`).exec(item.value);
    const unit: Unit = m?.[1] ? 'dollar' : m?.[2] === 'stores' ? 'count' : m?.[2] ? 'percent' : 'plain';
    return { value: Number(n), unit };
  });
  const cur = Object.entries(tf).find(([, p]) => p === 'current')?.[0];
  const pri = Object.entries(tf).find(([, p]) => p === 'prior')?.[0];
  // An item stated for both periods is unchanged: its change is 0 ("labor 0").
  const derived = cur !== undefined && pri !== undefined
    ? [{ value: Number(cur) - Number(pri), unit: 'plain' as Unit }, { value: Math.round(((Number(cur) - Number(pri)) / Number(pri)) * 1000) / 10, unit: 'percent' as Unit }]
    : Object.values(tf).includes('both') ? [{ value: 0, unit: 'plain' as Unit }, { value: 0, unit: 'percent' as Unit }] : [];
  return [...stated, ...exhibitCol.map(v => ({ value: v, unit: 'percent' as Unit })), ...derived];
}

// A requirement or target is no quote either (Lorenzo, 14 Oct; Marcus db0e42c3 t9:
// "to get COGS back …, I need revenue up about 28%" was corrected to the 15% growth).
const HYPOTHETICAL = /\b(?:if|suppose|assume|assuming|say|would|could|will|target|scenario|pro forma|after a|post-|next year|another year|going forward|trend continues|in a year|need|needs|needed|have to|has to|must|requires?|required|to get|to restore|to recover)\b/i;
const INDEXED_OR_ARITHMETIC = /\bindex|\bbase(?:line)?\b|\$100 of revenue|\brevenue (?:at |of )?1\d\d\b|\bon 1\d\d\b|\bcall [\w ]{0,20}\b100\b|[=÷×≈−]|\s-\s|\bdivided by\b|\btimes\b|\bminus\b|\bextrapolat|\brun rate\b|\bone more year\b|\bproject(?:ed|ion)?\b|\bnext year\b|\bwould\b|\bof the (?:problem|decline|gap|story|drop|change|increase|swing|deterioration)\b/i;
const INDEXED_MESSAGE = /\bindex|\bbase-?100\b|\bon 1\d\d\b|\brevenue (?:of |at )?1\d\d\b/i;
const PREPOSITION = /\b(?:in|of|within|inside|into|from|with)\s+(?:the\s+|total\s+)?$/i;
const CONCLUSION = /\b(?:so|which (?:makes|puts)|that (?:puts|makes|takes)|meaning|new|takes)\s+(?:the\s+)?$/i;
const SUM = /(?:\bplus|\band|\+|&)\s+$/i;
const CONTRAST = /\b(?:but|whereas|while|versus|vs\.?|compared)\b/i;
const ARITH = /[=÷×/*]|\bover\b|\bdivided\b|\btimes\b|\bminus\b|\bplus\b|\bgives\b/i;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type MisquoteContext = {
  anchors: QuoteAnchor[];
  ledger: LedgerItem[];
  revealedIds: Set<string>;
  exhibitColumns: Record<string, number[]>;   // item id → a shown exhibit's figures for it
  guards?: boolean;                           // false: the bare grammar (labelling only)
};

// A shown exhibit's column for each item, matched by column name to the item's anchors.
export function exhibitColumns(anchors: QuoteAnchor[], shown: { data: Record<string, unknown>[] }[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const e of shown) for (const col of Object.keys(e.data[0] ?? {})) {
    const a = anchors.find(q => q.names.some(n => n.toLowerCase() === col.toLowerCase()));
    if (a) out[a.item] = e.data.map(r => Number(r[col])).filter(Number.isFinite);
  }
  return out;
}

export function findMisquotes(text: string, c: MisquoteContext): Misquote[] {
  const guards = c.guards ?? true;
  const out: Misquote[] = [];
  const seen = new Set<string>();
  // An indexed message restates every figure on its own base.
  if (guards && INDEXED_MESSAGE.test(text)) return out;
  const sentences = normalizeNumberWords(text).split(/(?<=[.?!])\s+|\n+/).map(x => x.trim());
  // A figure the candidate computed earlier in the message is theirs.
  const computedEarlier = (v: number, idx: number) => sentences.slice(0, idx)
    .some(x => ARITH.test(x) && new RegExp(`(?<![\\d.])${escape(String(v))}0*(?![\\d])`).test(x));
  for (const [idx, s] of sentences.entries()) {
    const lower = s.toLowerCase();
    for (const a of c.anchors) {
      if (!c.revealedIds.has(a.item)) continue;
      const item = c.ledger.find(i => i.id === a.item);
      if (!item) continue;
      const targets = itemTargets(item, c.exhibitColumns[a.item] ?? []);
      const curKey = Object.entries(item.timeframes ?? {}).find(([, p]) => p === 'current' || p === 'both')?.[0];
      const current = curKey !== undefined ? Number(curKey) : undefined;
      // Every quote of this item in the sentence, so a correct one elsewhere can mark a contrast.
      const occurrences: { name: string; quoted: Fig[] }[] = [];
      for (const n of a.names) {
        for (const m of lower.matchAll(new RegExp(`\\b${escape(n.toLowerCase())}\\b`, 'g'))) {
          const before = s.slice(0, m.index ?? 0);
          if (guards && (HYPOTHETICAL.test(before) || INDEXED_OR_ARITHMETIC.test(s) || CONCLUSION.test(before.slice(-25))
            || SUM.test(before.slice(-12)) || PREPOSITION.test(before.slice(-20)))) continue;
          // The anchor already quoted ("a $6.80 ticket is about $0.34"): what follows is another quantity.
          const pre = /(\$)?(\d+(?:\.\d+)?)\s*(%)?\s*$/.exec(before);
          if (guards && pre && allowed({ value: Number(pre[2]), unit: pre[1] ? 'dollar' : pre[3] ? 'percent' : 'plain', text: pre[0].trim() }, targets)) continue;
          occurrences.push({ name: n, quoted: quotedAfter(s.slice((m.index ?? 0) + n.length), a, current) });
        }
      }
      for (const o of occurrences) for (const f of o.quoted) {
        if (allowed(f, targets)) continue;
        // A contrast with the correct figure, stated in another mention of the item.
        if (guards && CONTRAST.test(s) && occurrences.some(x => x !== o && x.quoted.some(g => allowed(g, targets)))) continue;
        if (guards && computedEarlier(f.value, idx)) continue;
        // The same word names another revealed item that states it ("beans were 25%" / "beans up 40%").
        const shared = c.anchors.filter(x => x.item !== a.item && c.revealedIds.has(x.item) && x.names.includes(o.name));
        if (shared.some(x => { const it = c.ledger.find(i => i.id === x.item); return it && allowed(f, itemTargets(it, c.exhibitColumns[x.item] ?? [])); })) continue;
        const key = `${a.item}:${f.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ item: a.item, cited: f.text, sentence: s.slice(0, 220) });
      }
    }
  }
  return out;
}

// The correction code speaks: one flat sentence in the ledger's own words
// (Rule 6 option 4 — a factual reset, no discussion). FR-4: the value is
// already revealed, so it adds no new figure.
// One or two corrections in one data line: "To correct two figures: COGS is
// 58% of revenue today, up from 42% two years ago. And revenue grew 15% over
// the past two years."
// `lead`: the connecting words around the ledger's (phrasing.ts correct_one / correct_two); by default the original.
export function correctionLines(values: string[], lead: { one: (x: string) => string; two: (x: string) => string } = DEFAULT_LEAD): string {
  if (values.length <= 1) return correctionLine(values[0] ?? '', lead.one);
  const lower = (v: string) => { const first = v.split(/\s+/)[0] ?? ''; return first === first.toUpperCase() && /[A-Z]/.test(first) ? v : v.charAt(0).toLowerCase() + v.slice(1); };
  return lead.two(`${lower(values[0].trim())} And ${lower(values[1].trim())}`);
}
const DEFAULT_LEAD = { one: (x: string) => `To correct one figure: ${x}`, two: (x: string) => `To correct two figures: ${x}` };

export function correctionLine(value: string, lead: (x: string) => string = DEFAULT_LEAD.one): string {
  const v = value.trim();
  const first = v.split(/\s+/)[0] ?? '';
  const keepCase = first === first.toUpperCase() && /[A-Z]/.test(first);
  return lead(keepCase ? v : v.charAt(0).toLowerCase() + v.slice(1));
}
