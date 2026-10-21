// The qualifier guard for bare partial answers (round 5c Task 61; Lorenzo, 20 Oct,
// ruling 1): "If an ask names a qualifier the item's line doesn't contain (a period:
// FY2024, "since <date>", "today/current", "beyond month N", "later/earlier cohorts",
// "trend"; a scope: industry, competitor(s), market; or a second topic with no item),
// that item counts as partial whatever Haiku labels it, and the refusal names the
// qualifier ("I don't have FY2024 fares.", "I don't have industry benchmarks.")."
// r5b-haiku-check #18, 36, 49/50, 63, 66: Haiku called an item "full" that answers a
// neighbouring question (a company figure for an industry benchmark, the Jan–Mar cohort
// for later cohorts, a static CAC for a CAC trend, FY2023→FY2025 for FY2024).
//
// Read in code, on the check's verdicts only (turn-data.ts checkAsk): the ask's words,
// and each mapped item's label and line — the ledger value, server-side, never sent to
// a model. The refusal phrase is built from the ask's own words only (FR-4): no word
// the ask lacks, no figure the ask lacks (the caller also checks the candidate said it).
import { contentStems } from './data-requests';

export type Qualifier = { kind: 'period' | 'scope' | 'topic'; text: string };
// `years`: the years the item's periods stand for when its line names none (qualifierItems).
// `anyYear`: the case names no compared years and the line no year, so no asked year can be ruled out (fix round 2).
export type QualifierItem = { id: string; label: string; value: string; years?: string[]; anyYear?: true };

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec';
// Period forms, in priority order: a span an earlier form claims is not read again
// ("since January 2025" holds its year; "Q3 2024" its year).
const SINCE = new RegExp(`\\bsince\\s+(?:the\\s+)?(?:(?:early|mid|late)[-\\s])?(?:(?:${MONTHS})\\s+)?(?:(?:FY|CY)\\s?)?(?:\\d{4}|launch)(?:\\s+launch)?\\b`, 'gi');
const BEYOND = /\b(?:beyond|after|past)\s+(?:the\s+)?(?:month|week|year)\s+\d+\b/gi;
const FISCAL = /\b(?:FY|CY)\s?'?\d{2}(?:\d{2})?\b/gi;
const QUARTER = /\bQ[1-4](?:\s+(?:FY\s?)?\d{4})?\b/g;
const YEAR = /\b(?:19|20)\d{2}\b/g;
const NOW = /\b(?:today|current(?:ly)?|now|this year)\b/gi;
const COHORTS = /\b(?:later|earlier|newer|older|more recent|recent|subsequent)\s+cohorts?\b/gi;
const TREND = /\b(?:trends?|trajectory|over time|year[-\s]over[-\s]year|(?:has|have)\s+(?:moved|changed))\b/gi;
const PERIODS = [SINCE, BEYOND, FISCAL, QUARTER, YEAR, NOW, COHORTS, TREND];
// Scopes: whose figure (the industry's, competitors', the market's). "market share",
// "market size" and "market growth" name a quantity, not a scope.
const SCOPE = /\b(?:industry(?:-wide)?|competitors?|competitive|competition|market(?:-wide)?(?!\s+(?:share|size|sizing|growth))|benchmarks?)\b/gi;

