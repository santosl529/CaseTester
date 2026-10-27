// The fault bank's assertion checks (Phase 1 contract §4.2): what an interviewer turn did, read from a turn
// record — the recorded one or a replayed one — by deterministic detectors, and each record's assertions checked
// against those readings. Pure: no files, no env. scripts/fault-bank.ts feeds it.
//
// What each detector counts (outcomes, not wording):
//   release / exhibit  an item in a delivered segment's revealIds; an exhibit a segment put up
//   refusal            a sentence saying the case doesn't hold it ("I don't have…", any `refuse` pool variant)
//   restatement        a restate / restate_exhibit lead-in, or an item's ledger line said again while already out
//                      (or twice in one turn); with `item`, that item's line; with `doubled`, only the same-turn double
//   probe              a sentence asking for working (the probe pools and the model's own forms); with `figure`,
//                      one whose segment names that figure
//   correction         a correction line: the correct_one/correct_two pools, "…, not X", or code's "is about X"
//                      line on a turn whose checker line was a correction
//   deferral           a defer / gate_defer / wont_get_to pool variant, or the model's "I'll check what we have";
//                      `about` reads the deferral sentence, `item` the next turn's open data requests
//   ask                a stage question (recommendation, risk, mitigation, brainstorm)
//   answered           at the record's turn: the item released, a refusal, or a deferral that later resolves
//   spoke              a sentence of the turn's own (not a refusal, not a deferral); with `question`, one that asks.
//                      A non-degeneracy floor, not an answer check (I5): see fault-bank.ts's note on the assertion
//   close              the turn ended the case
//   says               the regex over the delivered words
//   check              a TurnRecord check: its name, and `decision` against its decision, reason or detail
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import { poolPattern } from '@/lib/orchestrator/phrasing';
import type { Assertion, FaultRecord, FaultResult } from './fault-bank';
import { lintTurn } from '@/lib/orchestrator/turn-lint';

export type BankTurn = Pick<TurnRecord, 'turnIndex' | 'delivered' | 'checks' | 'stateBefore' | 'ended'>;
/** Item id → the ways its ledger line is said (the value, plus any data-line versions). */
export type ItemLines = Record<string, readonly string[]>;
/** What the detectors need of the case: its lines, and the items each exhibit releases (an exhibit's segment carries no revealIds). */
export type CaseView = { lines: ItemLines; exhibits?: Record<string, readonly string[]>;
  /** For the lint's L3: an item's own words (label, spoken name, line) and an exhibit's title. */
  words?: Record<string, readonly string[]>; exhibitTitles?: Record<string, string>; caseNames?: string[] };

