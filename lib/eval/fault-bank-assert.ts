// The fault bank's assertion checks (Phase 1 contract §4.2): what an interviewer turn did, read from a turn
// record — the recorded one or a replayed one — by deterministic detectors, and each record's assertions checked
// against those readings. Pure: no files, no env. scripts/fault-bank.ts feeds it.
//
// What each detector counts (outcomes, not wording):
//   release / exhibit  an item in a delivered segment's revealIds; an exhibit a segment put up
//   refusal            a sentence saying the case doesn't hold it ("I don't have…", any `refuse` pool variant)
//   restatement        a restate / restate_exhibit lead-in, or an item's ledger line said again while already out
//                      (or twice in one turn); with `item`, that item's line
//   probe              a sentence asking for working (the probe pools and the model's own forms); with `figure`,
//                      one whose segment names that figure
//   correction         a correction line: the correct_one/correct_two pools, "…, not X", or code's "is about X"
//                      line on a turn whose checker line was a correction
//   deferral           a defer / gate_defer / wont_get_to pool variant, or the model's "I'll check what we have";
//                      `about` reads the deferral sentence, `item` the next turn's open data requests
//   ask                a stage question (recommendation, risk, mitigation, brainstorm)
//   close              the turn ended the case
//   says               the regex over the delivered words
//   check              a TurnRecord check: its name, and `decision` against its decision, reason or detail
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import { poolPattern } from '@/lib/orchestrator/phrasing';
import type { Assertion, FaultRecord, FaultResult } from './fault-bank';

export type BankTurn = Pick<TurnRecord, 'turnIndex' | 'delivered' | 'checks' | 'stateBefore' | 'ended'>;
/** Item id → the ways its ledger line is said (the value, plus any data-line versions). */
export type ItemLines = Record<string, readonly string[]>;
/** What the detectors need of the case: its lines, and the items each exhibit releases (an exhibit's segment carries no revealIds). */
export type CaseView = { lines: ItemLines; exhibits?: Record<string, readonly string[]> };

const REFUSE = new RegExp(`\\b(?:I don't have|I do not have|I don’t have|isn't something I have|not something (?:I|we) have|we don't have|that's not in the case|I have no\\b[^.?!]{0,60}\\bto give you)\\b|${poolPattern('refuse').source}`, 'i');
const PROBE = new RegExp(`${poolPattern('probe_got_to', 'probe_calc', 'probe_there').source}|\\b(?:walk me through|talk me through|take me through|show me,? (?:step by step,? )?(?:how|that|the|your)|what (?:steps|were the steps|got you)|how did you (?:get|arrive|do|calculate|compute|size|work|derive|come up|land|reach|build|figure|separate|count)|where (?:did|does) (?:that|the|this|your) [^?]{0,80}come from|(?:which|what) [^?]{0,100}did you (?:use|apply|read|count|divide|multiply|add|subtract|take|pull|separate)|(?:is|was) (?:that|it) (?:built|based|resting) on|(?:does|did) (?:that|it) rest on|resting on\\?)\\b`, 'i');
// A checker-style probe: an opener quoting their figure, then a question ("Earlier you said “19%” — how does that fit …?").
const OPENER_Q = new RegExp(`^(?:[A-Z][^.?!]{0,40}[—,-]\\s*)?(?:${poolPattern('probe_opener').source})\\b[^?]*\\?`, 'i');
const CORRECT_POOL = poolPattern('correct_one', 'correct_two');
const NOT_X = /,?\s\bnot (?:about )?[$€£]?\d/i;
const CODE_ABOUT = /\b(?:is|are|was|were) about [$€£]?\d/i;
const DEFER = new RegExp(`${poolPattern('defer', 'gate_defer', 'wont_get_to', 'wont_get_to_that').source}|\\b(?:I'll check what we have|let me (?:come back to|check on) (?:that|it|this)|I'll come back to|we'll come back to|we'll get there in a bit|for a little later|once we've settled)\\b`, 'i');
const RESTATE = poolPattern('restate', 'restate_exhibit');
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

// The numbers a figure string names ("$9.0M" → 9, "1,205" → 1205); a text names the figure when it states one of them.
const numbersIn = (s: string) => [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => Number(m[0].replace(/,/g, ''))).filter(n => Number.isFinite(n));
export function namesFigure(text: string, figure: string): boolean {
  if (norm(text).includes(norm(figure))) return true;
  const want = numbersIn(figure);
  if (want.length === 0) return false;
  const have = new Set(numbersIn(text));
  return want.every(n => have.has(n));
}