type Span = { kind: 'period' | 'scope'; text: string; at: number; end: number };
function spans(what: string): Span[] {
  const out: Span[] = [];
  const free = (a: number, b: number) => out.every(s => b <= s.at || a >= s.end);
  for (const [kind, res] of [['period', PERIODS], ['scope', [SCOPE]]] as const) {
    for (const re of res) {
      for (const m of what.matchAll(re)) {
        const at = m.index ?? 0, end = at + m[0].length;
        if (free(at, end)) out.push({ kind, text: m[0], at, end });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// One stem per word, the `missing` rule's (data-requests.ts), and "-ing" or "-ed" off a
// stem long enough ("pricing" is "price", "contracting" "contract", "launched" "launch").
const ING = (w: string) => (w.length >= 7 && w.endsWith('ing') ? w.slice(0, -3) : w.length >= 7 && w.endsWith('ed') ? w.slice(0, -2) : w);
const stems = (t: string) => contentStems(t).map(ING);
// Period vocabulary ("both years", "two years ago versus today", "year one versus today")
// and quantifiers ("how each moved") are no content noun of a conjunct.
const QUALIFIER_WORDS = new Set(stems(`today current currently now this year years trend trends trajectory over time moved changed later earlier newer older recent
subsequent since beyond after past month months week weeks both ago prior previous period periods first last one two three four five six seven eight nine ten
eleven twelve each every all same`));
// A conjunct's own content: its content words, qualifier words and figures aside.
const nounsOf = (t: string) => stems(t).filter(w => !QUALIFIER_WORDS.has(w) && !/^(?:fy|cy|q)$/.test(w));

// The ask's conjuncts: split at list breaks (a comma not inside a figure, "and", "or", …);
// a piece with no noun phrase of its own ("FY2025" in "across FY2024 and FY2025", "both
// years", "dairy" in "by coffee, dairy and packaging": one bare noun) stays with its
// neighbour. One ask, never split: a question ("whether the locations are company-owned
// or franchised", "how …"); a break inside parentheses, after "between", or inside a
// clause ("where Nimbrel has exclusive or preferred status").
const LIST_BREAK = /\s*(?:,(?!\d)|;|&|\bas well as\b|\bincluding\b|\bplus\b|\band\b|\bor\b)\s*/gi;
const QUESTION = /^(?:whether|if|how|what|which|when|where|why)\b/i;
const OPEN_CLAUSE = /\b(?:between|where|which|that|who|whether|if)\b/i;
function conjuncts(what: string): string[] {
  const ask = what.replace(/\s+/g, ' ').trim();
  if (QUESTION.test(ask)) return [ask];
  const inParens = (i: number) => (ask.slice(0, i).match(/\(/g)?.length ?? 0) > (ask.slice(0, i).match(/\)/g)?.length ?? 0);
  const pieces: { at: number; end: number }[] = [];
  let last = 0;
  for (const m of ask.matchAll(LIST_BREAK)) {
    const i = m.index ?? 0;
    if (inParens(i) || OPEN_CLAUSE.test(ask.slice(last, i))) continue;
    pieces.push({ at: last, end: i });
    last = i + m[0].length;
  }
  pieces.push({ at: last, end: ask.length });
  const out: { at: number; end: number }[] = [];
  // Its own noun phrase: two content nouns, or one led by an article ("the FY2024 fare"; fix round 2).
  const nouns = (x: { at: number; end: number }) => {
    const t = ask.slice(x.at, x.end).trim();
    const n = nounsOf(t).length;
    return n >= 2 || (n === 1 && /^(?:the|a|an)\s/i.test(t));
  };
  for (const p of pieces.filter(x => ask.slice(x.at, x.end).trim())) {
    const prev = out.at(-1);
    if (prev && (!nouns(p) || !nouns(prev))) prev.end = p.end;   // a piece with no noun phrase of its own joins its neighbour
    else out.push({ ...p });
  }
  return out.map(x => ask.slice(x.at, x.end).trim());
}

export function askQualifiers(what: string): Qualifier[] {
  const qs: Qualifier[] = spans(what).map(s => ({ kind: s.kind, text: s.text }));
  const parts = conjuncts(what);
  if (parts.length >= 2) qs.push(...parts.map(text => ({ kind: 'topic' as const, text })));
  return qs;
}

// ---- Whether an item's label + line states a qualifier ----
const YEARS = (t: string) => new Set([...t.matchAll(/\b(?:(?:FY|CY)\s?'?)?(\d{4}|\d{2})\b/gi)]
  .filter(m => m[1].length === 4 || /^(?:FY|CY)/i.test(m[0])).map(m => (m[1].length === 2 ? `20${m[1]}` : m[1])));
// A change the line states: a from/to, a rise or fall, a level held steady ("no material
// changes", "the same six routes as in FY2023"; fix round 2), or two periods.
const CHANGE = /\bfrom\s+\$?\d[^.;]{0,40}?\bto\s+\$?\d|\bno (?:material |real |significant |major )?changes?\b|\bthe same\b[^.;]{0,60}\bas\b|\b(?:did not|didn['’]t|does not|doesn['’]t) (?:materially )?change\b(?! with)|\b(?:up|down)\s+(?:from\b|about\s+\$?\d|\$?\d|slightly|sharply)|\b(?:rose|fell|grew|declined|dropped|increased|decreased|doubled|halved)\b|\b(?:has|have|hasn['’]t|haven['’]t)\s+(?:not\s+)?(?:been\s+)?(?:changed|stable|flat|steady)\b|\b(?:stayed|remained)\s+(?:roughly\s+)?(?:steady|flat|stable|the same)\b|\bunchanged\b|\bflat\b|\bstable\b|\b(?:trends?|trajectory|over time|year[-\s]over[-\s]year)\b|\(covers (?:the current and prior period|the change over the period)\)/i;
// A series over time is a trend too (fix round 2): "after month 1, … month 3, … month 12", "by quarter".
const SERIES = /\b(?:month to month|month by month|quarter by quarter|year by year|by (?:month|quarter|year)|each (?:month|quarter|year))\b/i;
const seriesPoints = (t: string) => new Set([...t.matchAll(/\b(?:month|quarter|week|year)s?\s+(\d+)/gi)].map(m => m[1])).size;
const statesTrend = (t: string) => CHANGE.test(t) || YEARS(t).size >= 2 || (/\b(?:today|now|current)\b/i.test(t) && /\bago\b/i.test(t))
  || SERIES.test(t) || seriesPoints(t) >= 2;
const PAST = /\b(?:ago|prior|previous|last year|(?:19|20)\d{2}|FY\s?\d{2})\b/i;
const statesNow = (t: string) => /\b(?:today|current(?:ly)?|now|this year|still)\b/i.test(t) || /\(covers the current/i.test(t)
  || (!/\(covers /.test(t) && !PAST.test(t));   // an item with no period of its own and no past: the current state
// A scope is met when the item's label or line already carries it (fix round 2, the
// controller's ruling): a market's size or demand, the category's prices, a typical or
// average figure from past launches.
const SCOPE_SYNONYMS: Record<string, RegExp> = {
  industry: /\b(?:industry|industry-wide|typical(?:ly)?|often|usually|category|sector|market|overall|demand|competing|competitors?)\b/i,
  market: /\b(?:market|industry|category|sector|competing|competitors?|demand|patients|adults|eligible|total|overall|size)\b/i,
  // A named rival with no "competitor" word on its line: "the current standard" (Aldermoor's Nimbrel), "a low-cost
  // airline", "other brands", "How Kelvexa compares with Nimbrel" — read leniently: a missed guard leaves Haiku's verdict; a false one refuses held data.
  competitor: /\b(?:competitors?|competitive|competition|competing|rivals?|standard|low-cost|other (?:airlines?|brands?|players?|companies|drugs?)|brands|compare[sd]? with|versus)\b/i,
  benchmark: /\b(?:benchmarks?|industry|typical(?:ly)?|average|comparable|historical|often|usually)\b|\b(?:past|previous|prior|last)\s+(?:\w+\s+)?launches\b/i,
};
function statesScope(q: string, t: string): boolean {
  const w = q.toLowerCase();
  const key = w.startsWith('industr') ? 'industry' : w.startsWith('market') ? 'market' : w.startsWith('benchmark') ? 'benchmark' : 'competitor';
  return SCOPE_SYNONYMS[key].test(t);
}
function statesPeriod(q: string, t: string, years: Set<string>): boolean {
  if (TREND_ONE.test(q)) return statesTrend(t) || years.size >= 2;
  if (/^since\b/i.test(q)) {
    // The date with its FY/CY prefix optional on either side ("since FY2023" on "hasn't changed since FY2023").
    const year = q.match(/\d{4}/)?.[0];
    const date = year ? `(?:(?:FY|CY)\\s?)?${year}\\b` : 'launch\\w*';
    const sinceSaid = new RegExp(`\\bsince\\b[^.;]{0,24}\\b${date}`, 'i').test(t);
    return sinceSaid || (new RegExp(`\\b${date}`, 'i').test(t) && statesTrend(t));
  }
  const beyond = /^(?:beyond|after|past)\s+(?:the\s+)?(month|week|year)\s+(\d+)/i.exec(q);
  if (beyond) {
    const [, unit, n] = beyond;
    if (new RegExp(`\\b(?:beyond|after|past)\\s+(?:the\\s+)?${unit}\\s+${n}\\b`, 'i').test(t)) return true;
    return [...t.matchAll(new RegExp(`\\b${unit}s?\\s+(\\d+)`, 'gi'))].some(m => Number(m[1]) > Number(n));
  }
  if (/^Q[1-4]/.test(q)) return new RegExp(`\\b${q.slice(0, 2)}\\b`).test(t) && [...YEARS(q)].every(y => years.has(y));
  if (FISCAL_ONE.test(q) || /^(?:19|20)\d{2}$/.test(q)) return [...YEARS(q)].every(y => years.has(y));
  if (NOW_ONE.test(q)) return statesNow(t);
  const cohort = /^(.+?)\s+cohorts?$/i.exec(q);
  if (cohort) return new RegExp(`\\b${cohort[1]}\\s+cohorts?\\b`, 'i').test(t);
  return false;
}
const YEAR_ONLY = /^(?:(?:FY|CY)\s?'?\d{2}(?:\d{2})?|(?:19|20)\d{2})$/i;
const TREND_ONE = new RegExp(`^(?:${TREND.source})$`, 'i');
const FISCAL_ONE = new RegExp(`^(?:${FISCAL.source})$`, 'i');
const NOW_ONE = new RegExp(`^(?:${NOW.source})$`, 'i');
// A topic is stated when one item's label + line has at least half its content words
// (#42 "the partner deal terms": "partner" and "terms" are on Option B's line, "deal" is
// not), a scope word counting when the line states the scope — or at least half of its
// words not common to the case (on 3+ of its items: "US" in Aldermoor; "the current US
// standard of care" is "standard care", and Nimbrel's line says "standard"). Read
// leniently: a topic missed leaves Haiku's verdict; one wrongly unmet refuses held data.
function statesTopic(topic: string, t: string, common: ReadonlySet<string>): boolean {
  const all = nounsOf(topic);
  if (all.length === 0) return true;
  const said = new Set(stems(t));
  const states = (w: string) => said.has(w) || (SCOPE_WORD.test(w) && statesScope(w, t));
  const half = (ws: string[]) => ws.length > 0 && ws.filter(states).length * 2 >= ws.length;
  return half(all) || half(all.filter(w => !common.has(w)));
}
const SCOPE_WORD = /^(?:industr|competit|market|benchmark)/i;

// The qualifiers no mapped item states. A period or scope is met by any mapped item
// that states it, a topic by any one mapped item: the refusal never denies what a
// mapped line says. `caseLines`: every item of the case, for the words common to it.
type CaseLine = { label: string; value: string };
function commonStems(caseLines: readonly CaseLine[]): Set<string> {
  const seen = new Map<string, number>();
  for (const l of caseLines) for (const w of new Set(stems(`${l.label} ${l.value}`))) seen.set(w, (seen.get(w) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n >= 3).map(([w]) => w));
}
// A period or scope inside one conjunct of two or more is judged on the items that state
// that conjunct (fix round 2, the controller's ruling on finding 5), when any does.
const lineOf = (i: QualifierItem) => `${i.label} — ${i.value}`;
const conjunctsOf = (q: Qualifier, cs: string[]) => cs.filter(c => c.toLowerCase().includes(q.text.toLowerCase()));
export function unmetQualifiers(what: string, itemLines: QualifierItem[], caseLines: readonly CaseLine[] = []): Qualifier[] {
  const common = commonStems(caseLines);
  const cs = conjuncts(what);
  const texts = itemLines.map(i => ({ i, t: lineOf(i), years: new Set([...YEARS(`${i.label} ${i.value}`), ...(i.years ?? [])]), anyYear: i.anyYear === true }));
  const judged = (q: Qualifier) => {
    if (q.kind === 'topic' || cs.length < 2) return texts;
    const own = conjunctsOf(q, cs).flatMap(c => texts.filter(x => statesTopic(c, x.t, common)));
    return own.length > 0 ? own : texts;
  };
  const met = (q: Qualifier) => judged(q).some(({ t, years, anyYear }) => (q.kind === 'topic' ? statesTopic(q.text, t, common) : q.kind === 'scope' ? statesScope(q.text, t)
    : (anyYear && YEAR_ONLY.test(q.text)) || statesPeriod(q.text, t, years)));
  return askQualifiers(what).filter(q => !met(q));
}

// The mapped items the guard makes partial. One conjunct (or a qualifier on no conjunct
// of its own): every item. Two or more (fix rounds 1 and 2, the controller's rulings: "A
// missing second topic is not a gap in the items that answer the other topics"; a period
// inside one conjunct applies only to the items that answer that conjunct): the items
// stating the conjunct an unmet period or scope sits in (a missing topic's own period is
// refused with it), and the items stating no conjunct; the rest keep Haiku's label.
export function guardedItems(what: string, itemLines: QualifierItem[], unmet: Qualifier[], caseLines: readonly CaseLine[] = []): string[] {
  const all = itemLines.map(i => i.id);
  const cs = conjuncts(what);
  if (unmet.length === 0) return [];
  if (cs.length < 2) return all;
  const common = commonStems(caseLines);
  const stating = (c: string) => itemLines.filter(i => statesTopic(c, lineOf(i), common)).map(i => i.id);
  const missing = new Set(unmet.filter(q => q.kind === 'topic').map(q => q.text));
  const out = new Set(itemLines.filter(i => !cs.some(c => statesTopic(c, lineOf(i), common))).map(i => i.id));
  for (const q of unmet.filter(x => x.kind !== 'topic')) {
    const own = conjunctsOf(q, cs);
    if (own.length === 0) return all;
    for (const c of own.filter(x => !missing.has(x))) {
      const s = stating(c);
      for (const id of s.length > 0 ? s : all) out.add(id);
    }
  }
  return all.filter(id => out.has(id));
}

// ---- The refusal phrase ----
const STOP = new Set('for of across since over in by from at on to with within beyond after past versus vs between during through has have had is are was were be been measured compared relative and or that which who'.split(' '));
const LEAD = /^(?:(?:how|what|which|when|where|why)\s+(?:much\s+|many\s+)?)?((?:the|a|an|any|our|their|its|his|her|your)\s+)?/i;
// The ask's head noun phrase: from its start (a question word and an article off, the
// article kept aside) to the first preposition or verb ("upgrade rates" of "upgrade rates
// for later cohorts").
function headOf(c: string): { text: string; at: number; article: string } | null {
  const m = LEAD.exec(c);
  const lead = m?.[0] ?? '';
  const article = (m?.[1] ?? '').trim();
  const words = c.slice(lead.length).split(' ');
  const kept: string[] = [];
  for (const w of words) {
    if (STOP.has(w.toLowerCase()) || /^(?:(?:FY|CY|Q)\d|\d)/i.test(w) || /^[(]/.test(w)) break;
    if (/[,;:()]$/.test(w)) { kept.push(w.replace(/[,;:()]+$/, '')); break; }   // a phrase ends at its punctuation
    kept.push(w);
  }
  return kept.length > 0 ? { text: kept.join(' '), at: lead.length, article } : null;
}
const plural = (w: string) => (!/^[a-z]+$/.test(w) ? null : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : /(?:s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);
const trendWord = /\s+(?:trends?|trajectory)$/i;
const isScopeHead = (h: string) => /\bbenchmarks?$/i.test(h);

// One conjunct's part: its unmet qualifiers on its head noun. A topic unmet, a trend
// alone, or a form with no phrase of its own: the conjunct as the ask says it.
function partOf(c: string, unmet: Qualifier[]): string {
  const verbatim = c.trim().replace(/[.?!]+$/, '').replace(/,\s+(and|or)\b/g, ' $1');   // "supplier count, and hedging": no comma before the joined word
  if (unmet.some(q => q.kind === 'topic') || unmet.every(q => TREND_ONE.test(q.text))) return verbatim;
  const head = headOf(verbatim);
  if (!head) return verbatim;
  const inHead = (q: Qualifier) => {
    const at = verbatim.toLowerCase().indexOf(q.text.toLowerCase());
    return at >= head.at && at + q.text.length <= head.at + head.text.length;
  };
  // "industry input cost inflation benchmarks": the scope is what is missing — "industry benchmarks".
  // The benchmark alone missing: the noun before it ("velocity benchmarks"; fix round 2: never a bare "benchmark").
  if (unmet.every(q => q.kind === 'scope') && isScopeHead(head.text)) {
    const words = head.text.split(' ');
    const noun = words.at(-1)!;
    const mods = unmet.filter(q => !noun.toLowerCase().startsWith(q.text.toLowerCase())).map(q => q.text);
    if (mods.length > 0) return [...mods, noun].join(' ');   // "industry benchmarks", the benchmark itself met or not
    const before = words.at(-2);
    if (!before) return verbatim;
    // The ask's first word loses its sentence capital ("Velocity benchmark (…)" → "velocity benchmarks").
    const said = head.at === 0 && words.length === 2 && /^[A-Z][a-z]+$/.test(before) ? before.toLowerCase() : before;
    return `${said} ${/s$/i.test(noun) ? noun : `${noun}s`}`;
  }
  // The head and the qualifiers must be the whole ask: other content after the head
  // ("coffee beans as a share | of COGS today") would be lost — the conjunct instead.
  let rest = verbatim.slice(0, head.at) + ' ' + verbatim.slice(head.at + head.text.length);
  for (const s of spans(verbatim)) rest = rest.replace(s.text, ' ');
  if (contentStems(rest).length > 0) return verbatim;
  let h = head.text;
  const years: string[] = [], pre: string[] = [], post: string[] = [];
  for (const q of unmet) {
    if (inHead(q) || TREND_ONE.test(q.text)) continue;   // said by the head already; a trend beside a period: the period says it
    if (FISCAL_ONE.test(q.text) || /^(?:19|20)\d{2}$/.test(q.text) || /^Q[1-4]/.test(q.text)) years.push(q.text);
    else if (/^current$/i.test(q.text)) pre.push(q.text);
    else if (NOW_ONE.test(q.text) || /^(?:since|beyond|after|past)\b/i.test(q.text)) post.push(q.text);
    else if (/cohorts?$/i.test(q.text) && pre.length === 0) pre.push(`${q.text}${/s$/i.test(q.text) ? '\'' : '\'s'}`);
    else return verbatim;
  }
  if (years.length > 0 && trendWord.test(h)) {
    // "FY2024 fares", not "FY2024 fare trend": one year has no trend.
    const base = h.replace(trendWord, '');
    const last = base.split(' ').at(-1) ?? '';
    const many = plural(last);
    if (!many) return verbatim;
    h = `${base.slice(0, base.length - last.length)}${many}`;
  }
  // The ask's article when nothing goes before the head ("the fleet since FY2023"; fix round 2).
  const lead = years.length === 0 && pre.length === 0 ? head.article : '';
  return [lead, years.join(' and '), ...pre, h, ...post].filter(Boolean).join(' ');
}

// The refusal's parts, one per conjunct with an unmet qualifier, in the ask's order.
export function guardParts(what: string, unmet: Qualifier[]): string[] {
  if (unmet.length === 0) return [];
  const cs = conjuncts(what);
  const asked = new Set(stems(what));
  const figs = (t: string): string[] => t.match(/\d+/g) ?? [];
  // A part with a word or figure the ask lacks is never said: the conjunct instead.
  const fromAsk = (p: string) => stems(p).every(w => asked.has(w)) && figs(p).every(f => figs(what).includes(f));
  const parts: string[] = [];
  for (const c of cs) {
    const own = unmet.filter(q => (q.kind === 'topic' ? q.text === c : c.toLowerCase().includes(q.text.toLowerCase())));
    if (own.length === 0) continue;
    const made = partOf(c, cs.length >= 2 ? own : own.filter(q => q.kind !== 'topic'));
    const p = fromAsk(made) ? made : c;
    if (!parts.some(x => x.toLowerCase() === p.toLowerCase())) parts.push(p);
  }
  return parts;
}

// The refusal as said: the parts joined ("a, b or c").
export function guardRefusal(what: string, unmet: Qualifier[]): string {
  const parts = guardParts(what, unmet);
  return parts.length <= 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}`;
}

// The guard's parts with the check's own valid missing parts (`extra`) it doesn't
// cover: a part whose words the guard's parts already say is not said again (#42
// "royalty step-downs and rights reversion" beside the guard's two topics); one that
// adds words replaces the guard parts it covers.
export function mergeParts(parts: string[], extra: string[], what = ''): string[] {
  let out = [...parts];
  for (const m of extra) {
    const own = stems(m);
    const said = new Set(out.flatMap(stems));
    if (own.length === 0 || own.every(w => said.has(w))) continue;
    out = out.filter(p => !stems(p).every(w => own.includes(w)));
    out.push(m);
  }
  // In the ask's order ("store count or a velocity benchmark"); a part not in it last.
  const at = (p: string) => { const i = what.toLowerCase().indexOf(p.toLowerCase()); return i === -1 ? Infinity : i; };
  return out.map((p, i) => ({ p, i })).sort((a, b) => at(a.p) - at(b.p) || a.i - b.i).map(x => x.p);
}

// The case's compared years, for lines that say "fell from $200.0M to $176.0M" with no
// year: read from the case's lines that name exactly two years and cover both periods
// ("fell from $200 in FY2023 to $120 in FY2025": prior FY2023, current FY2025). None
// (prof-001 says "two years ago"): an item states only the years its own line names.
type YearItem = { id: string; label: string; value: string; timeframes?: Record<string, string> | null };
const kindsOf = (i: YearItem) => new Set(Object.values(i.timeframes ?? {}));
const caseYearsCache = new WeakMap<readonly object[], { prior?: string; current?: string }>();
function caseYears(ledger: readonly YearItem[]): { prior?: string; current?: string } {
  const hit = caseYearsCache.get(ledger);
  if (hit) return hit;
  const votes = new Map<string, number>();
  for (const i of ledger) {
    const k = kindsOf(i);
    const both = k.has('both') || (k.has('prior') && k.has('current'));
    const ys = [...YEARS(i.value)].sort();
    if (both && ys.length === 2) votes.set(ys.join(' '), (votes.get(ys.join(' ')) ?? 0) + 1);
  }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const [prior, current] = best ? best.split(' ') : [];
  const out = best ? { prior, current } : {};
  caseYearsCache.set(ledger, out);
  return out;
}
// The guard's view of mapped ledger items: the label with its periods, the line, and the
// years its periods stand for when the line names none.
// The years: the case's for each period the item covers (fix round 2: also beside the years
// its line names — the fleet "hasn't changed since FY2023" covers FY2025 too), and both of
// them for an item with no periods whose line states a change over the period ("went from
// $38.0M to $38.4M", "no material changes").
export function qualifierItems(items: readonly YearItem[], ledger: readonly YearItem[], label: (i: YearItem) => string): QualifierItem[] {
  const { prior, current } = caseYears(ledger);
  return items.map(i => {
    const k = kindsOf(i);
    const span = k.size === 0 && statesTrend(i.value);
    const years = [
      ...(prior && (span || k.has('prior') || k.has('both') || k.has('change')) ? [prior] : []),
      ...(current && (span || k.has('current') || k.has('both') || k.has('change')) ? [current] : []),
    ];
    const anyYear = !prior && !current && YEARS(i.value).size === 0;
    return { id: i.id, label: label(i), value: i.value, ...(years.length > 0 ? { years } : {}), ...(anyYear ? { anyYear: true as const } : {}) };
  });
}