const ASSUME = poolPattern('assume');
const ASSUME_FINER = poolPattern('assume_finer');
const REFUSE = new RegExp(`\\b(?:I don't have|I do not have|I don’t have|isn't something I have|not something (?:I|we) have|we don't have|that's not in the case|I have no\\b[^.?!]{0,60}\\bto give you)\\b|${poolPattern('refuse').source}`, 'i');
const PROBE = new RegExp(`${poolPattern('probe_got_to', 'probe_calc', 'probe_there').source}|\\b(?:walk me through|talk me through|take me through|show me,? (?:step by step,? )?(?:how|that|the|your)|what (?:steps|were the steps|got you)|how did you (?:get|arrive|do|calculate|compute|size|work|derive|come up|land|reach|build|figure|separate|count)|where (?:did|does) (?:that|the|this|your) [^?]{0,80}come from|(?:which|what) [^?]{0,100}did you (?:use|apply|read|count|divide|multiply|add|subtract|take|pull|separate)|(?:is|was) (?:that|it) (?:built|based|resting) on|(?:does|did) (?:that|it) rest on|resting on\\?)\\b`, 'i');
// A checker-style probe: an opener quoting their figure, then a question ("Earlier you said “19%” — how does that fit …?").
const OPENER_Q = new RegExp(`^(?:[A-Z][^.?!]{0,40}[—,-]\\s*)?(?:${poolPattern('probe_opener').source})\\b[^?]*\\?`, 'i');
const CORRECT_POOL = poolPattern('correct_one', 'correct_two');
const NOT_X = /,?\s\bnot (?:about )?[$€£]?\d/i;
const CODE_ABOUT = /\b(?:is|are|was|were) about [$€£]?\d/i;
const DEFER = new RegExp(`${poolPattern('defer', 'gate_defer', 'wont_get_to', 'wont_get_to_that').source}|\\b(?:I'll check what we have|let me (?:come back to|check on) (?:that|it|this)|I'll come back to|we'll come back to|we'll get there in a bit|for a little later|once we've settled)\\b`, 'i');
const RESTATE = poolPattern('restate', 'restate_exhibit');
const WONT = new RegExp(`${poolPattern('wont_get_to', 'wont_get_to_that').source}|\\bwe won't get to\\b`, 'i');
const CLOSE = poolPattern('close_time_up', 'close_complete', 'close_unresolved');
const STAGE: Record<'recommendation' | 'risk' | 'mitigation' | 'brainstorm', RegExp> = {
  recommendation: /\brecommend|\bbottom[- ]line\b|\bwhat (?:would|will) you tell (?:the )?(?:CEO|client|board|CFO)\b|\bwhat would you advise\b/i,
  risk: /\brisks?\b|\bwhat could go wrong\b/i,
  mitigation: /\bguard against\b|\bmitigat|\bprotect (?:against|yourself)\b|\bwhat would you (?:do|put in place)\b|\breduce (?:that|the|this) risk\b|\bhow would you (?:hedge|manage|handle)\b|\bfirst step\b|\bhave the client do first\b/i,
  brainstorm: /\bwhat else\b|\bother (?:ways|options|levers|ideas|moves)\b|\bbeyond what\b|\bhow else\b|\bwhat (?:could|can) (?!you)[^?]{0,40}\bdo\b|\bhow could (?!you)[^?]{0,40}\b(?:reduce|improve|make|get)\b/i,
};