export type TurnReading = {
  words: string;
  released: Set<string>;
  exhibits: Set<string>;
  refusals: string[];
  probes: { sentence: string; segment: string }[];
  corrections: string[];
  deferrals: string[];
  restatementLead: boolean;
  restatedItems: Set<string>;
  asks: Set<keyof typeof STAGE>;
  closed: boolean;
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
  for (const [id, forms] of Object.entries(lines)) {
    const n = Math.max(0, ...forms.map(f => countOf(w, lineKey(f))));
    if (n === 0) continue;
    if (before.has(id) || n >= 2) restatedItems.add(id);
  }
  return {
    words,
    released: new Set(t.delivered.flatMap(s => [...s.revealIds, ...(s.exhibitId ? view.exhibits?.[s.exhibitId] ?? [] : [])])),
    exhibits: new Set(t.delivered.flatMap(s => s.exhibitId ? [s.exhibitId] : [])),
    refusals: sentences.filter(s => REFUSE.test(s)),
    probes,
    corrections: sentences.filter(s => CORRECT_POOL.test(s) || (NOT_X.test(s) && !/\?/.test(s)) || (checkerCorrected && CODE_ABOUT.test(s) && !/\?/.test(s))),
    deferrals: sentences.filter(s => DEFER.test(s)),
    restatementLead: t.delivered.some(s => s.kind === 'data' && RESTATE.test(s.text)),
    restatedItems,
    asks: new Set((Object.keys(STAGE) as (keyof typeof STAGE)[]).filter(k => sentences.some(s => /\?/.test(s) && STAGE[k].test(s)))),
    closed: t.ended || CLOSE.test(words),
  };
}

// Whether one assertion's event happened on one turn (polarity aside).
function happened(a: Assertion, r: TurnReading, t: BankTurn, next: BankTurn | undefined): boolean {
  const re = (p: string) => new RegExp(p, 'i');
  switch (a.kind) {
    case 'release': return r.released.has(a.item);
    case 'exhibit': return r.exhibits.has(a.exhibit);
    case 'refusal': return r.refusals.some(s => !a.about || re(a.about).test(s));
    case 'restatement': return a.item ? r.restatedItems.has(a.item) : (r.restatementLead || r.restatedItems.size > 0);
    case 'probe': return r.probes.some(p => !a.figure || namesFigure(p.segment, a.figure));
    case 'correction': return r.corrections.some(s => !a.figure || namesFigure(s, a.figure));
    case 'deferral': return r.deferrals.some(s => !a.about || re(a.about).test(s))
      && (!a.item || (next?.stateBefore.openDataRequests ?? []).some(d => d.ledgerItemId === a.item));
    case 'ask': return r.asks.has(a.stage);
    case 'close': return r.closed;
    case 'says': return re(a.pattern).test(r.words);
    case 'check': return t.checks.some(c => c.check === a.check && (!a.decision || c.decision === a.decision
      || re(a.decision).test(c.reason ?? '') || JSON.stringify(c.detail ?? {}).includes(a.decision)));
  }
}

// The interviewer turns an assertion looks at, as grading turns tN (tN = turnIndex + 1).
export function scopeTurns(a: Assertion, recordTurn: number, lastTurn: number): number[] {
  const s = a.scope;
  if (!s) return [recordTurn];
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
  for (const a of rec.assertions) {
    const ns = scopeTurns(a, rec.turn, last);
    const seen = ns.filter(n => byT.has(n));
    const hits = seen.filter(n => { const t = byT.get(n)!; return happened(a, readTurn(t, view), t, byT.get(n + 2)); });
    const ok = a.must ? hits.length > 0 : hits.length === 0;
    if (!ok) {
      const at = a.must ? seen : hits;
      const saw = at.length ? at.slice(0, 3).map(n => `t${n}: ${short(byT.get(n)!.delivered.map(s => s.text).join(' '))}`).join(' | ') : `no turn ${ns.map(n => `t${n}`).join(',')} in the replay`;
      failed.push({ assertion: a, saw });
    }
  }
  const own = byT.get(rec.turn);
  return { id: rec.id, pass: failed.length === 0, failed, ...(own ? {} : { skipped: 'diverged' as const }) };
}
