// The turn lint (Phase 2 design §3.4, docs/superpowers/plans/2026-10-27-phase2-design.md): deterministic checks on
// one interviewer turn as delivered, in order — the say segments, the data line, the tail. Pure: the same reading for
// the composer's shadow (C1), the fault bank's `lint` assertion and the shape script, so the three never disagree.
//   L1  no doubled sentence: two sentences of the turn the same (or one inside the other) once normalized
//   L2  "that figure / that number / that calculation / how you got there" only when the sentence itself quotes or
//       names a figure, or the sentence before it — not a code data line — does
//   L3  no deferral naming what the same turn released or handed over (two of its key nouns)
//   L4  no data line after the turn's first question
//   L5  one question act (a "?" or an asking imperative): none, or more than one, on a turn that isn't the close
//   L6  no "before any data / once you have those figures" on a turn that gave data
//   L7  no quote fragment ("“…the only option…”")
import { poolPattern } from './phrasing';
import { keyNouns } from './data-decisions';
import { properNames } from './request-signal';
import type { ModelPlan } from './plan-turn';

export const LINT_RULES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] as const;
export type LintRule = typeof LINT_RULES[number];
export type LintViolation = { rule: LintRule; sentence: string; detail?: string };
export type LintSegment = { kind: string; text: string; revealIds?: readonly string[]; exhibitId?: string };
export type LintContext = {
  /** An item's own words (label, spoken name, line): what a deferral would name. */
  itemWords?: (id: string) => string[];
  /** An exhibit's title (and its items' words). */
  exhibitWords?: (id: string) => string[];
  caseNames?: string[];
  /** The turn ended the case: no question is owed. */
  ended?: boolean;
};

