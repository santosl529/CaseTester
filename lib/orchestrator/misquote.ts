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

// `scope`: a route- or entity-scoped anchor (Phase 1, Lorenzo's pre-wave ruling 9). A bare quantity name
// ("fare") that counts only when one of these words is named earlier in the same sentence, so
// "On Lakeport, the exhibit shows fare down to $125" is read as a Lakeport fare and "Port Avery's fare is
// $160" is not. A scoped name is never a free-standing name for the item (fact-check.ts buildFactBase).
export type QuoteAnchor = { item: string; names: string[]; kind: 'level' | 'change'; of?: string[]; scope?: string[] };
type LedgerItem = { id: string; value: string; timeframes?: Record<string, string> };
type Unit = 'percent' | 'dollar' | 'count' | 'plain';
// `value` as said; `scale` the word after it ("$77 million": 77 × 10⁶; 1 when none).
type Fig = { value: number; unit: Unit; text: string; scale: number };
// `decimals`: as the item states it ("1.2" million: 1), the precision a figure written in full is read to.
type Target = { value: number; unit: Unit; scale: number; decimals?: number };
export type Misquote = { item: string; cited: string; sentence: string };

// One figure: "$6.90", "61%", "61 percent", "200 stores", "~58", "$1,200". A full stop
// ends a figure ("The shelf price is $4.49." was never read; Lorenzo, 19 Oct, §15 p);
// thousands commas are one figure, not "$1" (§15 c); a scale word is read with
// it ("$77 million" against the item's "$80 million"; §15 p), never without it.
export const SCALE = String.raw`million|mn|m|billion|bn|b|thousand|k`;
const FIG = String.raw`(?:about|roughly|around|approximately|nearly|almost|~)?\s*(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(${SCALE})\b)?(?!\d|[.,]\d|[a-wyz])(?!\s*(?:-|\s)?(?:points?|pts|pp|years?|x\b|×|m\b|mn\b|million|b\b|bn\b|billion|k\b|thousand|cents?|ways|things|reasons|levers|times|months))\s*(%|percent|stores|locations)?`;
// "you gave / you said" attributes the figure ("Prevalence you gave is 1.5%" — batch-32 Aldermoor Tyler t9; Lorenzo, 19 Oct).
const LINK_LEVEL = String.raw`(?:\s*(?:you (?:gave|said|mentioned|quoted)(?: (?:me|us))?|is|was|were|are|'s|at|sits at|stood at|stands at|now|today|currently|then|came in at|:|—|–|-|it|has us at|of revenue|as a percent of revenue|as a share of revenue|(?:went|goes|going|moved|moves|rose|climbed|grew|fell|dropped|jumped|increased|starts|started|ends|ended|ran|runs|up|down)\s+(?:from|to|at)|from)\s*)*`;
const LINK_CHANGE = String.raw`\s*(?:(?:are|were|is|was|have|has|went|gone|got|been|prices|costs?)\s+)*(?:up|rose|risen|increased|grew|climbed|jumped)\s+(?:by\s+)?`;
const CHAIN_NEXT = String.raw`(?:\s*of revenue)?\s*(?:to|→|->|–|—|then|and then|,|and ends at|and ended at|and is now|now)\s*`;

const num = (x: string) => Number(x.replace(/,/g, ''));
const scaleOf = (w?: string) => !w ? 1 : /^(?:b|bn|billion)$/i.test(w) ? 1e9 : /^(?:k|thousand)$/i.test(w) ? 1e3 : 1e6;

