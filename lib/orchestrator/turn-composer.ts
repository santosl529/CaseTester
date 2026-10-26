// The turn composer (Phase 2 design §3, docs/superpowers/plans/2026-10-27-phase2-design.md), built in shadow (step
// C1, `composeShadow`): every turn as four slots of whole sentences, each from one author, in a fixed order —
//   acknowledgment (the model's admitted say) → a correction of what the candidate just said → data lines →
//   other corrections → setup + one question
// (Lorenzo's 27 Oct rulings: Q5 the correction's place; Q6 no rewrite of a model sentence, whole sentences only; Q7
// keep the last question and withhold the earlier, logged only in this step). Settle hands it the pieces it composes
// today; the composer re-slots them and the turn lint (turn-lint.ts) reads both, so the log says what the fixed order
// would change and which violations it would remove. Pure; nothing here is spoken.
import { lintTurn, type LintContext, type LintSegment, type LintViolation } from './turn-lint';
import { keyNouns } from './data-decisions';

export type ComposerPieces = {
  /** The model's say as admitted by today's vetoes (empty on a code-written turn). */
  say: string;
  /** Today's data line parts, in order, with what each releases (renderDataLineParts). */
  data: { kind: string; text: string; ids: string[] }[];
  /** The question as composed today — the model's, or code's (a checker line, a stage or a fallback may lead it). */
  question: string;
  /** Code's correction lines riding on this turn, each with whether it corrects what the candidate just said. */
  corrections: { text: string; justSaid: boolean }[];
  /** The exhibit this turn hands over, if any (for the lint's L3). */
  exhibitId?: string;
  /** Sentences today's code rewrote rather than withheld (the grading remainder): Q6 withholds them whole. */
  rewritten?: string[];
  ended: boolean;
};

export type ComposedSlots = { ack: string[]; correctionFirst: string[]; data: string[]; correctionAfter: string[]; setup: string[]; question: string[] };
export type ComposeShadow = {
  slots: ComposedSlots;
  composed: string;
  today: string;
  changed: boolean;
  /** What re-slotting moved. */
  moves: { setupMoved: string[]; correctionsMoved: number; questionsWithheld: string[]; rewriteWithheld: string[] };
  lintToday: LintViolation[];
  lintComposed: LintViolation[];
};