export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.?!])\s+(?=[A-Z“"'(‘$0-9])/).map(s => s.trim()).filter(Boolean);
}

const norm = (s: string) => s.toLowerCase().replace(/[‐-―]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const lineKey = (line: string) => norm(line).slice(0, 48);
const countOf = (hay: string, needle: string) => needle ? hay.split(needle).length - 1 : 0;

// A figure as said: its currency, its value and its unit. "$920" is not named by "920 passengers" and "19%" is not
// named by "19 stores" — the bare-number reading (every number of the figure somewhere in the text) let a probe about
// another quantity satisfy a record (finding 12 of the Stream 1 review). Scale words count: "$16 million" is named by
// "$16M" and by "$16,000,000"; "%", "x" and "points" must match as written.
const SCALE: Record<string, number> = { m: 1e6, mm: 1e6, million: 1e6, millions: 1e6, k: 1e3, thousand: 1e3, thousands: 1e3, b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9 };
const UNIT = '%|x|×|mm?|k|bn?|millions?|thousands?|billions?|points?|pts?|percent';
type Figure = { cur: string; bare: number; value: number; unit: '' | '%' | 'x' | 'pt' };
function readFigure(cur: string | undefined, num: string, suffix: string | undefined): Figure {
  const raw = (suffix ?? '').toLowerCase();
  const bare = Number(num.replace(/,/g, ''));
  const at = (unit: Figure['unit']): Figure => ({ cur: cur ?? '', bare, value: bare, unit });
  if (raw === '%' || raw === 'percent') return at('%');
  if (raw === 'x' || raw === '×') return at('x');
  if (/^(?:points?|pts?)$/.test(raw)) return at('pt');
  return { cur: cur ?? '', bare, value: bare * (SCALE[raw] ?? 1), unit: '' };
}
// A letter unit must end the token, so "480,000 bags" is 480,000 and not 480,000 billion.
const FIGURE_ONLY = new RegExp(`^([$€£])?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:(${UNIT})(?![a-z]))?$`, 'i');
const FIGURE_IN = new RegExp(`([$€£])?\\s?(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:(${UNIT})(?![a-z]))?`, 'gi');
export function namesFigure(text: string, figure: string): boolean {
  if (norm(text).includes(norm(figure))) return true;
  const m = FIGURE_ONLY.exec(figure.trim());
  if (!m) return false;
  const want = readFigure(m[1], m[2], m[3]);
  for (const t of text.matchAll(FIGURE_IN)) {
    const got = readFigure(t[1], t[2], t[3]);
    if (got.unit !== want.unit) continue;
    if (want.cur && got.cur !== want.cur) continue;   // "$920" is not "920 passengers"; "920" is named by "$920"
    // The scale as said ("$16 million" = "$16M" = "$16,000,000") or the figure's own digits ("$9" in "$9 million").
    if (got.value === want.value || got.bare === want.bare) return true;
  }
  return false;
}

export type TurnReading = {
  words: string;
  released: Set<string>;
  exhibits: Set<string>;
  refusals: string[];
  /** Assumption lines (`refusalAssume`): "On X, I'd make a reasonable assumption."; `finer`: "For anything finer, …". */
  assumptions: string[];
  finer: boolean;
  probes: { sentence: string; segment: string }[];
  corrections: string[];
  deferrals: string[];
  restatementLead: boolean;
  restatedItems: Set<string>;
  /** Items whose own line is said twice within the one turn (the model's copy plus code's). */
  doubledItems: Set<string>;
  asks: Set<keyof typeof STAGE>;
  closed: boolean;
  /** The turn's own sentences: neither a refusal nor a deferral — what `spoke` reads. */
  own: string[];
};

export function readTurn(t: BankTurn, view: CaseView): TurnReading {
  const lines = view.lines;
  const words = t.delivered.map(s => s.text).join(' ');
  const sentences = sentencesOf(words);
  const checkerCorrected = t.checks.some(c => c.check === 'math_checker' && c.decision === 'act' && /delivered: correct/.test(c.reason ?? ''));
  const probes: TurnReading['probes'] = [];
  for (const seg of t.delivered) for (const s of sentencesOf(seg.text)) if (PROBE.test(s) || OPENER_Q.test(s)) probes.push({ sentence: s, segment: seg.text });
  const before = new Set(t.stateBefore.revealedIds);
  const w = norm(words);
  const restatedItems = new Set<string>();
  const doubledItems = new Set<string>();
  for (const [id, forms] of Object.entries(lines)) {
    const n = Math.max(0, ...forms.map(f => countOf(w, lineKey(f))));
    if (n === 0) continue;
    if (n >= 2) doubledItems.add(id);
    if (before.has(id) || n >= 2) restatedItems.add(id);
  }
  return {
    words,
    released: new Set(t.delivered.flatMap(s => [...s.revealIds, ...(s.exhibitId ? view.exhibits?.[s.exhibitId] ?? [] : [])])),
    exhibits: new Set(t.delivered.flatMap(s => s.exhibitId ? [s.exhibitId] : [])),
    refusals: sentences.filter(s => REFUSE.test(s)),
    assumptions: sentences.filter(s => ASSUME.test(s)),
    finer: sentences.some(s => ASSUME_FINER.test(s)),
    probes,
    corrections: sentences.filter(s => CORRECT_POOL.test(s) || (NOT_X.test(s) && !/\?/.test(s)) || (checkerCorrected && CODE_ABOUT.test(s) && !/\?/.test(s))),
    deferrals: sentences.filter(s => DEFER.test(s)),
    restatementLead: t.delivered.some(s => s.kind === 'data' && RESTATE.test(s.text)),
    restatedItems,
    doubledItems,
    asks: new Set((Object.keys(STAGE) as (keyof typeof STAGE)[]).filter(k => sentences.some(s => /\?/.test(s) && STAGE[k].test(s)))),
    closed: t.ended || CLOSE.test(words),
    own: sentences.filter(s => !REFUSE.test(s) && !DEFER.test(s)),
  };
}

// Whether one assertion's event happened on one turn (polarity aside).
function happened(a: Assertion, r: TurnReading, t: BankTurn, next: BankTurn | undefined, view: CaseView): boolean {
  const re = (p: string) => new RegExp(p, 'i');
  switch (a.kind) {
    case 'release': return r.released.has(a.item);
    case 'exhibit': return r.exhibits.has(a.exhibit);
    case 'refusal': return r.refusals.some(s => !a.about || re(a.about).test(s))
      || (a.acceptAssume === true && (r.assumptions.some(s => !a.about || re(a.about).test(s)) || (r.finer && (r.released.size > 0 || r.restatedItems.size > 0))));
    case 'restatement': return a.doubled === true
      ? (a.item ? r.doubledItems.has(a.item) : r.doubledItems.size > 0)
      : a.item ? r.restatedItems.has(a.item) : (r.restatementLead || r.restatedItems.size > 0);
    case 'probe': return r.probes.some(p => !a.figure || namesFigure(p.segment, a.figure));
    case 'correction': return r.corrections.some(s => !a.figure || namesFigure(s, a.figure));
    case 'deferral': return r.deferrals.some(s => !a.about || re(a.about).test(s))
      && (!a.item || (next?.stateBefore.openDataRequests ?? []).some(d => d.ledgerItemId === a.item));
    case 'ask': return r.asks.has(a.stage);
    // Substance of the turn's own: a question, or a sentence long enough not to be an acknowledgment
    // ("Understood.", "Go on."). Silence and a refuse-everything turn have neither.
    case 'spoke': return a.question === true ? r.own.some(s => s.includes('?')) : r.own.some(s => s.includes('?') || s.length >= 20);
    case 'answered': return false;   // over the window (answeredInWindow)
    case 'close': return r.closed;
    case 'says': return re(a.pattern).test(r.words);
    case 'lint': return lintTurn(t.delivered, {
      itemWords: id => [...(view.words?.[id] ?? [])], exhibitWords: id => [view.exhibitTitles?.[id] ?? ''],
      caseNames: view.caseNames ?? [], ended: r.closed,
    }).some(v => v.rule === a.rule);
    case 'subAsk': return t.checks.some(c => c.check === 'ask_decision_shadow'
      && ((c.detail as { asks?: { words: string; outcome: string }[] } | undefined)?.asks ?? []).some(x => re(a.about).test(x.words) && (a.accept as readonly string[]).includes(x.outcome)));
    case 'check': return t.checks.some(c => c.check === a.check && (!a.decision || c.decision === a.decision
      || re(a.decision).test(c.reason ?? '') || JSON.stringify(c.detail ?? {}).includes(a.decision)));
  }
}

// Whether the ask got a word: released, truly refused, or deferred and the deferral resolved (a later release of
// the item, or a later refusal about it — the window ends at the close). An unresolved deferral is not an answer,
// so a hollow deferral and a silent turn both fail.
//
// ANCHORED at the record's turn (or scope.fromTurn) — bank fix 4, 26 Oct. The three accept paths are read on the
// anchor turn alone; the window scan is only the DEFERRAL'S RESOLUTION. Unanchored, the whole window answered,
// so a turn that ignored the ask passed whenever the item came out anywhere later — which is how
// b36l-jasmine-t2-departures and b38l-tyler-t2-split-refusal greened on silence.
function answeredInWindow(a: Extract<Assertion, { kind: 'answered' }>, ns: number[], byT: Map<number, BankTurn>, view: CaseView): boolean {
  const accept = new Set(a.accept ?? (['release', 'refusal', 'deferral'] as const));
  const re = a.about ? new RegExp(a.about, 'i') : null;
  const anchor = ns[0];
  if (anchor === undefined || !byT.has(anchor)) return false;
  const seen = ns.filter(n => byT.has(n));
  const read = new Map(seen.map(n => [n, readTurn(byT.get(n)!, view)]));
  const released = (n: number) => !!a.item && read.get(n)!.released.has(a.item);
  const refused = (n: number) => { const r = read.get(n)!; return r.refusals.some(x => !re || re.test(x))
    || (a.acceptAssume === true && (r.assumptions.some(x => !re || re.test(x)) || (r.finer && (r.released.size > 0 || r.restatedItems.size > 0)))); };
  // A deferral of the record's own item counts however code worded it (bank fix, 26 Oct, Lorenzo's ruling 1).
  // §4.2: "Assert outcomes, not wording." Code words a deferral from the ITEM's label, not the candidate's
  // words — b36l Marcus t6's ask for "cost per seat mile" is deferred as "wages and other costs per flight",
  // and b36l Jasmine t2's "total departures" as "the network totals and average fare" — so an `about` regex
  // written from the candidate's ask fails on a deferral that is plainly of the right item. Read as the
  // `deferral` assertion reads it: the item in the next turn's open data requests. The anchor still has to hold
  // a deferral, and it still has to resolve, so silence and a hollow deferral both fail as before.
  const deferredItem = (n: number) => !!a.item && read.get(n)!.deferrals.length > 0
    && (byT.get(n + 2)?.stateBefore.openDataRequests ?? []).some(d => d.ledgerItemId === a.item);
  const deferred = (n: number) => read.get(n)!.deferrals.some(x => !re || re.test(x)) || deferredItem(n);
  if (accept.has('release') && released(anchor)) return true;
  if (accept.has('refusal') && refused(anchor)) return true;
  if (!accept.has('deferral') || !deferred(anchor)) return false;
  // What may resolve the deferral: the outcomes this record accepts — or, when it accepts only a deferral, either.
  const byRelease = accept.has('release') || !accept.has('refusal');
  const byRefusal = accept.has('refusal') || !accept.has('release');
  const wontSaid = (n: number) => !!a.wontResolves && read.get(n)!.deferrals.some(x => WONT.test(x) && (!re || re.test(x)));
  return seen.some(j => j > anchor && ((byRelease && released(j)) || (byRefusal && refused(j)) || wontSaid(j)));
}

// The interviewer turns an assertion looks at, as grading turns tN (tN = turnIndex + 1).
// `answered` with no scope reads the record's turn through the close: a deferral's resolution is owed by then.
export function scopeTurns(a: Assertion, recordTurn: number, lastTurn: number): number[] {
  const s = a.scope;
  if (!s) {
    if (a.kind !== 'answered') return [recordTurn];
    const out: number[] = [];
    for (let n = recordTurn; n <= lastTurn; n += 2) out.push(n);
    return out.length ? out : [recordTurn];
  }
  if ('turn' in s) return [s.turn];
  const to = s.toTurn ?? lastTurn;
  const out: number[] = [];
  for (let n = s.fromTurn; n <= to; n += 2) out.push(n);
  return out;
}

const short = (s: string, n = 220) => s.length > n ? `${s.slice(0, n)}…` : s;

export function evaluateRecord(rec: FaultRecord, turns: BankTurn[], view: CaseView): FaultResult {
  const byT = new Map(turns.map(t => [t.turnIndex + 1, t]));
  if (turns.length === 0) return { id: rec.id, pass: false, failed: [], skipped: 'run_missing' };
  const last = Math.max(...byT.keys());
  const failed: FaultResult['failed'] = [];
  let vacuous = false;
  for (const a of rec.assertions) {
    const ns = scopeTurns(a, rec.turn, last);
    const seen = ns.filter(n => byT.has(n));
    // A must-not over turns the replay never wrote looked at nothing: the record is skipped, not passed.
    if (!a.must && seen.length === 0) { vacuous = true; continue; }
    const hits = a.kind === 'answered'
      ? (answeredInWindow(a, ns, byT, view) ? seen : [])
      : seen.filter(n => { const t = byT.get(n)!; return happened(a, readTurn(t, view), t, byT.get(n + 2), view); });
    const ok = a.must ? hits.length > 0 : hits.length === 0;
    if (!ok) {
      const at = a.must ? seen : hits;
      const saw = at.length ? at.slice(0, 3).map(n => `t${n}: ${short(byT.get(n)!.delivered.map(s => s.text).join(' '))}`).join(' | ') : `no turn ${ns.map(n => `t${n}`).join(',')} in the replay`;
      failed.push({ assertion: a, saw });
    }
  }
  const own = byT.get(rec.turn);
  // A skip never masks a recorded failure (bank fix 3, 26 Oct): a fix that empties one must-not's window while
  // another assertion still fails would otherwise take the record out of the gate's denominator — and the gate
  // line would *improve*. Only a record with nothing against it can be skipped as vacuous.
  const skipped = !own ? 'diverged' as const : (vacuous && failed.length === 0) ? 'vacuous' as const : undefined;
  return { id: rec.id, pass: failed.length === 0, failed, ...(skipped ? { skipped } : {}) };
}