function fig(m: RegExpExecArray, i: number): Fig {
  const unit: Unit = m[i] ? 'dollar' : m[i + 3] && /^(%|percent)/.test(m[i + 3]) ? 'percent' : m[i + 3] ? 'count' : 'plain';
  return { value: num(m[i + 1]), unit, text: m[0].trim(), scale: scaleOf(m[i + 2]) };
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
// A figure said with a scale compares at full scale; one without, as said ("selling costs are $80").
function allowed(f: Fig, targets: Target[]): boolean {
  const decimals = f.text.match(/\.(\d+)/)?.[1].length ?? 0;
  const rounding = decimals === 0 ? 0.5 : 0.5 * 10 ** -decimals;
  const hedged = /\b(?:about|roughly|around|approximately|nearly|almost)\b|~/i.test(f.text);
  // A hedged figure may be a round version of the true one: a multiple of 10
  // within 5, of 5 within 2.5 ("roughly 40%" for 37.5%, "about 60%" for 58%);
  // "about 44%" for 42% is not a rounding, it's a misquote.
  const roundness = f.value % 10 === 0 ? 5 : f.value % 5 === 0 ? 2.5 : rounding;
  return targets.some(t => unitsFit(f.unit, t.unit)
    && (Math.abs(f.scale === 1 ? f.value - t.value : f.value * f.scale - t.value * t.scale) <= (hedged ? Math.max(rounding, roundness) : rounding) * f.scale + 1e-9
      || (f.scale === 1 && t.scale > 1 && inFull(f.value / t.scale, t, hedged))));
}
// A figure written in full against an item stated at scale ("$1,200,000" for "$1.2 million"; Task 9 review):
// read at the item's scale, to the item's precision — or, hedged, as a round figure there ("about $1,000,000").
function inFull(v: number, t: Target, hedged: boolean): boolean {
  const r = 0.5 * 10 ** -(t.decimals ?? 0);
  const round = v % 10 === 0 ? 5 : v % 5 === 0 ? 2.5 : Number.isInteger(v) ? 0.5 : r;
  return Math.abs(v - t.value) <= (hedged ? Math.max(r, round) : r) + 1e-9;
}

// The figures an item states (its timeframes, unit read from its value
// text), the shown exhibit's column for it, and its own change in points and
// relative terms ("COGS is 16", "rose 38%"). Each figure's scale is the word
// after it in the value ("$1.2 million").
function itemTargets(item: LedgerItem, exhibitCol: number[]): Target[] {
  const tf = item.timeframes ?? {};
  const stated = Object.keys(tf).map(n => {
    const m = new RegExp(`(\\$)?${n.replace('.', '\\.')}(?:\\s?(${SCALE})\\b)?\\s*(%|percent|stores)?`, 'i').exec(item.value);
    const unit: Unit = m?.[1] ? 'dollar' : m?.[3] === 'stores' ? 'count' : m?.[3] ? 'percent' : 'plain';
    return { value: num(n), unit, scale: scaleOf(m?.[2]), decimals: n.split('.')[1]?.length ?? 0 };
  });
  const cur = Object.entries(tf).find(([, p]) => p === 'current')?.[0];
  const pri = Object.entries(tf).find(([, p]) => p === 'prior')?.[0];
  // An item stated for both periods is unchanged: its change is 0 ("labor 0").
  const derived = cur !== undefined && pri !== undefined
    ? [{ value: num(cur) - num(pri), unit: 'plain' as Unit, scale: stated.find(t => t.value === num(cur))?.scale ?? 1 }, { value: Math.round(((num(cur) - num(pri)) / num(pri)) * 1000) / 10, unit: 'percent' as Unit, scale: 1 }]
    : Object.values(tf).includes('both') ? [{ value: 0, unit: 'plain' as Unit, scale: 1 }, { value: 0, unit: 'percent' as Unit, scale: 1 }] : [];
  return [...stated, ...exhibitCol.map(v => ({ value: v, unit: 'percent' as Unit, scale: 1 })), ...derived];
}

// A requirement or target is no quote either (Lorenzo, 14 Oct; Marcus db0e42c3 t9:
// "to get COGS back …, I need revenue up about 28%" was corrected to the 15% growth).
const HYPOTHETICAL = /\b(?:if|suppose|assume|assuming|say|would|could|will|target|scenario|pro forma|after a|post-|next year|another year|going forward|trend continues|in a year|need|needs|needed|have to|has to|must|requires?|required|to get|to restore|to recover)\b/i;
// Index, projection and share words cover the whole sentence; arithmetic only
// the sentence up to the end of the anchor's clause (see clauseEnd).
const INDEXED_OR_PROJECTED = /\bindex|\bbase(?:line)?\b|\$100 of revenue|\brevenue (?:at |of )?1\d\d\b|\bon 1\d\d\b|\bcall [\w ]{0,20}\b100\b|\bextrapolat|\brun rate\b|\bone more year\b|\bproject(?:ed|ion)?\b|\bnext year\b|\bwould\b|\bof the (?:problem|decline|gap|story|drop|change|increase|swing|deterioration)\b/i;
const ARITHMETIC = /[=÷×≈−]|\s-\s|\bdivided by\b|\btimes\b|\bminus\b/i;
const INDEXED_MESSAGE = /\bindex|\bbase-?100\b|\bon 1\d\d\b|\brevenue (?:of |at )?1\d\d\b/i;
const PREPOSITION = /\b(?:in|of|within|inside|into|from|with)\s+(?:the\s+|total\s+)?$/i;
// A scoped anchor's name is a bare quantity word ("fare"), so a modifier right before it makes another quantity:
// the candidate's own break-even, target or budget figure, never a quote of the ledger. Only scoped anchors read
// this — an unscoped name carries its own quantity (Lorenzo's pre-wave ruling 9; b22l Raj 07 t24
// "Lakeport's breakeven fare is $130", his own derived figure, was the one false flag the corpus sweep found).
const SCOPED_MODIFIER = /\b(?:break-?even|breakeven|target|targeted|required|implied|budget|budgeted|planned|planning|hold|holding|keep|keeping)\s+$/i;
const CONCLUSION = /\b(?:so|which (?:makes|puts)|that (?:puts|makes|takes)|meaning|new|takes)\s+(?:the\s+)?$/i;
const SUM = /(?:\bplus|\band|\+|&)\s+$/i;
const CONTRAST = /\b(?:but|whereas|while|versus|vs\.?|compared)\b/i;
const ARITH = /[=÷×/*]|\bover\b|\bdivided\b|\btimes\b|\bminus\b|\bplus\b|\bgives\b/i;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Where the anchor's clause ends (", ; so", not a thousands comma): arithmetic
// in a later clause leaves its quote standing ("Prevalence you gave is 1.5%, so
// 250 × 0.015 = …" — batch-32 Aldermoor Tyler t9; Lorenzo, 19 Oct, §15 p), unless
// the quoted figure is an operand there ("COGS today is 66.7, so … 66.7 minus 14.4" — Marisol b18 t9).
function clauseEnd(s: string, from: number): number {
  for (const b of s.matchAll(/,(?!\d)|;|\bso\b/gi)) if ((b.index ?? 0) >= from) return b.index ?? s.length;
  return s.length;
}
// A figure the candidate ATTRIBUTES to the interviewer — "prevalence you gave me is 1.5%", "you said Nimbrel's net
// price is about $9,400" — is a quote of the data by the candidate's own account, so using it as an operand in a
// later clause is the misquote propagating, not evidence that the figure is their own working (batch 39, aldermoor
// p64 4df38465 t6: "Prevalence you gave me is 1.5%, so 260 million × 1.5% = 3.9 million" was dropped by
// `operandLater`, which exists for the candidate's own derived figures — Marisol b18 t9's "COGS today is 66.7,
// so … 66.7 minus 14.4"). Attribution turns that one guard off; the hypothetical, indexed, conclusion, sum and
// preposition guards all still apply ("if you gave me 1.5%" is still a hypothetical).
const ATTRIBUTED = /\byou(?:'ve| have)?\s+(?:gave|given|said|mentioned|quoted|told)\b/i;
const operandLater = (f: Fig, later: string) => {
  const n = escape(f.text.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? '');
  return n !== '' && new RegExp(String.raw`(?<![\d.,])\$?${n}(?![\d]|[.,]\d)\s*(?:[-−+×*/÷]|minus\b|plus\b|times\b|over\b|divided\b)|(?:[-−+×*/÷=≈]|\bminus|\bplus|\btimes|\bover|\bdivided by)\s*\$?${n}(?![\d]|[.,]\d)`, 'i').test(later);
};

export type MisquoteContext = {
  anchors: QuoteAnchor[];
  ledger: LedgerItem[];
  revealedIds: Set<string>;
  exhibitColumns: Record<string, number[]>;   // item id → a shown exhibit's figures for it
  guards?: boolean;                           // false: the bare grammar (labelling only)
  attribution?: boolean;                      // `misquoteAttribution`: an attributed quote is not excused by a later operand use
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
      const current = curKey !== undefined ? num(curKey) : undefined;
      // Every quote of this item in the sentence, so a correct one elsewhere can mark a contrast.
      const occurrences: { name: string; quoted: Fig[] }[] = [];
      for (const n of a.names) {
        for (const m of lower.matchAll(new RegExp(`\\b${escape(n.toLowerCase())}\\b`, 'g'))) {
          const before = s.slice(0, m.index ?? 0);
          // A scoped anchor needs its route named before the quantity, in this sentence, and nothing right
          // before the bare name that makes it another quantity.
          if (a.scope?.length && (!a.scope.some(w => before.toLowerCase().includes(w.toLowerCase())) || SCOPED_MODIFIER.test(before))) continue;
          const end = clauseEnd(s, (m.index ?? 0) + n.length);
          if (guards && (HYPOTHETICAL.test(before) || INDEXED_OR_PROJECTED.test(s) || ARITHMETIC.test(s.slice(0, end)) || CONCLUSION.test(before.slice(-25))
            || SUM.test(before.slice(-12)) || PREPOSITION.test(before.slice(-20)))) continue;
          // The anchor already quoted ("a $6.80 ticket is about $0.34"): what follows is another quantity.
          const pre = new RegExp(String.raw`(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(${SCALE})\b)?\s*(%)?\s*$`, 'i').exec(before);
          if (guards && pre && allowed({ value: num(pre[2]), unit: pre[1] ? 'dollar' : pre[4] ? 'percent' : 'plain', text: pre[0].trim(), scale: scaleOf(pre[3]) }, targets)) continue;
          const rest = s.slice((m.index ?? 0) + n.length);
          const attributed = Boolean(c.attribution) && (ATTRIBUTED.test(before.slice(-40)) || ATTRIBUTED.test(rest.slice(0, 30)));
          const quoted = quotedAfter(rest, a, current);
          occurrences.push({ name: n, quoted: guards && !attributed && ARITHMETIC.test(s.slice(end)) ? quoted.filter(f => !operandLater(f, s.slice(end))) : quoted });
        }
      }
      for (const o of occurrences) for (const f of o.quoted) {
        if (allowed(f, targets)) continue;
        // A figure at scale quotes only an item stated at scale ("Labor $106M" is no labor share — Nikhil b17 t39).
        if (f.scale > 1 && !targets.some(t => t.scale > 1)) continue;
        // A change said in points carries its unit on ("Beans rose about 4 points of revenue;
        // dairy, packaging and food rose about 12." — Camila b18 t13, read once a full stop ends a figure).
        if (guards && a.kind === 'change' && f.unit === 'plain' && /\d\s*-?\s*(?:points?|pts|pp)\b/i.test(s)) continue;
        // A contrast with the correct figure, stated in another mention of the item.
        if (guards && CONTRAST.test(s) && occurrences.some(x => x !== o && x.quoted.some(g => allowed(g, targets)))) continue;
        if (guards && computedEarlier(f.value, idx)) continue;
        // The same word names another revealed item that states it ("beans were 25%" / "beans up 40%").
        const shared = c.anchors.filter(x => x.item !== a.item && c.revealedIds.has(x.item) && x.names.includes(o.name));
        if (shared.some(x => { const it = c.ledger.find(i => i.id === x.item); return it && allowed(f, itemTargets(it, c.exhibitColumns[x.item] ?? [])); })) continue;
        const key = `${a.item}:${f.value * f.scale}`;
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