const sentencesOf = (s: string) => s.replace(/\s+/g, ' ').trim().split(/(?<=[.?!])\s+(?=[A-Z“"'(‘$0-9])/).filter(Boolean);
// A setup sentence states a question's premise: the candidate's figure or claim said back ("On variable cost, you said
// $8,800 per flight.", "Earlier you said …"), or a lead ending in a colon ("On the prevalence input:").
const SETUP = /\b(?:you (?:said|put|mentioned|had|used|estimated|got|wrote|assumed|treated|took|applied)|earlier you|you've (?:put|said|got))\b/i;
export const isSetup = (s: string) => !s.includes('?') && (SETUP.test(s) || /:\s*$/.test(s.trim()));
const isQ = (s: string) => s.includes('?');

export function composeShadow(p: ComposerPieces, ctx: LintContext): ComposeShadow {
  // A code-written turn carries code's correction in its say (a stage turn's riding correction): it is the correction
  // slot's, said once — never in the acknowledgment as well.
  const corrSentences = new Set(p.corrections.flatMap(c => sentencesOf(c.text)).map(x => x.trim()));
  const sayAll = sentencesOf(p.say);
  const sayS = sayAll.filter(x => !corrSentences.has(x.trim()));
  const setupFromSay = sayS.filter(isSetup);
  const ack = sayS.filter(s => !isSetup(s));
  // The question field: corrections code led it with leave it (they have their own slot); its statements are setup.
  const corrTexts = new Set(p.corrections.map(c => c.text.trim()));
  let q = p.question.trim();
  for (const c of corrTexts) if (q.startsWith(c)) q = q.slice(c.length).trim();
  const qS = sentencesOf(q);
  const rewritten = new Set((p.rewritten ?? []).map(s => s.trim()));
  const kept = qS.filter(s => !rewritten.has(s.trim()));
  const asks = kept.filter(isQ);
  // Q7: one question — the last kept; the earlier ones withheld (and, being questions, nothing of them stays).
  const question = asks.length > 0 ? [asks[asks.length - 1]] : kept.filter(s => !isSetup(s)).slice(-1);
  const questionsWithheld = asks.slice(0, -1);
  const setup = [...setupFromSay, ...kept.filter(s => !isQ(s) && !question.includes(s))];
  const data = p.data.filter(d => d.kind !== 'correction').map(d => d.text);
  const dataCorr = p.data.filter(d => d.kind === 'correction').map(d => ({ text: d.text, justSaid: true }));
  const seen = new Set<string>();
  const allCorr = [...dataCorr, ...p.corrections].filter(c => { const k = c.text.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  const slots: ComposedSlots = {
    ack, correctionFirst: allCorr.filter(c => c.justSaid).map(c => c.text), data,
    correctionAfter: allCorr.filter(c => !c.justSaid).map(c => c.text), setup, question,
  };
  const composed = [...slots.ack, ...slots.correctionFirst, ...slots.data, ...slots.correctionAfter, ...slots.setup, ...slots.question].map(s => s.trim()).filter(Boolean).join(' ');
  const today = [p.say, ...p.data.map(d => d.text), p.question].map(s => s.trim()).filter(Boolean).join(' ');

  const releasedIds = p.data.flatMap(d => d.ids);
  const todaySegs: LintSegment[] = [
    { kind: 'say', text: p.say }, { kind: 'data', text: p.data.map(d => d.text).join(' '), revealIds: releasedIds, ...(p.exhibitId ? { exhibitId: p.exhibitId } : {}) }, { kind: 'tail', text: p.question },
  ];
  const composedSegs: LintSegment[] = [
    { kind: 'say', text: slots.ack.join(' ') },
    { kind: 'tail', text: slots.correctionFirst.join(' ') },
    { kind: 'data', text: [...slots.data, ...slots.correctionAfter].join(' '), revealIds: releasedIds, ...(p.exhibitId ? { exhibitId: p.exhibitId } : {}) },
    { kind: 'tail', text: [...slots.setup, ...slots.question].join(' ') },
  ];
  const lint = (segs: LintSegment[]) => lintTurn(segs.filter(s => s.text.trim()), { ...ctx, ended: p.ended });
  return {
    slots, composed, today, changed: composed !== today.replace(/\s+/g, ' ').trim(),
    moves: {
      setupMoved: setupFromSay,
      correctionsMoved: allCorr.filter(c => !c.justSaid).length + p.corrections.filter(c => c.justSaid && p.question.trim().startsWith(c.text.trim())).length,
      questionsWithheld, rewriteWithheld: [...rewritten],
    },
    lintToday: lint(todaySegs), lintComposed: lint(composedSegs),
  };
}

// ── C2 (`composeData`; design §3.1–3.4; Lorenzo's GO, 27 Oct): the data slot, spoken ──
// On today's decisions, in Stream and Settle alike (turnDataChecked): the exhibit handover last in the data line, so
// nothing after it reads as deferring it (b34a Marcus t6); no restatement of a line the model's say already spoke (L1,
// b34l Tyler t20); a deferral whose words name what the same turn released (L3, b36l Jasmine t6, b38l Marisol t6) says
// the items it still holds by their spoken names, or is dropped when it holds none.
type ComposeItem = { id: string; words: string[]; spoken: string };
export type DataSlotChange = { rule: 'L1' | 'L3' | 'exhibit_last'; what: string; to?: string };
const sentenceNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%]+/g, ' ').trim();
export function composeDataSlot<D extends {
  releases: { id: string }[]; restates: { id: string; value: string }[]; exhibit: { id: string; covers: string[]; title?: string } | null;
  defers: string[]; requests: { request: { what: string }; response: string; ledgerItemIds: string[] }[]; exhibitLast?: boolean; saidByModel?: string[];
}>(d: D, modelSay: string, itemOf: (id: string) => ComposeItem | undefined, caseNames: string[]): { data: D; changes: DataSlotChange[] } {
  const changes: DataSlotChange[] = [];
  const say = sentenceNorm(modelSay);
  // L1: a restated line the model already said in its say (it had been revealed, so it could).
  const restates = d.restates.filter(r => {
    const said = say.length > 0 && sentenceNorm(r.value).length >= 40 && say.includes(sentenceNorm(r.value));
    if (said) changes.push({ rule: 'L1', what: r.id });
    return !said;
  });
  // L1 on a release: the model's say already spoke the line — booked as released, not said a second time.
  const saidByModel = d.releases.filter(r => {
    const v = (r as { value?: string }).value ?? '';
    return say.length > 0 && sentenceNorm(v).length >= 40 && say.includes(sentenceNorm(v));
  }).map(r => r.id);
  for (const id of saidByModel) changes.push({ rule: 'L1', what: id });
  // L3: the deferral lines against what this turn gives (released, restated, on the exhibit handed over).
  const given = [...d.releases.map(r => r.id), ...restates.map(r => r.id), ...(d.exhibit?.covers ?? [])];
  const givenNouns = new Set(given.flatMap(id => itemOf(id)?.words ?? []).flatMap(w => [...keyNouns(w, caseNames)]));
  if (d.exhibit?.title) for (const n of keyNouns(d.exhibit.title, caseNames)) givenNouns.add(n);
  const defers = d.defers.flatMap(w => {
    const own = keyNouns(w, caseNames);
    const shared = [...own].filter(n => givenNouns.has(n));
    if (shared.length === 0) return [w];
    const held = d.requests.filter(r => r.response === 'defer' && r.ledgerItemIds.length > 0 && [...keyNouns(r.request.what, caseNames)].some(n => own.has(n)))
      .flatMap(r => r.ledgerItemIds).filter(id => !given.includes(id));
    // Answered: a shared noun the released items carry and the held ones don't ("fuel" beside the fuel line, when the
    // deferral holds wages and crew). With nothing held, only a deferral wholly about what was given is dropped — one
    // that still names something else keeps the ask's only word (f59f5ea8 t12, "Kelvexa's share in Europe").
    const heldNouns = new Set(held.flatMap(id => itemOf(id)?.words ?? []).flatMap(x => [...keyNouns(x, caseNames)]));
    const answered = shared.filter(n => !heldNouns.has(n));
    if (held.length > 0 ? answered.length === 0 : shared.length < own.size) return [w];
    const names = [...new Set(held.map(id => itemOf(id)?.spoken).filter((x): x is string => Boolean(x)))];
    const to = names.length > 0 ? names.join(' and ') : undefined;
    changes.push({ rule: 'L3', what: w, ...(to ? { to } : {}) });
    return to ? [to] : [];
  });
  if (d.exhibit) changes.push({ rule: 'exhibit_last', what: d.exhibit.id });
  return { data: { ...d, restates, defers, exhibitLast: true, ...(saidByModel.length > 0 ? { saidByModel } : {}) }, changes };
}