// The data line's own sentences, wherever they sit (a must-reach line or a held exhibit lands in the tail).
const DATA_POOLS = poolPattern('refuse', 'defer', 'gate_defer', 'wont_get_to', 'wont_get_to_that', 'restate', 'restate_exhibit', 'restate_pointer', 'restate_recent', 'exhibit', 'earlier', 'offer');
const DATA_LEADS = /^(?:Before your recommendation:|One more thing before the exhibit:|On what you asked about earlier:|As I mentioned:|As the exhibit shows:|Repeating what I said before:)/;
const DEFER = new RegExp(`${poolPattern('defer', 'gate_defer').source}|\\b(?:I'll check what we have|I'll come back to|we'll come back to|we'll get there in a bit|for a little later|let's hold)\\b`, 'i');
const ANAPHOR = /\b(?:that|this) (?:figure|number|calculation|estimate|math)\b|\bhow you got there\b|\bhow did you get there\b/i;
const REFERENT = /\d|[“"][^”"]{3,}[”"]/;
const PENDING = /\bbefore (?:any|we get (?:into|to) the) data\b|\bbefore any data comes out\b|\bonce you have (?:those|these|the) (?:figures|numbers|data)\b|\bon (?:its|their) way\b/i;
const FRAGMENT = /[“"]\s*…|…\s*[”"]/;

const sentencesOf = (text: string) => text.split(/(?<=[.?!])\s+(?=[A-Z“"'(‘$0-9])/).map(s => s.trim()).filter(Boolean);
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9$%'" ]+/g, ' ').replace(/\s+/g, ' ').trim();
// A question act: a question mark, or an imperative that asks ("Walk me through that calculation.", "Go on.").
const ASK_IMPERATIVE = /^(?:[A-Z][^.?!—]{0,60}(?:—|:|,)\s*)?(?:(?:walk|talk|take) me through|tell me|show me|go ahead|go on\b|lay out|give me)/i;
const isQuestion = (s: string) => s.includes('?') || ASK_IMPERATIVE.test(s) || /\b(?:walk|talk|take) me through\b/i.test(s);

type Sent = { text: string; data: boolean; seg: number };

export function lintTurn(segments: readonly LintSegment[], ctx: LintContext = {}): LintViolation[] {
  const out: LintViolation[] = [];
  const sents: Sent[] = segments.flatMap((seg, i) => sentencesOf(seg.text).map(text => ({
    text, seg: i, data: seg.kind === 'data' || DATA_LEADS.test(text) || (seg.kind === 'tail' && DATA_POOLS.test(text) && !isQuestion(text)),
  })));

  // L1: the same sentence twice, or one long sentence inside another (a ledger line said by the model and by code).
  for (let i = 0; i < sents.length; i++) {
    const a = norm(sents[i].text);
    if (a.length < 25) continue;
    for (let j = 0; j < i; j++) {
      const b = norm(sents[j].text);
      if (b.length < 25) continue;
      if (a === b || (a.length >= 40 && b.includes(a)) || (b.length >= 40 && a.includes(b))) { out.push({ rule: 'L1', sentence: sents[i].text }); break; }
    }
  }

  // L2: an anaphor whose referent is neither in its own sentence nor in the sentence before it (a data line is no referent).
  sents.forEach((s, i) => {
    if (s.data || !ANAPHOR.test(s.text)) return;
    const own = s.text.replace(ANAPHOR, ' ');
    if (REFERENT.test(own)) return;
    const prev = sents[i - 1];
    if (prev && !prev.data && REFERENT.test(prev.text)) return;
    out.push({ rule: 'L2', sentence: s.text, detail: prev ? (prev.data ? 'after a data line' : 'no figure before it') : 'nothing before it' });
  });

  // L3: a deferral naming an item the turn released, or the exhibit it handed over.
  const given = segments.flatMap(s => [...(s.revealIds ?? [])]);
  const shown = segments.flatMap(s => (s.exhibitId ? [s.exhibitId] : []));
  const givenNouns = new Set([
    ...given.flatMap(id => ctx.itemWords?.(id) ?? []), ...shown.flatMap(id => ctx.exhibitWords?.(id) ?? []),
  ].flatMap(w => [...keyNouns(w, ctx.caseNames ?? [])]));
  if (givenNouns.size > 0) {
    for (const s of sents) {
      if (!DEFER.test(s.text)) continue;
      // Two shared nouns: one alone is often a generic word both sides use ("customer" in CAC beside new customers).
      const shared = [...keyNouns(s.text, ctx.caseNames ?? [])].filter(n => givenNouns.has(n));
      if (shared.length >= 2) out.push({ rule: 'L3', sentence: s.text, detail: shared.join(',') });
    }
  }

  // L4: a data line after the turn's first question.
  const firstQ = sents.findIndex(s => isQuestion(s.text));
  if (firstQ >= 0) for (const s of sents.slice(firstQ + 1)) if (s.data) out.push({ rule: 'L4', sentence: s.text });

  // L5: one question, on every turn but the close.
  // Counted by "?" sentences; an asking imperative counts only on a turn with none ("Give me as many ideas as you
  // can." after a question elaborates it, it doesn't ask a second thing).
  const marked = sents.filter(s => s.text.includes('?') && !s.data);
  const questions = marked.length > 0 ? marked : sents.filter(s => isQuestion(s.text) && !s.data).slice(0, 1);
  if (!ctx.ended && questions.length !== 1) out.push({ rule: 'L5', sentence: questions.map(q => q.text).join(' ') || '(none)', detail: String(questions.length) });

  // L6: data still to come, on a turn that gave data.
  if (given.length > 0 || shown.length > 0) for (const s of sents) if (!s.data && PENDING.test(s.text)) out.push({ rule: 'L6', sentence: s.text });

  // L7: a quote fragment.
  for (const s of sents) if (FRAGMENT.test(s.text)) out.push({ rule: 'L7', sentence: s.text });
  return out;
}

// The lint's case context for a live turn (Settle's composer shadow): an item's own words, an exhibit's title.
export function composeLintContext(plan: ModelPlan): LintContext {
  const c = plan.state.caseData;
  return {
    itemWords: id => { const i = c.dataLedger.find(x => x.id === id); return i ? [i.label, i.spoken ?? '', i.value] : []; },
    exhibitWords: id => [c.exhibits.find(e => e.id === id)?.title ?? ''],
    caseNames: properNames(c.sttKeyterms),
  };
}
