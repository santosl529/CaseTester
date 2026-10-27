// One turn's data decisions from the model's declarations (or code's own,
// on code-written turns) — the same function in Stream (to deliver the data
// line while the model is still writing) and Settle (to book and compose), so
// both reach the same result from the same inputs.
import type { ModelTurn, DeclaredRequest } from '@/lib/agent/models/turn-schema';
import { resolveRequests } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import { decideData, spokenItemName, exactResolver, labelMatch, outsideAskScope, scopeRule, SPLIT_RULES, namedAsPart, keyNouns, changeForSplit, splitOfItem, heldForOrder, RELEASE_CAP, type DataDecisions, type ExhibitInfo, type ScopeRule } from './data-decisions';
import { switchOn } from '@/lib/cases/engine-switches';
import { findFalseRefusals, groupItemsAsked, coverageOf, coverageDetail, coverSpans, sentencesOf, BASIS, refusedItemIds } from './fact-check';
import { isGatedItem, exhibitIsGated, PT_REPLY_LIMIT, PT_NOT_ASKED_LIMIT, saysNothingMissing } from './pressure-test';
import { planForcedReleases, classifyDataRequests, classifyAsk, askCheckCatalog, missingPart, statedIn, dropStatedFigures, type DetectedDataRequest } from './data-requests';
import { askingSentences, addressedAskSentences, lateAskSentences, requestSentences, matchAskDetections, uncoveredAsks, undeclaredSentences, properNames, namesItem, namesNothing, namingWords, saysItemName, WANT_ASK_PHASES } from './request-signal';
import { tagsAgree, askGroups, askClauses, askTags, itemTagsAgree } from './item-tags';
import { correctsNow } from './math-checker-live';
import { shadowAskDecision, applyAskRefusals, applyModelKeep, applyMatches } from './ask-decision';
import { composeDataSlot, dropContradictedRefusals, wontGetToRemainder } from './turn-composer';
import { revealedValues, canReveal, labelWithPeriod } from './data-ledger';
import { unmetQualifiers, guardParts, mergeParts, qualifierItems, guardedItems, gateReading, statesAsked, coversAskedWords, askQualifiers, type Qualifier } from './ask-qualifiers';
import type { OnUsage, LlmUsage } from '@/lib/llm-usage';
import { costOf } from '@/lib/llm-pricing';
import { dataLineVersions } from '@/lib/cases/loader';

export function caseResolver(plan: ModelPlan): (raw: string) => string | null {
  const { ledger, caseData } = plan.state;
  return exactResolver([
    ...ledger.items.map(i => ({ id: i.id, names: [i.label] })),
    ...caseData.exhibits.map(e => ({ id: e.id, names: [e.title] })),
  ]);
}

// Turn kinds that ask for the recommendation (or close) release the open
// requests first (Rule 11: never ask on an assumption the candidate asked to
// check). Two at most, this turn's asks first. An existing exception to the
// pressure-test gate.
const FORCES_OPEN = new Set(['rec_ask', 'grace_ask', 'time_warning']);
// Whether the pressure-test gate holds gated items on this turn (turnData's `gateOn`; read by Phase 2's shadow decision).
export function ptGateOn(plan: ModelPlan): boolean {
  const { state } = plan;
  const satisfied = (state.ptSatisfiedNow ?? state.pressureTest.state === 'satisfied') || Boolean(state.ptWaivingNow) || state.pressureTest.state === 'waived';
  return !satisfied && !FORCES_OPEN.has(state.kind);
}

// Whether the pressure test counts as satisfied for this turn: persisted, or
// the judge says this turn's replies answered it — and, if not, whether this
// reply reaches the v3 bound and waives it (PT_REPLY_LIMIT replies while
// awaiting; PT_NOT_ASKED_LIMIT held turns when no structure was ever given,
// after code asked for one). Only model turns count. Resolved once (Stream
// and Settle both await it before deciding data) and cached on the plan.
// nothingMissing (19 Oct): a what's-missing probe answered "nothing is missing"
// counts as answered when the judge didn't count it (a bare claim to the judge);
// an answer the judge counted goes on as before.
export async function pressureTestOutcomeNow(plan: ModelPlan): Promise<{ satisfied: boolean; waiving: boolean; nothingMissing: boolean }> {
  const { state } = plan;
  const pt = state.pressureTest;
  const said = pt.state === 'awaiting' && (pt.intents ?? []).includes('mece') && saysNothingMissing(plan.ctx.candidateText);
  const judged = pt.state === 'awaiting' && Boolean((await state.probeVerdict)?.answered);
  const nothingMissing = said && !judged;
  if (state.ptSatisfiedNow !== undefined && state.ptWaivingNow !== undefined) return { satisfied: state.ptSatisfiedNow, waiving: state.ptWaivingNow, nothingMissing };
  const satisfied = pt.state === 'satisfied' || judged || nothingMissing;
  const waiving = !satisfied && state.kind === 'model' && (
    (pt.state === 'awaiting' && (pt.awaitingReplies ?? 0) + 1 >= PT_REPLY_LIMIT)
    || (pt.state === 'not_asked' && pt.structureAsked && pt.gatedTurns + 1 >= PT_NOT_ASKED_LIMIT));
  state.ptSatisfiedNow = satisfied;
  state.ptWaivingNow = waiving;
  return { satisfied, waiving, nothingMissing };
}

// basisCut: per ask the BASIS rule emptied, the items it cut (fix-wave 1, below);
// logged only; the check reads the ask's scope itself (decideCheckedAsk, round 5 E5 b).
// coverDeferred: asks a cover match vetoed the refusal of (round 6 Task 68, the tag gate below): a check's "none" is their named deferral.
// tagDeferred (round 6 Task 76 (b)): an entity or forecast/current mismatch off the check, deferred in the part's words —
// unchecked, holding no item, like coverDeferred. deferredItems: per such deferral (either kind), the items it came
// from, kept while it is tracked (Task 76 (a): flags.openDeferrals). deferralsOpened: those this turn says ("I'll come
// back to …"), to track; deferralsClosed: the tracked ones the first wrap-up turn says "We won't get to …" for.
export type TurnData = DataDecisions & { gatedIds: string[]; basisCut?: Record<string, string[]>; coverDeferred?: string[]; tagDeferred?: string[];
  deferredItems?: Record<string, string[]>; deferralsOpened?: { what: string; ids: string[]; need?: Record<string, string[]>; silent?: true }[]; deferralsClosed?: OpenDeferral[];
  // Phase 1 4.7 (modelDeferrals on): an ask said back in an item's label → the words it was asked in.
  askOrigin?: Record<string, string> };

// The candidate's asking sentence for an ask (round 6 Task 68; Lorenzo, 21 Oct: "Match
// the candidate's own sentence as well as the model's rewording"): of the message's
// asking sentences, the one sharing the most naming words (stemmed, the case's proper
// names aside: request-signal.ts namingWords) with the model's `what`; ties go to the
// first, none to undefined. coverageOf reads it on tagged cases only (R1, R3, R4).
export function askSentenceFor(what: string, sentences: string[], caseNames: string[] = []): string | undefined {
  const asked = namingWords(what, caseNames);
  let best: string | undefined;
  let most = 0;
  for (const s of sentences) {
    const n = [...namingWords(s, caseNames)].filter(w => asked.has(w)).length;
    if (n > most) { best = s; most = n; }
  }
  return best;
}
// The asking sentence coverageOf reads for an ask: on a tagged case only.
function askSentence(plan: ModelPlan, what: string, sentences?: string[]): string | undefined {
  const { state, ctx } = plan;
  if (!state.factBase.answerGate) return undefined;
  return askSentenceFor(what, sentences ?? askingSentences(ctx.candidateText, ctx.currentPhase), properNames(state.caseData.sttKeyterms));
}
// What tagsAgree reads for one item of an ask: the model's words and the candidate's
// sentence for it (entity, forecast/current; controller ruling, 21 Oct). On a list ask, the
// group the item answers (round 6 Task 70, controller ruling C3: "an entity named in one
// conjunct applies only to the items answering that conjunct"; item-tags.ts askGroups) —
// the group its cover phrase sits in, else the groups its line states — with the part of the
// sentence that matches it; an item answering no group reads the whole ask and sentence.
// `part`: the words a refusal for it says (the group, or the whole ask).
function tagTextFor(plan: ModelPlan, what: string, id: string, sentence?: string): { text: string; part: string } {
  const { factBase, ledger, caseData } = plan.state;
  const ask = what.trim();
  // The sentence's clause that matches the ask (68b item 6): its entity and current markers only; none matching, the sentence.
  const clauses = sentence ? askClauses(sentence) : [];
  const clause = sentence && clauses.length > 1 ? askSentenceFor(ask, clauses, properNames(caseData.sttKeyterms)) ?? sentence : sentence;
  const whole = { text: clause ? `${ask}\n${clause}` : ask, part: ask };
  const groups = askGroups(ask);
  if (groups.length < 2) return whole;
  const spans = coverSpans(ask, factBase, id);
  let own = groups.filter(g => spans.some(sp => sp.start < g.end && sp.end > g.start));
  const item = ledger.items.find(i => i.id === id);
  if (own.length === 0 && item) own = groups.filter(g => statesAsked(g.text, { label: labelWithPeriod(item as Parameters<typeof labelWithPeriod>[0]), value: item.value }, caseData.dataLedger));
  if (own.length === 0) return whole;
  const part = ask.slice(own[0].start, own.at(-1)!.end).trim();
  const said = sentence ? askSentenceFor(part, askGroups(sentence, { list: true }).map(g => g.text)) : undefined;
  return { text: said ? `${part}\n${said}` : part, part };
}
// The tag gate on a cover-matched item (round 6 Task 68; fix round 1, controller ruling,
// 21 Oct: on a tagged case it holds for every cover-matched id whatever path gives it —
// the coverage step, covers_added, the scope rules' cover exemption (R3, answersAsk)):
// tagsAgree on the ask and the candidate's sentence (per group, Task 70), then outsideAskScope
// (one-off, recurrence, basis, cut; the count is coverageOf's, kept as today). Null: it passes;
// always on an untagged case.
function coverGateMiss(plan: ModelPlan, what: string, id: string, sentence: string | undefined, scope = true): 'entity' | 'forecast' | 'scope' | null {
  const { ledger, factBase } = plan.state;
  if (!factBase.answerGate) return null;
  const t = tagsAgree(tagTextFor(plan, what, id, sentence).text, id, factBase);
  if (!t.agree) return t.why ?? 'entity';
  const item = ledger.items.find(i => i.id === id);
  if (!scope || !item) return null;
  // A cut the matched cover phrase itself carries cuts nothing (fix round 2; ruling 7, 15 Oct). The
  // scope rules read the list entry the cover sits in, not the whole ask (Task 70 fix round 2, 68b
  // item 1: b35 Hollis Bay Jasmine t10 "store count, distribution rate and bags per store per week"
  // — the per-store cut is the third entry's, not the store count's).
  const entry = coverEntry(what, id, factBase);
  return outsideAskScope(entry, item, factBase.quantities.find(q => q.id === id)?.names ?? [], { count: false, spans: coverSpans(entry, factBase, id) }) ? 'scope' : null;
}
// The list entry (item-tags.ts askGroups) an item's cover phrase sits in; the whole ask when the
// phrase isn't in it (a hit through the candidate's sentence) or the ask is one entry.
function coverEntry(what: string, id: string, fb: ModelPlan['state']['factBase']): string {
  const ask = what.trim();
  const groups = askGroups(ask);
  if (groups.length < 2) return what;
  const spans = coverSpans(ask, fb, id);
  const own = groups.filter(g => spans.some(sp => sp.start < g.end && sp.end > g.start));
  return own.length === 0 ? what : ask.slice(own[0].start, own.at(-1)!.end);
}

// Whether two data lines repeat each other word for word over a run of five or more words with two content words
// (review F1's near-verbatim duplication inside one utterance). Only read with coverNormalization on.
const RUN = 5;
export function repeatsLine(a: string, b: string): boolean {
  const words = (t: string) => (t.toLowerCase().match(/[a-z0-9$%.,]+/g) ?? []).map(w => w.replace(/[.,]$/, ''));
  const wa = words(a), wb = words(b);
  if (wa.length < RUN || wb.length < RUN) return false;
  const runs = new Set<string>();
  for (let i = 0; i + RUN <= wb.length; i++) runs.add(wb.slice(i, i + RUN).join(' '));
  for (let i = 0; i + RUN <= wa.length; i++) {
    const run = wa.slice(i, i + RUN);
    if (runs.has(run.join(' ')) && run.filter(w => w.length >= 4).length >= 2) return true;
  }
  return false;
}

const PROPER_ADJECTIVES = ['European', 'American', 'US', 'EU', 'UK', 'Canadian', 'Asian'];

// Must-reach items (round 6 Task 72; Lorenzo, 21 Oct, round 6: "Must-reach mechanism. Code releases a case-declared
// item at a declared point if the candidate hasn't asked by then. prof-002 only for now: competitor_entry before
// Exhibit 3 (the network fix); new_route_rampup before the recommendation ask. The report should note when an item
// was volunteered."; audit row 9, b36 Larkspur Jasmine bbf78ab8 t10: Exhibit 3 went out and the competitor was never
// told). At a point — the exhibit this turn hands over, by any path (decideData's here; settle-turn.ts's held handover
// in the question), or a recommendation ask (code's: rec_ask, time_warning, grace_ask, here; the model's question as
// stage-evidence.ts reads it, in Settle) — each item due before it that isn't out: not revealed, not released, shown
// or restated this turn, never volunteered before (flags.mustReach: never twice), not waiting on the release order.
// Never on a close turn (nor its wait). Past the release cap: the case owes it. Released ahead of the exhibit and the
// question (data-decisions.ts renders it first); Settle logs `must_reach` and the `volunteered` event. A case with no
// `mustReach` (prof-001) gets nothing.
export const MUST_REACH_REC_KINDS: ReadonlySet<string> = new Set(['rec_ask', 'time_warning', 'grace_ask']);
export function mustReachItems(plan: ModelPlan, at: { exhibit?: string | null; recommendation?: boolean }, d: Pick<DataDecisions, 'releases' | 'exhibit' | 'restates'>): DataDecisions['releases'] {
  const { state, ctx } = plan;
  const due = state.caseData.mustReach ?? [];
  if (due.length === 0 || state.kind === 'close' || state.kind === 'close_wait') return [];
  const done = new Set((ctx.flags.mustReach as string[] | undefined) ?? []);
  const exhibits: ExhibitInfo[] = state.caseData.exhibits.map(e => ({ id: e.id, title: e.title, coversLedgerItems: e.coversLedgerItems, after: e.after, requiresItems: e.requiresItems }));
  const out: DataDecisions['releases'] = [];
  for (const m of due) {
    const point = m.before === 'recommendation' ? at.recommendation === true : (at.exhibit ?? null) === m.before;
    if (!point || done.has(m.item) || state.ledger.revealed.has(m.item) || out.some(r => r.id === m.item)) continue;
    if (d.releases.some(r => r.id === m.item) || d.restates.some(r => r.id === m.item) || Boolean(d.exhibit?.covers.includes(m.item))) continue;
    if (heldForOrder(m.item, exhibits, state.shownExhibitIds, state.ledger, state.stagesOut)) continue;
    const item = state.ledger.items.find(i => i.id === m.item);
    if (item) out.push({ id: m.item, value: item.value, earlier: false, mustReach: m.before });
  }
  return out;
}

// Wrap-up and close turns (Lorenzo, 19 Oct, round-2 ruling 3): the code-written
// close, close wait, grace ask and time warning, and any turn of the
// recommendation or wrap phase once the recommendation is in. A named deferral
// there is "We won't get to <ask> today." — the case won't come back to it; so is
// every other deferral there (round-3 ruling 4: decideData's `wrapUp`).
// Code's recommendation ask too (controller, 19 Oct; batch 32 Larkspur Marcus t28).
const WRAP_UP_KINDS: ReadonlySet<string> = new Set(['close', 'close_wait', 'grace_ask', 'time_warning', 'rec_ask']);
export function wrapUpTurn(plan: ModelPlan): boolean {
  const { state, ctx } = plan;
  return WRAP_UP_KINDS.has(state.kind) || ((ctx.currentPhase === 'RECOMMENDATION' || ctx.currentPhase === 'WRAP') && state.recommendationReceived);
}

// An explicit deferral with no item is checked by a small model before code
// refuses it (Lorenzo, 19 Oct; engine-asks R1, "yes, with a guard"; batch 32
// Aldermoor Marcus t5: the generic "settle your structure" line answered
// nothing). The check is the data-request classifier in detection mode with the
// ledger as the catalog: an ask it maps to none is refused; no verdict (failure,
// timeout) is a named deferral in the candidate's words, so no code-spoken
// refusal goes out unchecked. Stream and Settle share the verdict through the
// plan (one call per ask per turn). What code does with a mapping is
// `decideCheckedAsk` (round 5, E5, below).
// Round-2 ruling 2 (Lorenzo, 19 Oct): "R1 covers every code refusal of an
// unmatched ask, item-less releases included … Cap the Haiku check at ~1.5s; on
// a timeout or error, use the named deferral, never a refusal." Item-less
// releases (a code-written turn's detections among them) go through it too.
// An ask a finer-cut scope rule emptied (it matched an item that can't answer
// it) keeps that coarse item — one that holds the asked quantity at a coarser
// cut (Lorenzo, 20 Oct, round 5 E1; batch 34 Aldermoor Marisol t14, Jasmine t4):
// released under every gate with "I don't have <the ask>." for the finer cut
// (turnData, `scope_coarse`). Coarse items all out already (said, or on a shown
// exhibit): the refusal alone, unchecked (4b stands). Coarse items held (release
// order, pressure-test gate, cap): checked like any other refusal. An ask emptied
// only of topic siblings (a change item asked for a split, `changeForSplit`) or a
// finer ask backed only by an exhibit: refused unchecked, as before E1 (the
// controller's rulings, 20 Oct). This reverses the round-2 exception elsewhere.
// Round-3 ruling 5 (Lorenzo, 19 Oct; batch 28 Marisol t8, batch 30 Anika t6):
// "Code refuses only when the check says the case doesn't hold it." An ask the
// check maps to a ledger item is never refused on the check's say alone — out of
// the ask's scope included (E5 b below gives such an item E1's form).
const DEFER_CHECK_TIMEOUT_MS = 1500;
// The check call's tokens and cost on its record, for the check's cost per session.
function usageDetail(u: LlmUsage): { inputTokens: number; outputTokens: number; costUsd?: number } {
  let costUsd: number | undefined;
  try { costUsd = costOf(u); } catch { costUsd = undefined; }   // an unpriced model: tokens only
  return { inputTokens: u.inputTokens, outputTokens: u.outputTokens, ...(costUsd !== undefined ? { costUsd } : {}) };
}
// Whether the scope rules keep this item for the ask (the case's covers first).
function answersAsk(plan: ModelPlan, what: string, id: string): boolean {
  const { ledger, factBase } = plan.state;
  const item = ledger.items.find(i => i.id === id);
  if (!item) return true;
  // A cover hit counts only through the tag gate (fix round 1): one whose tags or scope disagree doesn't force it in.
  const sentence = askSentence(plan, what);
  if (coverageOf(what, factBase, { sentence }).items.includes(id) && !coverGateMiss(plan, what, id, sentence)) return true;
  return !outsideAskScope(what, item, factBase.quantities.find(q => q.id === id)?.names ?? []);
}

// The check's verdict on one unmatched ask: mapped (null: no verdict), the
// ledger items it found, those of them the ask's scope rules rule out, and those
// the check says hold only the nearest data (`partial`, round 5b Task 56) with the
// asked part each lacks (`missing`, validated: no digit, the ask's own words).
// `guard` (round 5c Task 61): the qualifiers of the ask no mapped item states, the
// refusal's parts, and the mapped items it makes partial (qualifierGuard below).
// `tagDeferred` (Phase 1 4.3, haikuTagGate): the check's full items whose item tags disagree with the ask, when taking
// them off would leave no item or make a refusal — the verdict is then no verdict (the named deferral), holding none.
export type CheckVerdict = { mapped: boolean | null; ids: string[]; outOfScope: string[]; partial: string[]; missing: Record<string, string>; guard?: QualifierGuard; tagDeferred?: string[]; tagSilent?: string[] };
// `drop` (round 6 Task 70, the answer gate on a tagged case): the check's items the gate took
// off — not in `ids`, never given; `said`: the gate's tag parts, said even when one is the whole ask.
// `of` (fix round 1): each gate part's own item, credited in its `partial_dropped` record.
export type QualifierGuard = { unmet: Qualifier[]; parts: string[]; ids: string[]; drop?: string[]; said?: string[]; of?: Record<string, string> };

// The qualifier guard (round 5c Task 61; Lorenzo, 20 Oct, ruling 1: "If an ask names a
// qualifier the item's line doesn't contain (a period …; a scope …; or a second topic
// with no item), that item counts as partial whatever Haiku labels it, and the refusal
// names the qualifier"; r5b-haiku-check #18, 36, 49/50, 63, 66). On the check's verdict
// only — never on the model's own mapped requests or the message classifier's. Read from
// the ask's words and the mapped items' labels and lines (ledger values, server-side;
// ask-qualifiers.ts); a qualifier any mapped item states is met, so the refusal never
// denies a mapped line. Its parts are the ask's words; a figure in them must be one a
// candidate turn said (the post-turn audit allows those), else no guard. The check's own
// valid missing parts it doesn't cover join them (mergeParts).
// Which items it makes partial (ask-qualifiers.ts guardedItems; fix rounds 1 and 2, the
// controller's rulings on b34l Tyler t2 / #52 and the review's finding 5): one conjunct,
// every mapped item; two or more, the items answering the conjunct an unmet period or
// scope sits in, and those answering no conjunct — the rest keep Haiku's label, so a full
// one goes through every gate (a held one deferred by its name and booked) and the
// missing part is refused beside it (decideCheckedAsk's mixed path).
function qualifierGuard(plan: ModelPlan, what: string, ids: string[], missing: Record<string, string>): QualifierGuard | null {
  const items = ids.flatMap(id => plan.state.ledger.items.filter(i => i.id === id));
  if (items.length === 0) return null;
  const ledger = plan.state.caseData.dataLedger;
  const qitems = qualifierItems(items, ledger, i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]));
  const unmet = unmetQualifiers(what, qitems, ledger);
  const own = guardParts(what, unmet);
  if (own.length === 0) return null;
  if (unsaidFigures(plan, own)) return null;
  return { unmet, parts: mergeParts(own, checkMissingParts(what, ids, missing), what), ids: guardedItems(what, qitems, unmet, ledger) };
}
// A part with a figure no candidate turn said is never said (the guard's rule; FR-4).
const figuresOf = (t: string) => [...t.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => m[0].replace(/,/g, ''));
function unsaidFigures(plan: ModelPlan, parts: string[]): boolean {
  const said = new Set([plan.ctx.candidateText, ...plan.state.turnRows.filter(t => t.role === 'candidate').map(t => t.text)].flatMap(figuresOf));
  return parts.some(p => figuresOf(p).some(f => !said.has(f)));
}
// The check's own valid missing parts (not the whole ask), for the guard's parts to merge.
function checkMissingParts(what: string, ids: string[], missing: Record<string, string>): string[] {
  const norm = (m: string) => m.replace(/\s+/g, ' ').trim().toLowerCase();
  return ids.flatMap(id => (missing[id] !== undefined && norm(missing[id]) !== norm(what) ? [missing[id]] : []));
}

// The answer gate's verdict on the check's mapping as the guard's record (Task 70: it keeps its
// shape and adds `drop`): its parts with the check's own valid missing parts merged, the items
// it makes partial, those it dropped, and the tag parts said whole.
function gateGuard(what: string, gate: GateVerdict | null, ids: string[], missing: Record<string, string>): QualifierGuard | null {
  if (!gate) return null;
  const own = gate.refuse.map(r => r.part);
  const parts = own.length > 0 ? mergeParts(own, checkMissingParts(what, ids, missing), what) : [];
  const of = Object.fromEntries(gate.refuse.filter(r => r.ids.length > 0).map(r => [r.part, r.ids[0]]));
  return { unmet: gate.unmet, parts, ids: gate.partial, ...(gate.drop.length > 0 ? { drop: gate.drop } : {}), ...(gate.said.length > 0 ? { said: gate.said } : {}), ...(Object.keys(of).length > 0 ? { of } : {}) };
}

// The answer gate (round 6 Task 70; Lorenzo, 21 Oct: "The guard on every path that gives a
// data line, not just the check's labels, with the company and forecast/current tags inside
// it. When it finds a topic unmet, refuse that part ("I don't have <part>") rather than
// releasing the item as a coarse answer."). On a tagged case (`factBase.answerGate`; null on
// an untagged one — prof-001 decides as before), for one ask and the items a path maps it to:
//   - the round-5c guard's reading in the round-6 grammar (ask-qualifiers.ts gateReading;
//     period, scope and topic from the model's `what` only — controller ruling, 21 Oct);
//   - tagsAgree per item on its group of the ask and the candidate's sentence (entity and
//     forecast/current read from the sentence too; tagTextFor, ruling C3).
// A topic unmet, an entity or a forecast mismatch: the items answering that part are dropped
// (`drop`: not given, restated, or given as a coarse item) and the part refused. A period or
// scope unmet: the items `partial` — E1's form, the line and the refusal when not out, the
// refusal alone when out or held — as the guard. Every part is said unchecked (turnData's
// `gateRefused`, never `toCheck`: no model call BASE didn't make) once the M6 covers veto
// passes it. A tag part a kept item's line states is answered by it: not refused (the entrant's
// "cost per seat and fares" beside the competitor line). `topics: false` — every path but the
// check's verdicts (fix round 1, controller ruling, 21 Oct: the topic test runs on the Haiku
// check's verdicts only; the model's own mapping, the covers, the names and the message
// classifier's detections are the semantic topic judgement — noun overlap can't read "price
// point" / "price per bag", "churn" / "cancelled", "ramp" / "mature"): entity, forecast, period
// and scope only. `tags: false`: tagged already (R1's coverGateMiss). A topic part with no item
// still makes a verdict (fix round 1, b34 Aldermoor Raj t17: "royalty step-downs or rights
// reversion" refused beside the partner line). Not run on forced or fulfilment releases (judged
// when first asked) or exhibits.
export type AnswerGate = { refuse: { part: string; ids: string[] }[]; drop: string[]; partial: string[] };
// `defer` (round 6 Task 76, `opts.defer`: the non-check paths, TAGS_ON_NONCHECK_PATHS on): the tag parts — an entity
// or forecast/current mismatch, and 68b-5's line-only agreement — as deferrals, never refusals; each with the
// mismatched items it came from (a line-only item is given whole: none). Empty off it.
export type GateVerdict = AnswerGate & { unmet: Qualifier[]; tagDropped: { id: string; why: 'entity' | 'forecast' }[]; said: string[]; defer: { part: string; ids: string[] }[] };
export function answerGate(plan: ModelPlan, what: string, ids: string[], sentence?: string, opts: { topics?: boolean; tags?: boolean; defer?: boolean } = {}): GateVerdict | null {
  const { ledger, factBase, caseData } = plan.state;
  if (!factBase.answerGate) return null;
  const items = [...new Set(ids)].flatMap(id => ledger.items.filter(i => i.id === id));
  if (items.length === 0) return null;
  const lines = caseData.dataLedger;
  const labelOf = (i: (typeof items)[number]) => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0]);
  const states = (p: string, i: (typeof items)[number]) => statesAsked(p, { label: labelOf(i), value: i.value }, lines);
  // A rival entity's item is the comparator: it meets a competitor or benchmark scope (fix round 1;
  // fix round 2, controller ruling: rival entities only — launch-001's chips are the client's own business).
  const owned = new Set((factBase.tags?.entities ?? []).filter(e => e.rival === true).flatMap(e => e.items));
  const qitems = qualifierItems(items, lines, i => labelWithPeriod(i as Parameters<typeof labelWithPeriod>[0])).map(q => (owned.has(q.id) ? { ...q, other: true as const } : q));
  let read = gateReading(what, qitems, lines, { topics: opts.topics !== false });
  if (unsaidFigures(plan, read.parts)) read = { unmet: [], parts: [], partial: [], topicDrop: [] };
  const tagged: { id: string; why: 'entity' | 'forecast'; part: string }[] = [];
  // Items kept only because their line names the asked entity (68b item 5): partial, their part refused beside them.
  const lineOnly: { id: string; part: string }[] = [];
  if (opts.tags !== false) {
    for (const i of items) {
      const tt = tagTextFor(plan, what, i.id, sentence);
      const t = tagsAgree(tt.text, i.id, factBase);
      if (!t.agree) tagged.push({ id: i.id, why: t.why ?? 'entity', part: tt.part });
      else if (t.coarse) lineOnly.push({ id: i.id, part: tt.part });
    }
  }
  const drop = [...new Set([...tagged.map(x => x.id), ...read.topicDrop])];
  const kept = items.filter(i => !drop.includes(i.id));
  const tagParts = [...new Set(tagged.map(x => x.part))].filter(p => !kept.some(i => states(p, i)));
  const lineParts = [...new Set(lineOnly.map(x => x.part))];
  // Task 76 (b) (Lorenzo, 21 Oct, round 6 rulings, 1: "a mismatch on those paths may defer, never refuse"): off the
  // check, the tag parts are deferred, and a line-only item (68b-5) is given whole with no refusal beside it.
  const deferTags = opts.defer === true;
  const parts = mergeParts(read.parts, deferTags ? [] : [...tagParts, ...lineParts], what);
  const partial = parts.length > 0 ? [...new Set([...read.partial, ...(deferTags ? [] : lineOnly.map(x => x.id))])].filter(id => !drop.includes(id)) : [];
  const defer = deferTags ? [...new Set([...tagParts, ...lineParts])].map(part => ({ part, ids: tagged.filter(x => x.part === part).map(x => x.id) })) : [];
  if (drop.length === 0 && partial.length === 0 && parts.length === 0 && defer.length === 0) return null;
  // The items each part is about: a tag part's own; a qualifier part's partial or topic-dropped items that state it, else all of them.
  const pool = items.filter(i => partial.includes(i.id) || read.topicDrop.includes(i.id));
  const partIds = (p: string) => {
    const own = [...tagged, ...lineOnly].filter(x => x.part === p).map(x => x.id);
    if (own.length > 0) return own;
    const st = pool.filter(i => states(p, i));
    return (st.length > 0 ? st : pool).map(i => i.id);
  };
  const refuse = parts.map(part => ({ part, ids: partIds(part) }));
  // A partial item stating no part goes with the first qualifier part (fix round 1: never given whole beside its own refusal).
  const lone = partial.filter(id => !refuse.some(r => r.ids.includes(id)));
  const first = refuse.find(r => !tagParts.includes(r.part) && !lineParts.includes(r.part));
  if (first && lone.length > 0) first.ids = [...first.ids, ...lone];
  return { refuse, drop, partial, unmet: read.unmet, tagDropped: tagged.map(({ id, why }) => ({ id, why })), said: parts.filter(p => tagParts.includes(p)), defer };
}

// The tags off the check (round 6 Task 76 (b); Lorenzo, 21 Oct, round 6 rulings, 1: "On the other paths: the company
// and forecast/current tag check may run only if it adds 0 new false refusals and 0 wrong deferrals in the replay; if
// it adds any, leave those paths as they are today; a mismatch on those paths may defer, never refuse."). One switch:
// on (TAGS_ON_NONCHECK_PATHS=1), the answer gate on the model's mapped asks (the message's detections among them) and
// the names remap reads entity and forecast/current, and a mismatch defers (answerGate `defer`), tracked until it
// resolves. Off — the default since Task 76 fix round 1 (controller, applying ruling 1 after the replay: it added a
// wrong deferral, b34 Aldermoor Marcus t10 "Hold that thought on the share of covered lives where Nimbrel has
// exclusive or preferred status" — data the case doesn't hold): those paths read no tags, as at 14cafef (Task 69's
// head). Unchanged either way: the Haiku check's verdicts (tags, topic, refusals), and Task 68's cover gate on the
// coverage step and covers_added (coverGateMiss, at 14cafef already; ruling 4: "Vetoed cover → deferral … fine").
export const tagsOnNoncheckPaths = (env: Record<string, string | undefined> = process.env) => env.TAGS_ON_NONCHECK_PATHS?.trim() === '1';
const noncheckTags = (): { tags?: false; defer?: true } => (tagsOnNoncheckPaths() ? { defer: true } : { tags: false });

// What code does with a verdict (Lorenzo, 20 Oct, round 5 E5: "build (a) and
// (b). Not (c). Add (d): a deferral names the item it will deliver, not the
// candidate's words, and a mapped item that's releasable now goes now."; B1+B2:
// 10 of 13 mappings were "I'll come back to <ask>" and never released). The one
// decision for a verdict — turnData applies it under its gates (Tasks 50 and 51
// send their asks through it too):
//   - no verdict: the named deferral in the candidate's words, holding no item (as before);
//   - mapped to none: refused;
//   - mapped to items in the ask's scope (`items`), each asked in its own label:
//     (a) all of them already out (said, or on a shown exhibit): restated through
//     the restate path (cap 3), never deferred — a pure re-ask of those very
//     items, the re-ask 4b allows; with any not yet out, only those are asked —
//     the ones out are not said again (controller ruling, 20 Oct, fix round 1:
//     Quillpath Raj t11 hears upgrade_timing, not the cohort lines again); (d) one releasable now under every gate turnData
//     applies (pressure test, release order, cap, the exhibit handed over) goes
//     now; one that isn't is deferred by its spoken name and booked with its
//     ledger id, so it is followed up (forced release, open request). On a
//     wrap-up or close turn the "We won't get to" rules apply;
//   - (b) mapped only to items out of the ask's scope (`coarse`): E1's form —
//     "I don't have <the ask>." with the coarse item's line when one can be
//     released (not yet out, under the gates); none: the refusal stands. A change
//     item asked for a split is a sibling, never a coarse item (E1's ruling), so
//     an ask mapped only to siblings is refused.
//   - E5 partial (Lorenzo, 20 Oct, round 5b job 3: "Partial → E1's form ("I don't
//     have <the asked part>." + the item's line)"): an item the check says holds
//     only the nearest data, not the asked part, is a coarse item like one out of
//     scope; the refusal says the check's `missing` parts (`coarse.missing`, joined —
//     the whole ask when one part is the whole ask or an item is out of scope). Out
//     already: the refusal alone (4b); held by a gate: as E1's held coarse item.
// Full in-scope items win over out-of-scope and partial ones in a mixed mapping,
// as for the model's own mapping (the scope rule drops the rest silently).
// `dropped`: the partial parts no refusal says, and why — the part is the whole ask
// beside a full item (`whole_ask`), or a ledger item or the prompt covers it
// (`false_refusal`) — for checkAsk's `partial_dropped` record (final review I5, M6).
export type DroppedPart = { id: string; missing: string; why: 'whole_ask' | 'false_refusal' };
// `refuse` with `missing` (round 6 Task 70): the answer gate dropped every mapped item; its parts are the refusal.
export type CheckedAsk =
  | { kind: 'named'; tagDeferred?: string[] }
  | { kind: 'refuse'; missing?: string[]; dropped?: DroppedPart[] }
  | { kind: 'items'; ids: string[]; missing?: string[]; dropped?: DroppedPart[] }
  | { kind: 'coarse'; ids: string[]; missing?: string[]; dropped?: DroppedPart[] };
export function decideCheckedAsk(plan: ModelPlan, what: string, v0: CheckVerdict): CheckedAsk {
  if (v0.mapped === null) return v0.tagDeferred ? { kind: 'named', tagDeferred: v0.tagDeferred } : { kind: 'named' };
  const { ledger } = plan.state;
  const ids = v0.ids.filter(id => ledger.items.some(i => i.id === id));
  const gateDrop = v0.guard?.drop ?? [];
  // A guard with no parts (the answer gate only dropped items): Haiku's partials decide, as with no guard.
  const v: CheckVerdict = v0.guard && v0.guard.parts.length === 0 ? { ...v0, guard: undefined } : v0;
  if ((!v.mapped || ids.length === 0) && !(gateDrop.length > 0 && v.guard)) return { kind: 'refuse' };
  // A guarded ask (Task 61): the items it makes partial join Haiku's, the guard's parts refused.
  const partial = new Set([...(v.partial ?? []), ...(v.guard?.ids ?? [])]);
  // A partial's refusal as said: figures the mapped items' lines state dropped, a plan name kept (fix round 2).
  const lines = [...ids, ...gateDrop].flatMap(id => ledger.items.filter(i => i.id === id).map(i => i.value));
  const said = (m: string) => refusalPhrase(dropStatedFigures(m, lines), plan);
  const norm = (m: string) => m.replace(/\s+/g, ' ').trim().toLowerCase();
  const whole = (m: string) => norm(m) === norm(what);
  // A part refused after the coverage step must not refuse data the case holds (final
  // review M6): read as the refusal it becomes, with the false-refusal veto the model's
  // own refusals get (stream-turn.ts vetoReason) — flagged, it is not said.
  const revealedNow = new Set(Object.keys(revealedValues(ledger)));
  const falseRefusal = (m: string) => findFalseRefusals(`I don't have ${m}.`, plan.state.factBase, revealedNow, { covers: true }).length > 0;
  const dropped: DroppedPart[] = [];
  const keep = (id: string, m: string) => {
    if (!falseRefusal(m)) return true;
    dropped.push({ id, missing: m, why: 'false_refusal' });
    return false;
  };
  const withDropped = <T extends object>(d: T) => (dropped.length > 0 ? { ...d, dropped } : d);
  // Round 6 Task 70: every mapped item dropped by the answer gate (a topic, entity or forecast
  // unmet; audit rows 2, 10, 18, 19): refused by the gate's parts, each through the M6 veto
  // (the whole ask is no rewrite); none left — every part names data the case holds — the
  // named deferral, holding no item: neither a line that doesn't answer nor a false refusal.
  // Fix round 1 (b36 Aldermoor Raj t11: funnel_rates restated beside the forecast's refusal): a
  // gate drop that leaves only items out already, Haiku's full ones, says the refusal alone — at
  // BASE the dropped item not yet out would have gone and the out ones not been said again.
  const fullNow = ids.filter(id => !v.outOfScope.includes(id) && !partial.has(id));
  const leftOut = gateDrop.some(id => !ledger.revealed.has(id)) && fullNow.length > 0 && fullNow.every(id => ledger.revealed.has(id)) && (v.guard?.parts.length ?? 0) > 0;
  if (ids.length === 0 || !v.mapped || leftOut) {
    const parts = [...new Set(v.guard!.parts.flatMap(m => (whole(m) ? [said(m)] : keep(v.guard!.of?.[m] ?? v.guard!.drop?.[0] ?? '', said(m)) ? [said(m)] : [])))];
    if (parts.length === 0) return { kind: 'named' };
    return withDropped({ kind: 'refuse' as const, missing: parts });
  }
  // A guarded ask says the guard's parts; Haiku's own whole-ask partial is still logged (fix round 2, finding 6).
  if (v.guard) for (const id of (v.partial ?? []).filter(x => ids.includes(x))) if (whole(v.missing?.[id] ?? what)) dropped.push({ id, missing: v.missing?.[id] ?? what, why: 'whole_ask' });
  const inScope = ids.filter(id => !v.outOfScope.includes(id) && !partial.has(id));
  const notOut = inScope.filter(id => !ledger.revealed.has(id));
  if (inScope.length > 0) {
    // Mixed full + partial (fix round 2, the controller's ruling; r5b-haiku-pre #18):
    // the full items decide as before, and each partial item's missing part is
    // refused beside them; the partial item itself is not given.
    // Never the whole ask beside a full item (fix round 3: it would refuse the part just
    // answered): a partial whose missing part didn't hold (checkAsk's fallback) gets no refusal.
    // Such a partial's part is logged (`partial_dropped`), the behaviour Lorenzo's to rule on (final review I5).
    // A guarded ask's parts (a missing topic beside the items answering the others; fix round 1).
    const asked = v.guard ? v.guard.parts.map(m => ({ id: ids.find(id => v.missing?.[id] === m) ?? v.guard!.ids[0] ?? ids[0], m }))
      : ids.filter(id => partial.has(id)).map(id => ({ id, m: v.missing?.[id] ?? what }));
    const refused = [...new Set(asked.flatMap(({ id, m }) => {
      // A gate tag part is said even when it is the whole ask: the items answering it are dropped (Task 70).
      if (whole(m) && !v.guard?.said?.includes(m)) { dropped.push({ id, missing: m, why: 'whole_ask' }); return []; }
      return keep(id, said(m)) ? [said(m)] : [];
    }))];
    return withDropped({ kind: 'items' as const, ids: notOut.length > 0 ? notOut : inScope, ...(refused.length > 0 ? { missing: refused } : {}) });
  }
  const coarse = ids.filter(id => !changeForSplit(what, ledger.items.find(i => i.id === id)!));
  if (coarse.length === 0) return { kind: 'refuse' };
  // Every partial's missing part, joined ("I don't have X or Y."; final review I1, #55
  // b35h Marcus t9: only the first partial's part was said). The whole ask instead when
  // a coarse item is out of scope (it answers none of the ask), or a partial's part fell
  // back to the whole ask (checkAsk) — the ask's own words cover it.
  const parts = v.guard ? v.guard.parts : coarse.filter(id => partial.has(id)).map(id => v.missing?.[id] ?? what);
  if (parts.length === 0) return { kind: 'coarse', ids: coarse };   // out of scope only: the ask, as before
  const wholeAsk = coarse.some(id => !partial.has(id)) || parts.some(whole);
  const partIds = v.guard ? parts.map(m => coarse.find(id => v.missing?.[id] === m) ?? coarse[0]) : coarse.filter(id => partial.has(id));
  const said1 = wholeAsk ? [{ id: partIds[0], m: said(what) }]
    : parts.flatMap((m, i) => (parts.findIndex(x => norm(x) === norm(m)) === i ? [{ id: partIds[i], m: said(m) }] : []));
  // A part a ledger item covers is not said (M6); none left: the ask's own refusal, as before the rewrite.
  // The whole ask is no rewrite: the coverage step judged it (turnData).
  const missing = wholeAsk ? said1.map(x => x.m) : said1.filter(x => keep(x.id, x.m)).map(x => x.m);
  return withDropped({ kind: 'coarse' as const, ids: coarse, ...(missing.length > 0 ? { missing } : {}) });
}

// A refusal phrase led by one of the case's names, not possessive ("Starter cohort
// beyond month 12"): "data on the Starter cohort …" — a sentence's lower-casing would
// read the plan name as a common word (fix round 2, r5b-haiku-pre #64).
function refusalPhrase(m: string, plan: ModelPlan): string {
  const [first = '', next = ''] = m.trim().split(/\s+/);
  const names = new Set(properNames(plan.state.caseData.sttKeyterms));
  return names.has(first) && /^[a-z]/.test(next) ? `data on the ${m.trim()}` : m;
}

const DECIDED: Record<CheckedAsk['kind'], string> = {
  named: 'no verdict: a named deferral',
  refuse: 'maps to no item: refused',
  items: 'mapped to a ledger item: restated if out, released if it can go now, else deferred by its name',
  coarse: 'mapped only to items outside the ask or holding only the nearest data: the coarse item\'s line if one can go, and the refusal',
};

// The check, cached per ask for the turn. Out of scope is read for every
// mapping, a BASIS-emptied ask's included (a basis ask mapped back to the item
// it asks about is not answered by that item's line: batch 32 Larkspur Marisol t27).
export function checkAsk(plan: ModelPlan, what: string, onUsage?: OnUsage, cut: string[] = []): Promise<CheckVerdict> {
  const cache = plan.state.deferChecks;
  const cached = cache.get(what);
  if (cached) return cached;
  const run = (async (): Promise<CheckVerdict> => {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const TIMED_OUT = Symbol('timed out');
    const timeout = new Promise<typeof TIMED_OUT>(r => { timer = setTimeout(() => r(TIMED_OUT), DEFER_CHECK_TIMEOUT_MS); });
    // The check's own prompt (classifyAsk, round 5b Task 56): the ask, and the
    // case's items with their labels and masked lines (built once per case). Usage
    // is logged as 'ask_check' with the ask ($/case, PRD §13) and kept on the record
    // below. A call the turn stopped waiting for still costs its tokens: its usage row
    // goes out when it settles, marked `late` (final review I3) — the record, written
    // at the cap, says `timedOut`, and its latencyMs is the added latency.
    let usage: LlmUsage | undefined;
    let waited = false;
    const raced = await Promise.race([
      classifyAsk({
        what, catalog: askCheckCatalog(plan.state.caseData.dataLedger),
        onUsage: u => { const row: LlmUsage = { ...u, ask: what, ...(waited ? { late: true as const } : {}) }; usage = row; onUsage?.(row); },
      }).catch(() => null),
      timeout,
    ]).finally(() => clearTimeout(timer));
    waited = true;
    const timedOut = raced === TIMED_OUT;
    const found = timedOut ? null : raced;
    // The check's ids pass the tag gate's tagsAgree on a tagged case (fix round 1, controller
    // ruling, 21 Oct; audit row 18: "currently on an advanced therapy" mapped to the forecast
    // peak share): one whose tags disagree is no answer — dropped (`tagDropped`); scope is the
    // verdict's own (outOfScope, below).
    // Round 6 Task 70: on a tagged case the answer gate reads the verdict in place of the
    // qualifier guard (whose output it subsumes) — its tag drops are `tagDropped`, as Task 68
    // logged them; its topic drops leave `ids` too, never given (audit row 10).
    const foundIds = found === null ? [] : [...new Set(found.items.map(f => f.id))];
    const gate = found === null ? null : answerGate(plan, what, foundIds, askSentence(plan, what));
    const tagDropped = gate?.tagDropped.map(x => x.id) ?? [];
    const gateDrop = gate?.drop ?? [];
    const ids = foundIds.filter(id => !gateDrop.includes(id));
    const mapped = found === null ? null : ids.length > 0;
    const outOfScope = ids.filter(id => answersAsk(plan, what, id) === false);
    // Phase 1 4.2 (`coarseKeepNamed`): which scope rule ruled each out, logged.
    const ruleOf = (id: string) => { const item = plan.state.ledger.items.find(i => i.id === id); return item ? scopeRule(what, item, plan.state.factBase.quantities.find(q => q.id === id)?.names ?? []) : null; };
    const outOfScopeRules = outOfScope.length > 0 && switchOn(plan.state.caseData, 'coarseKeepNamed') ? Object.fromEntries(outOfScope.map(id => [id, ruleOf(id)])) : null;
    // A partial's missing part, checked again here (a replayed or recorded verdict
    // isn't parsed): a span of the ask from a list break, else the ask's own words;
    // one the item's own line states is no missing part — the item is full when its
    // line states the whole ask too, else the ask's words (fix round 2, the
    // controller's ruling; r5b-haiku-pre #49/#50, #33). The line is the ledger value,
    // server-side only.
    const valueOf = (id: string) => plan.state.ledger.items.find(i => i.id === id)?.value ?? '';
    const partial: string[] = [];
    const missing: Record<string, string> = {};
    for (const f of found?.items ?? []) {
      if (f.answers !== 'partial' || gateDrop.includes(f.id)) continue;
      let m = missingPart(f.missing ?? what, what) ?? what;
      if (statedIn(m, valueOf(f.id))) {
        if (statedIn(what, valueOf(f.id))) continue;   // the line answers the ask: full
        m = what;
      }
      partial.push(f.id);
      missing[f.id] = m;
    }
    const guard = found === null ? null : plan.state.factBase.answerGate ? gateGuard(what, gate, ids, missing) : qualifierGuard(plan, what, ids, missing);
    let verdict: CheckVerdict = { mapped, ids, outOfScope, partial, missing, ...(guard ? { guard } : {}) };
    // Phase 1 4.3: the check's full items through the item-tag gate (haikuTagGate, below).
    const tagGate = found !== null && switchOn(plan.state.caseData, 'haikuTagGate') ? haikuTagGate(plan, what, verdict) : null;
    if (tagGate) {
      verdict = tagGate.verdict;
      plan.ctx.checks.act('haiku_tag_gate', 'the check\'s full items whose item tags disagree with the ask: never released, never refused — taken off, or the ask deferred by its words', { what, gated: tagGate.gated, deferred: verdict.tagDeferred !== undefined });
    }
    const decision = decideCheckedAsk(plan, what, verdict);
    // `found` keeps its old shape, so a replay reads old and new records alike (lib/eval/recorded-checks.ts).
    plan.ctx.checks.record('itemless_defer', mapped !== false, DECIDED[decision.kind],
      { what, mapped, found: found === null ? null : [{ what, ids }], decision: decision.kind, ...(tagDropped.length > 0 ? { tagDropped } : {}), ...(cut.length > 0 ? { basisCut: cut } : {}), ...(outOfScope.length > 0 ? { outOfScope } : {}), ...(outOfScopeRules ? { outOfScopeRules } : {}),
        ...(partial.length > 0 ? { partial, missing } : {}), ...(guard ? { guard } : {}), ...(tagGate ? { tagGate: tagGate.gated } : {}), latencyMs: Date.now() - t0, ...(timedOut ? { timedOut } : {}), ...(usage ? usageDetail(usage) : {}) });
    if (gate) plan.ctx.checks.act('answer_gate', 'an ask whose mapped items don\'t answer a part of it: those items not given, the part refused unchecked (a period or scope unmet: E1\'s form)', { asks: [{ what, path: 'check', refuse: guard?.parts ?? [], drop: gate.drop, partial: gate.partial }] });
    // A partial part no refusal says (final review I5, for Lorenzo's ruling; M6): the
    // ask, the item, Haiku's own `missing` and the part as checked, so a wave counts them.
    for (const x of decision.kind === 'items' || decision.kind === 'coarse' || decision.kind === 'refuse' ? decision.dropped ?? [] : []) {
      const raw = found?.items.find(f => f.id === x.id)?.missing;
      plan.ctx.checks.act('partial_dropped', x.why === 'whole_ask' ? 'a partial whose missing part did not hold (beside a full item, or replaced by the qualifier guard\'s parts): no refusal for it'
        : 'a partial\'s missing part a ledger item or the prompt covers: not refused', { what, item: x.id, missing: raw ?? null, checked: x.missing, why: x.why, decision: decision.kind });
    }
    return verdict;
  })();
  cache.set(what, run);
  return run;
}

// The item-tag gate on the check's positives (Phase 1 4.3, `haikuTagGate`; Lorenzo, 22 Oct: "Haiku positives: must pass
// the tag gate (entity, period, quantityKind against the ask). A mismatch defers; it never releases and never refuses.";
// item-tags.ts askTags / itemTagsAgree). A positive is an item the check calls full that the ask's scope rules keep — the
// ones `items` would give (a partial or out-of-scope item is already a coarse item, E1). Read after round 6's answer gate,
// so its entity and forecast refusals on the check path stand. Those whose tags disagree are taken off the verdict when
// what's left decides the same way with no more refused; otherwise the verdict becomes no verdict — the named deferral in
// the ask's words, holding no item, tracked open until delivered or "We won't get to …" (the gated items its own: they
// don't answer it). An item with no tags (every case until Stream 2's overlays) agrees with every ask: nothing changes.
function haikuTagGate(plan: ModelPlan, what: string, v: CheckVerdict): { verdict: CheckVerdict; gated: { id: string; why: 'entity' | 'period' | 'kind' }[] } | null {
  const { factBase, caseData } = plan.state;
  const full = v.ids.filter(id => !v.outOfScope.includes(id) && !v.partial.includes(id) && !(v.guard?.ids ?? []).includes(id));
  if (full.length === 0) return null;
  const sentence = askSentenceFor(what, askingSentences(plan.ctx.candidateText, plan.ctx.currentPhase), properNames(caseData.sttKeyterms)) ?? '';
  const ask = askTags(what, sentence, factBase);
  const gated = full.flatMap(id => {
    const t = itemTagsAgree(ask, caseData.dataLedger.find(i => i.id === id)?.tags);
    return t.agree ? [] : [{ id, why: t.why ?? 'entity' as const }];
  });
  if (gated.length === 0) return null;
  const off = new Set(gated.map(g => g.id));
  const keep = (ids: string[]) => ids.filter(id => !off.has(id));
  const v2: CheckVerdict = { ...v, ids: keep(v.ids), outOfScope: keep(v.outOfScope), partial: keep(v.partial), ...(v.guard ? { guard: { ...v.guard, ids: keep(v.guard.ids) } } : {}) };
  const before = decideCheckedAsk(plan, what, v);
  const after = v2.ids.length > 0 ? decideCheckedAsk(plan, what, v2) : null;
  const saidBefore = new Set(before.kind === 'named' ? [] : before.missing ?? []);
  const same = after !== null && after.kind === before.kind && after.kind !== 'refuse' && after.kind !== 'named' && (after.missing ?? []).every(m => saidBefore.has(m));
  // Review F4 (a): the kept items still answer the ask, so nothing is said for the gated ones — they are recorded
  // silently (an ids-only open deferral), so a later turn that delivers one is logged as having answered this ask.
  return { verdict: same ? { ...v2, tagSilent: [...off] } : { ...v, mapped: null, tagDeferred: [...off] }, gated };
}

// turnData, with the item-less asks resolved (async: the check above). Every
// unmatched ask is checked; when a verdict maps one to items (`items`, `coarse`),
// the turn is decided again with the verdicts applied (turnData's `checked`), so
// the items go through every gate; the first pass's check log is dropped for the
// second's. An ask a later pass leaves unmatched is checked in turn (bounded).
// What's left unmatched: no verdict → the named deferral; else refused.
const CHECK_PASSES = 3;
// The items a refused or deferred part names, and whether an item's line states it (Phase 2 S3).
const refusalNamed = (plan: ModelPlan) => (part: string) => [...new Set([...refusedItemIds(`I don't have ${part}.`, plan.state.factBase), ...coverageOf(part, plan.state.factBase).items])];
const refusalStated = (plan: ModelPlan) => (part: string, id: string) => {
  const i = plan.state.ledger.items.find(x => x.id === id);
  return i ? statesAsked(part, { label: i.label, value: i.value }, plan.state.caseData.dataLedger) : false;
};
// `refusalCoverage` (measurement): every item given this turn is a candidate, and its line, label, names and cover phrases
// must cover the part's words — no item mapping of the refused words (batch 39: they map nothing).
const refusalCovered = (plan: ModelPlan) => (part: string, id: string) => {
  const { ledger, factBase: fb, caseData } = plan.state;
  const i = ledger.items.find(x => x.id === id);
  if (!i) return false;
  const words = [i.label, i.value, ...(fb.quantities.find(q => q.id === id)?.names ?? []), ...fb.covers.filter(c => c.id === id).flatMap(c => c.phrases)].join(' — ');
  return coversAskedWords(part, words, caseData.dataLedger);
};
// `modelSay` (Phase 2 S2): the model's own say, raw — its refusals are the decision's evidence; Stream and Settle pass
// the same words, so both speak the same data line.
export async function turnDataChecked(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>, onUsage?: OnUsage, opts: { modelSay?: string; log?: boolean; modelRequests?: DeclaredRequest[] } = {}): Promise<TurnData> {
  const decided = new Map<string, CheckedAsk>();
  const d = await turnDataDecided(plan, turn, decided, onUsage);
  const today = closeOpenDeferrals(plan, switchOn(plan.state.caseData, 'refusalNounCheck') ? nounDeferrals(plan, d, decided) : d);
  // Phase 2 S2 (`askRefusals`): the one decision's refusals and deferrals in place of today's (ask-decision.ts).
  let data = today;
  const refusalsOn = switchOn(plan.state.caseData, 'askRefusals');
  const keepOn = switchOn(plan.state.caseData, 'askModelKeep');
  const matchesOn = switchOn(plan.state.caseData, 'askMatches');
  if (refusalsOn || keepOn || matchesOn) {
    // The model's own declarations as it made them (R2 must see what release_checked withdrew), then the message's asks.
    const original = opts.modelRequests ?? [];
    const model = [...original, ...turn.requests.filter(r => !original.some(o => o.what === r.what))];
    const decision = await shadowAskDecision({ plan, model, detections: null, modelWords: [opts.modelSay ?? ''], old: today });
    if (refusalsOn) {
      const r = applyAskRefusals(data, decision.asks);
      data = r.data;
      if (opts.log && r.changes.length > 0) plan.ctx.checks.act('ask_refusals', 'the one decision\'s refusals and deferrals in place of today\'s (Phase 2 S2)', { changes: r.changes });
    }
    if (keepOn) {
      const { ledger } = plan.state;
      const k = applyModelKeep(data, decision.asks, id => canReveal(ledger, id), RELEASE_CAP, id => ledger.items.find(i => i.id === id)?.value ?? '');
      data = k.data;
      if (opts.log && k.changes.length > 0) plan.ctx.checks.act('ask_model_keep', 'a model-named item that matches the ask, kept (Phase 2 S3, R2)', { changes: k.changes });
    }
    if (matchesOn) {
      const { ledger } = plan.state;
      const m = applyMatches(data, decision.asks, { canGive: id => canReveal(ledger, id), cap: RELEASE_CAP, lineOf: id => ledger.items.find(i => i.id === id)?.value ?? '',
        spoken: id => { const i = ledger.items.find(x => x.id === id); return i ? i.spoken ?? spokenItemName(i.label) : id; } });
      data = m.data;
      if (opts.log && m.changes.length > 0) plan.ctx.checks.act('ask_matches', 'a sub-ask R3 or R4 matches: its release, cut or gate/order deferral in place of today\'s (Phase 2 S4)', { changes: m.changes });
    }
  }
  // Phase 2 S6 (`askPoint`; Lorenzo, 27 Oct, widened): before a restatement points at or repeats an item already out,
  // whether the item answers this ask — the recorded check verdict, else the ask check on this turn (his lifting of Q1
  // for this path only): full → R5 as today; partial → the item's own line (no exhibit summary) and a true refusal of
  // the missing part; none → a true refusal only (R6's guards: the false-refusal veto, nothing given states it, no
  // item not yet out that the check maps it to). No verdict (a timeout or a failure): as today.
  if (switchOn(plan.state.caseData, 'askPoint') && data.restates.length > 0) {
    const r = await pointByCheck(plan, data, onUsage);
    data = r.data;
    if (opts.log && r.changes.length > 0) plan.ctx.checks.act('ask_point', 'a restatement checked against the ask: full kept, partial its line + the missing part refused, none refused (Phase 2 S6)', { changes: r.changes });
  }
  // Phase 2 S3 (`refusalContradiction`): no refused part a line this turn gives states (turn-composer.ts).
  if (switchOn(plan.state.caseData, 'refusalContradiction')) {
    const r = dropContradictedRefusals(data, refusalNamed(plan), refusalStated(plan));
    data = r.data;
    if (opts.log && r.changes.length > 0) plan.ctx.checks.act('refusal_contradiction', 'a refused part a line given this turn states: not refused (Phase 2 S3)', { changes: r.changes });
  }
  if (switchOn(plan.state.caseData, 'refusalCoverage')) {
    const given = [...data.releases.map(r => r.id), ...data.restates.map(r => r.id), ...(data.exhibit?.covers ?? [])];
    const r = dropContradictedRefusals(data, () => given, refusalCovered(plan));
    data = r.data;
    if (opts.log && r.changes.length > 0) plan.ctx.checks.act('refusal_coverage', 'a refused part a line given this turn covers: not refused (measurement)', { changes: r.changes });
  }
  // Phase 2 C2 (`composeData`): the data slot (turn-composer.ts composeDataSlot).
  if (switchOn(plan.state.caseData, 'composeData')) {
    const { ledger, caseData, factBase } = plan.state;
    const exhibit = data.exhibit ? { ...data.exhibit, title: caseData.exhibits.find(e => e.id === data.exhibit!.id)?.title ?? '' } : null;
    const itemOf = (id: string) => { const i = ledger.items.find(x => x.id === id); return i ? { id, words: [i.label, i.spoken ?? '', i.value, ...(factBase.quantities.find(q => q.id === id)?.names ?? [])], spoken: i.spoken ?? spokenItemName(i.label) } : undefined; };
    // A dropped deferral's finer cut is refused only when that refusal is true (the M6 reading, against what is out or given now).
    const givenNow = new Set([...ledger.revealed, ...data.releases.map(r => r.id), ...data.restates.map(r => r.id), ...(data.exhibit?.covers ?? [])]);
    const refusable = (w: string) => findFalseRefusals(`I don't have ${w}.`, factBase, givenNow, { covers: true }).length === 0;
    const statedBy = refusalStated(plan);
    const stated = (w: string, ids: readonly string[]) => ids.some(id => statedBy(w, id));
    const c = composeDataSlot({ ...data, exhibit }, opts.modelSay ?? '', itemOf, properNames(caseData.sttKeyterms), refusable, stated);
    data = { ...c.data, exhibit: data.exhibit };
    const real = c.changes.filter(x => x.rule !== 'exhibit_last');
    if (opts.log && real.length > 0) plan.ctx.checks.act('compose_data', 'the data slot (Phase 2 C2): no line the say already spoke, no deferral of what this turn gives', { changes: real });
  }
  return data;
}
// Phase 2 S6: each restated item read against the check's verdict on the ask it was restated for (see turnDataChecked).
type PointChange = { item: string; what: string; verdict: 'full' | 'partial' | 'none' | 'no_verdict'; to: 'kept' | 'line' | 'refused' | 'kept_guard'; refused?: string };
async function pointByCheck(plan: ModelPlan, d: TurnData, onUsage?: OnUsage): Promise<{ data: TurnData; changes: PointChange[] }> {
  const { ledger, factBase: fb, caseData } = plan.state;
  const out: TurnData = { ...d, restates: [...d.restates], refusals: [...d.refusals], requests: d.requests.map(r => ({ ...r })) };
  const changes: PointChange[] = [];
  const givenNow = () => new Set([...ledger.revealed, ...out.releases.map(r => r.id), ...out.restates.map(r => r.id), ...(out.exhibit?.covers ?? [])]);
  const givenLines = () => [...out.releases.map(r => r.id), ...out.restates.map(r => r.id)].flatMap(id => ledger.items.filter(i => i.id === id));
  const refusable = (part: string) => findFalseRefusals(`I don't have ${part}.`, fb, givenNow(), { covers: true }).length === 0
    && !givenLines().some(i => statesAsked(part, { label: i.label, value: i.value }, caseData.dataLedger));
  const say = (w: string) => w.replace(/^(?:(?:so|and|but)\s+)?(?:(?:do|did|can|could|would)\s+(?:we|i|you)\s+(?:please\s+)?(?:have|get|see|know)\s+(?:any\s+)?|is there (?:any|a)\s+)/i, '').replace(/[?.!]+$/, '').trim();
  for (const r of d.restates) {
    const whats = [...new Set(d.requests.filter(x => x.request.explicit && x.ledgerItemIds.includes(r.id)).map(x => x.request.what))];
    const what = whats[0];
    if (!what) continue;
    const v = await checkAsk(plan, what, onUsage);
    if (v.mapped === null) { changes.push({ item: r.id, what, verdict: 'no_verdict', to: 'kept' }); continue; }
    const full = v.ids.includes(r.id) && !v.partial.includes(r.id) && !v.outOfScope.includes(r.id);
    if (full) { changes.push({ item: r.id, what, verdict: 'full', to: 'kept' }); continue; }
    if (v.ids.includes(r.id)) {
      // Partial: what the item holds (its own line, never an exhibit summary), and the missing part refused when true.
      out.restates = out.restates.map(x => (x.id === r.id ? { id: x.id, value: x.value, ...(x.exhibit ? { exhibit: x.exhibit } : {}) } : x));
      const part = say(v.missing[r.id] ?? what);
      const ok = part.length > 0 && !/\d/.test(part) && refusable(part) && !out.refusals.some(x => normAsk(x) === normAsk(part));
      if (ok) out.refusals.push(part);
      changes.push({ item: r.id, what, verdict: 'partial', to: 'line', ...(ok ? { refused: part } : {}) });
      continue;
    }
    // None: a true refusal only — never while the check maps the ask to an item not yet out (R6 b), nor when the veto
    // or a line given this turn says the case holds it (R6 c, d). A guard failing leaves the turn as today.
    const pending = v.ids.filter(id => !givenNow().has(id));
    const part = say(what);
    if (pending.length > 0 || part.length === 0 || /\d/.test(part) || !refusable(part)) { changes.push({ item: r.id, what, verdict: 'none', to: 'kept_guard' }); continue; }
    out.restates = out.restates.filter(x => x.id !== r.id);
    if (!out.refusals.some(x => normAsk(x) === normAsk(part))) out.refusals.push(part);
    out.requests = out.requests.flatMap(x => (x.ledgerItemIds.includes(r.id) && x.request.what === what ? [{ ...x, ledgerItemIds: x.ledgerItemIds.filter(id => id !== r.id) }, { request: { ...x.request, itemIds: [] }, response: 'refuse' as const, ledgerItemIds: [] }] : [x]));
    changes.push({ item: r.id, what, verdict: 'none', to: 'refused', refused: part });
  }
  return { data: out, changes };
}
async function turnDataDecided(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>, decided: Map<string, CheckedAsk>, onUsage?: OnUsage): Promise<TurnData> {
  // Review F4 (a): per ask, the item-tag mismatches the gate dropped while the rest of the verdict still answered it.
  const silent = new Map<string, string[]>();
  const log = plan.ctx.checks.entries;
  let at = log.length;
  let d = turnData(plan, turn);
  if (d.unmatchedDefers.length === 0) return d;   // no check ran: nothing was gated
  let logged = log.length - at;
  for (let pass = 0; pass < CHECK_PASSES; pass++) {
    // A cover-vetoed ask is never checked (fix round 1: no model call BASE didn't make); nor a tag deferral (Task 76).
    const vetoedNow = new Set([...(d.coverDeferred ?? []), ...(d.tagDeferred ?? [])]);
    const fresh = d.unmatchedDefers.filter(w => !decided.has(w) && !vetoedNow.has(w));
    if (fresh.length === 0) break;
    const verdicts = await Promise.all(fresh.map(w => checkAsk(plan, w, onUsage, d.basisCut?.[w])));
    fresh.forEach((w, i) => { decided.set(w, decideCheckedAsk(plan, w, verdicts[i])); if (verdicts[i].tagSilent?.length) silent.set(w, verdicts[i].tagSilent!); });
    // A refusal by the answer gate's parts (Task 70) is decided again too, so its parts are said.
    if (!fresh.some(w => { const c = decided.get(w)!; return c.kind === 'items' || c.kind === 'coarse' || (c.kind === 'refuse' && c.missing !== undefined); })) break;
    log.splice(at, logged);   // the pass decided again below logs its own checks
    at = log.length;
    d = turnData(plan, turn, decided);
    logged = log.length - at;
  }
  const withSilent = (x: TurnData): TurnData => (silent.size === 0 || !tracksDeferrals(plan) ? x
    : { ...x, deferralsOpened: [...(x.deferralsOpened ?? []), ...[...silent].map(([what, ids]) => ({ what, ids, silent: true as const }))] });
  if (d.unmatchedDefers.length === 0) return withSilent(d);
  const defers: string[] = [], refusals: string[] = [];
  // Unmatched still: no verdict (or none reached) → the named deferral; a verdict → refused.
  // A cover-vetoed ask (round 6 Task 68, the tag gate in turnData) is the named deferral,
  // unchecked, holding no item — logged `cover_deferred`.
  const vetoed = new Set(d.coverDeferred ?? []);
  const tagVetoed = new Set(d.tagDeferred ?? []);
  for (const w of d.unmatchedDefers) ((decided.get(w)?.kind ?? 'named') === 'named' ? defers : refusals).push(w);   // a vetoed ask is never decided: named
  const coverDeferred = d.unmatchedDefers.filter(w => vetoed.has(w));
  if (coverDeferred.length > 0) plan.ctx.checks.act('cover_deferred', 'a cover match vetoed the refusal: the named deferral in the ask\'s words, holding no item, no check', { asks: coverDeferred });
  // Task 76 (b): an entity or forecast/current mismatch off the check — deferred, never refused, no check.
  const tagDeferred = d.unmatchedDefers.filter(w => tagVetoed.has(w) && !vetoed.has(w));
  if (tagDeferred.length > 0) plan.ctx.checks.act('tag_deferred', 'an entity or forecast/current mismatch off the check: the part deferred in its words, holding no item, no check', { asks: tagDeferred });
  const refused = new Set(refusals);
  const wrapUp = wrapUpTurn(plan) && defers.length > 0;
  // Task 76 (a): the deferrals to track (tagged cases only; said "I'll come back to …" — on a wrap-up turn they are "We won't get to …" already).
  const opened = plan.state.factBase.answerGate && !wrapUp ? defers.filter(w => vetoed.has(w) || tagVetoed.has(w)).map(w => ({ what: w, ids: d.deferredItems?.[w] ?? [] })) : [];
  // Phase 1 4.3: an ask the item-tag gate deferred (no verdict, holding no item) is tracked too, on any case.
  const tagGated = (w: string) => { const c = decided.get(w); return c?.kind === 'named' ? c.tagDeferred : undefined; };
  if (!wrapUp && tracksDeferrals(plan)) for (const w of defers) { const ids = tagGated(w); if (ids && !opened.some(o => o.what === w)) opened.push({ what: w, ids }); }
  // Said "We won't get to …" at a wrap-up: logged as such, like decideData's (round-3 ruling 4).
  const wont = new Set(wrapUp ? defers : []);
  return withSilent({
    ...d,
    unmatchedDefers: [],
    defers: wrapUp ? d.defers : [...d.defers, ...defers],
    ...(!wrapUp && defers.length > 0 ? { itemlessDefers: defers } : {}),
    ...(wrapUp ? { wontGetTo: [...(d.wontGetTo ?? []), ...defers] } : {}),
    ...(opened.length > 0 ? { deferralsOpened: opened } : {}),
    refusals: [...d.refusals, ...refusals],
    requests: d.requests.map(r => (r.response !== 'defer' || r.ledgerItemIds.length > 0 ? r
      : refused.has(r.request.what) ? { ...r, response: 'refuse' as const }
        : wont.has(r.request.what) ? { ...r, wontGetTo: true as const } : r)),
  });
}

// ---- Refusals only of what the case doesn't hold (Phase 1 4.4, `refusalNounCheck`) ----
// Lorenzo, 22 Oct: "Refusals: when both code and Haiku find no match, refuse only if no ledger item shares a key noun
// with the ask; otherwise defer. Haiku's "none" adds nothing on its own." b38 Larkspur Tyler cee7d399 t2 ("I don't have
// split of revenue decline between passengers and average fare." — the same flights and planes as full make it all fare)
// and Jasmine 3f928012 t4 ("I don't have the ticket versus extras revenue split." — extras_revenue holds one side). A
// refusal the check made — its "none" (`refuse` with no answer-gate part) or a verdict with no item answering the ask
// (`coarse`: its parts, or the whole ask) — goes out only when no ledger item not yet out (not revealed, so not on a
// shown exhibit either, and not given this turn) shares a key noun (data-decisions.ts keyNouns) with the refused words;
// an item's words are its label, spoken name, and the case's names and covers for it. Otherwise it is the named
// deferral in those words, holding no item, tracked open (flags.openDeferrals) with what it needs: each of its key
// nouns and the items not yet out that share it (`need`). It resolves as delivered once every one of its nouns has had
// one of its items delivered since; a noun no item shares can't be met — such a deferral closes at the first wrap-up
// ("We won't get to … today."), never left hollow (b38 Tyler t14's "business versus leisure fare mix": no item has
// "business" or "leisure"). On a wrap-up turn it is "We won't get to … today." at once. Logged `refusal_noun`, refused or deferred, with the nouns shared. Untouched:
// a check mapping the answer gate dropped whole (`refuse` with parts: Haiku matched, code's tags or topic test vetoed
// the items — audit rows 2, 18, 19), and the refusals no check made — the scope rules' finer cuts, the answer gate's
// parts off the check, the geography refusals (code's own matches at a coarser cut, not "no match").
const QUALIFIED = '(a period or scope)';
const FINER_PERIOD = /(?:quarter|week|month|day|year)[-\s]by[-\s](?:quarter|week|month|day|year)|\bby (?:quarter|month|week|day)\b|\b(?:quarterly|monthly|weekly)\b/i;
// What a turn gives (released, restated, on the exhibit handed over).
const givenOf = (d: Pick<DataDecisions, 'releases' | 'restates' | 'exhibit'>) => new Set([...d.releases.map(r => r.id), ...d.restates.map(r => r.id), ...(d.exhibit?.covers ?? [])]);
// The ask's head noun (review F2): the last key noun of its head noun phrase — the words before the first preposition,
// conjunction or clause break that starts a modifier ("waste or spoilage data by store" → "waste"; "later cohorts'
// upgrade rates" → "upgrade", "rates" being a generic label word). A head phrase with no key noun of its own falls back
// to the text's first key noun ("split of revenue decline …" → "decline").
const HEAD_BREAK = /\s+(?:of|by|per|for|in|on|at|with|within|between|across|versus|vs\.?|than|from|to|since|beyond|under|over|about|and|or|plus|that|which|whether|if)\s+|[,;:?!—–(]/i;
export function headNoun(text: string, caseNames: string[] = []): string | null {
  const lead = text.trim().split(HEAD_BREAK)[0] ?? '';
  const own = [...keyNouns(lead, caseNames)];
  if (own.length > 0) return own[own.length - 1];
  const all = [...keyNouns(text, caseNames)];
  return all[0] ?? null;
}
// The key nouns of a text against the ledger items not yet out (not revealed, not given this turn): the items sharing
// each (`shared`, for the log), whether the text is one a deferral may be made of (`shares`), and what that deferral
// needs to be delivered (`need`). Review F2 (Lorenzo's "no ledger item shares a key noun", read strictly): a deferral
// is made only when the ask's **head noun** is one of the shared nouns **and a single item carries every shared noun** —
// a set shared across different items (passengers from one line, the fare from another) is no answer to the ask. Those
// items are its `need` carriers, per noun; a period or scope in the words can't be met by delivering them (b34 Larkspur
// Raj 061ef630 t14 "FY2024 fares": the FY2023 and FY2025 fares don't state FY2024), so it closes at the wrap-up unless
// its own words are answered. Shared by 4.4 (refusalNounCheck) and 4.7 (modelDeferrals).
export type NounReading = { shares: boolean; shared: Record<string, string[]>; need: Record<string, string[]>; head: string | null; carriers: string[] };
function nounReader(plan: ModelPlan, given: ReadonlySet<string>): (text: string) => NounReading {
  const { ledger, caseData, factBase } = plan.state;
  const caseNames = properNames(caseData.sttKeyterms);
  const pending = ledger.items.filter(i => !ledger.revealed.has(i.id) && !given.has(i.id)).map(i => ({
    id: i.id,
    nouns: keyNouns([i.label, i.spoken ?? '', ...(factBase.quantities.find(q => q.id === i.id)?.names ?? []), ...(factBase.covers.find(c => c.id === i.id)?.phrases ?? [])].join('\n'), caseNames),
  }));
  return text => {
    const nouns = [...keyNouns(text, caseNames)];
    const shared = Object.fromEntries(pending.map(i => [i.id, nouns.filter(n => i.nouns.has(n))] as const).filter(([, ns]) => ns.length > 0));
    const head = headNoun(text, caseNames);
    const sharedNouns = nouns.filter(n => pending.some(i => i.nouns.has(n)));
    const carriers = head !== null && sharedNouns.includes(head) ? pending.filter(i => sharedNouns.every(n => i.nouns.has(n))).map(i => i.id) : [];
    // A period or scope the carriers can't state, including a finer period cut the qualifier grammar doesn't read
    // ("quarter-by-quarter fares and passengers since entry", b36 Larkspur Marcus a7d9f44e t11: delivering an item that
    // carries "fare" and "passenger" is no answer to it, so it closes at the wrap-up instead of resolving silently).
    const qualified = askQualifiers(text, true).some(q => q.kind === 'period' || q.kind === 'scope') || FINER_PERIOD.test(text);
    const need = carriers.length > 0
      ? { ...Object.fromEntries(sharedNouns.map(n => [n, carriers])), ...(qualified ? { [QUALIFIED]: [] } : {}) }
      : {};
    return { shares: carriers.length > 0, shared, need, head, carriers };
  };
}

function nounDeferrals(plan: ModelPlan, d: TurnData, decided: ReadonlyMap<string, CheckedAsk>): TurnData {
  const eligible = new Map<string, string>();   // refused words → the ask they came from
  for (const [w, c] of decided) {
    if (c.kind === 'refuse' && c.missing === undefined) eligible.set(normAsk(w), w);
    else if (c.kind === 'coarse') for (const m of c.missing ?? [w]) eligible.set(normAsk(m), w);
  }
  const refused = d.refusals.filter(t => eligible.has(normAsk(t)));
  if (refused.length === 0) return d;
  const nouns = nounReader(plan, givenOf(d));
  const log: { what: string; ask: string; deferred: boolean; shared: Record<string, string[]>; head: string | null; carriers: string[] }[] = [];
  const moved: { what: string; ask: string; need: Record<string, string[]> }[] = [];
  for (const t of refused) {
    const r = nouns(t);
    log.push({ what: t, ask: eligible.get(normAsk(t))!, deferred: r.shares, shared: r.shared, head: r.head, carriers: r.carriers });
    if (r.shares) moved.push({ what: t, ask: eligible.get(normAsk(t))!, need: r.need });
  }
  plan.ctx.checks.act('refusal_noun', 'a refusal the check made: deferred only when one ledger item not yet out carries the ask\'s head noun and every noun it shares; else said', { asks: log });
  if (moved.length === 0) return d;
  const out = new Set(moved.map(m => normAsk(m.what)));
  const wrap = wrapUpTurn(plan);
  // An ask's row turns from refuse to defer when every refusal it made was moved.
  const asks = new Set(moved.map(m => m.ask).filter(w => d.refusals.filter(t => eligible.get(normAsk(t)) === w).every(t => out.has(normAsk(t)))));
  const whats = moved.map(m => m.what);
  return {
    ...d,
    refusals: d.refusals.filter(t => !out.has(normAsk(t))),
    ...(wrap ? { wontGetTo: [...(d.wontGetTo ?? []), ...whats] }
      : { defers: [...d.defers, ...whats], itemlessDefers: [...(d.itemlessDefers ?? []), ...whats], deferralsOpened: [...(d.deferralsOpened ?? []), ...moved.map(m => ({ what: m.what, ids: [] as string[], need: m.need }))] }),
    requests: d.requests.map(r => (r.response === 'refuse' && r.ledgerItemIds.length === 0 && asks.has(r.request.what)
      ? { ...r, response: 'defer' as const, ...(wrap ? { wontGetTo: true as const } : {}) } : r)),
  };
}

// ---- The model's own deferrals (Phase 1 4.7, `modelDeferrals`) ----
// Lorenzo, 22 Oct: "Model-said deferrals ("I'll check what we have", "let me come back to that"): register them, so the
// E5 stop sequence resolves them." (b38 Larkspur Tyler cee7d399 t24: "On the price elasticity of those four routes, I'll
// check what we have." — then the Exhibit 1 line restated, and nothing ever came back on elasticity: hollow.) A sentence
// of the model's own words this turn (its say and question as composed, after the vetoes) that promises to check or
// come back is a deferral of the ask it names: the turn's explicit ask sharing the most naming words with it, else its
// own lead ("On <X>, I'll check …"), else the turn's one explicit ask. It is registered open (flags.openDeferrals,
// Settle) unless this turn already answers that ask — a new item released for it, a prompt fact said for it, its refusal,
// or code's own deferral of it (tracked by its booking). A restatement is no answer to "I'll check": it says what the
// candidate has. It resolves as code's deferrals do: delivered by its own words (or, when its words carry key nouns, by
// every noun's items delivered since — 4.4's reading), or "We won't get to <ask> today." at the first wrap-up. Never on a
// wrap-up turn (nothing comes back after it).
const MODEL_DEFERRAL = /\b(?:I'll|I will|let me|let's|we'll|we will)\s+(?:(?:check|see|look into|look up|find out|dig into)\s+(?:on\s+)?(?:what we have|whether we have|if we have|what I have|that|this|it)\b|(?:come back to|get back to|circle back to|return to)\s+(?:that|this|it|you|those|these)\b)/i;
const DEFERRAL_LEAD = /^(?:on|as for|regarding|about|for|with)\s+(.{3,90}?),\s*(?:I'll|I will|let me|let's|we'll|we will)\b/i;
// `opts.wrapUp` (review F7): on a wrap-up or close turn a promise can never be followed, so Settle reads them there too
// and says "We won't get to <ask> today." in the same breath instead of leaving it hollow (b38 Larkspur Marcus
// 316baba1 t24, "I'll check what we have" on the turn before the recommendation ask). Nothing is tracked then.
export function modelDeferrals(plan: ModelPlan, d: TurnData, requests: DeclaredRequest[], modelWords: string[], opts: { wrapUp?: boolean } = {}): { what: string; ids: string[]; need?: Record<string, string[]> }[] {
  if (!switchOn(plan.state.caseData, 'modelDeferrals') || wrapUpTurn(plan) !== (opts.wrapUp === true)) return [];
  const { caseData } = plan.state;
  const caseNames = properNames(caseData.sttKeyterms);
  // New this turn: released or on the exhibit handed over (read from the decisions — Settle books them before this runs).
  const fresh = new Set([...d.releases.map(r => r.id), ...(d.exhibit?.covers ?? [])]);
  const sentences = modelWords.flatMap(t => sentencesOf(t)).filter(x => MODEL_DEFERRAL.test(x));
  if (sentences.length === 0) return [];
  const whats = [...new Set(requests.filter(r => r.explicit).map(r => r.what))];
  const asked = (x: string) => [x, d.askOrigin?.[x]].filter((y): y is string => !!y).map(normAsk);
  const answered = (w: string) => d.requests.some(x => asked(x.request.what).includes(normAsk(w)) && (x.response === 'refuse' || x.response === 'clarify' || x.response === 'defer'
    || (x.response === 'release' && x.ledgerItemIds.some(id => fresh.has(id)))))
    || [...d.refusals, ...d.defers, ...d.gateDefers, ...(d.wontGetTo ?? [])].some(x => normAsk(x) === normAsk(w));
  const nouns = nounReader(plan, givenOf(d));
  const out: { what: string; ids: string[]; need?: Record<string, string[]> }[] = [];
  for (const x of sentences) {
    // The lead is the model's words: one carrying a figure no candidate turn said is never said back (the guard's rule).
    const lead = DEFERRAL_LEAD.exec(x.trim())?.[1]?.trim();
    const what = askSentenceFor(x, whats, caseNames) ?? (lead && !unsaidFigures(plan, [lead]) ? lead : undefined) ?? (whats.length === 1 ? whats[0] : undefined);
    if (!what || answered(what) || out.some(o => normAsk(o.what) === normAsk(what))) continue;
    const need = nouns(what).need;
    out.push({ what, ids: [], ...(Object.keys(need).length > 0 ? { need } : {}) });
  }
  return out;
}

// ---- Deferrals that resolve (round 6 Task 76 (a)) ----
// Lorenzo, 21 Oct, round 6 rulings, 4: "Vetoed cover → deferral without a Haiku check: fine. The deferral must resolve
// through the E5 stop sequence (delivered, or "We won't get to that"), never left hollow." Code's item-less named
// deferrals on a tagged case — cover-vetoed or excluded-only (Task 68, `cover_deferred`) and tag mismatches off the
// check (Task 76 (b), `tag_deferred`) — hold no ledger item, so nothing followed them up. Each one said is tracked as
// open in the session's flags (flags.openDeferrals: its ask words, the items it came from, the interviewer turn that
// said it — no DB column) until:
//   (i) delivered — a later turn's booked delivery (released, restated or shown) of an item NOT in its own set, for
//       the same ask words: resolved, nothing more said. Its own items are the ones whose tags or cover were vetoed —
//       they don't answer it (fix round 1, the review: the entrant's flights a day isn't "delivered" by Larkspur's
//       network totals, Raj's current advanced-therapy usage by the peak-share forecast); its `ids` are kept for the log;
//   (ii) the first wrap-up turn (wrapUpTurn / WRAP_UP_KINDS) with it still open — code says "We won't get to <ask>
//       today." for each, named (fix round 1, controller ruling: never the bare "We won't get to that today.", which
//       in b34a Marcus t20 read as declining his t19 point; the "that" form stays for decideData's same-turn list or
//       long ask); not for one that turn delivers, nor one it already says in another form (its words refused,
//       deferred or "won't get to" there).
// A later refusal of the same words closes it too (the candidate has the answer; "won't get to" would contradict it).
// Each resolves once: Settle (resolveDeferrals) drops it from the flags and logs `deferral_resolved` { what, how, turn },
// so it is never said twice. Untagged (prof-001): nothing is tracked.
// `silent` (Phase 1 4.3, review F4 (a)): an item-tag mismatch the gate dropped while the rest of the verdict still
// answered the ask — recorded by its ids only, never said and never closed out loud; it resolves if a later turn
// delivers one of them.
// `need` (Phase 1 4.4, refusalNounCheck): a refusal turned into a deferral — per key noun of its words, the items that
// carry the whole ask (nounReader's carriers). It is delivered when one of those items is delivered on a later turn, for
// any ask (needCarriers, review F3); a noun with no item leaves no carrier, so it closes at the wrap-up instead.
export type OpenDeferral = { what: string; ids: string[]; turn: number; need?: Record<string, string[]>; silent?: true };
export type DeferralResolved = { what: string; how: 'delivered' | 'wont_get_to' | 'refused'; turn: number };
const normAsk = (w: string) => w.replace(/\s+/g, ' ').trim().toLowerCase();
export function openDeferrals(plan: ModelPlan): OpenDeferral[] {
  return tracksDeferrals(plan) ? (plan.ctx.flags.openDeferrals as OpenDeferral[] | undefined) ?? [] : [];
}
// Whether the session tracks open deferrals: a tagged case (round 6), or a Phase 1 switch that opens them on any case
// (4.3 haikuTagGate, 4.4 refusalNounCheck, 4.7 modelDeferrals). Off: a tagged case only, as before.
export function tracksDeferrals(plan: ModelPlan): boolean {
  const c = plan.state.caseData;
  return plan.state.factBase.answerGate || switchOn(c, 'refusalNounCheck') || switchOn(c, 'haikuTagGate') || switchOn(c, 'modelDeferrals');
}
type DeferralReading = Pick<DataDecisions, 'releases' | 'restates' | 'exhibit' | 'requests' | 'refusals' | 'defers' | 'gateDefers' | 'wontGetTo'>;
// Delivered: a row for its own words whose delivered items (`out`: booked in Settle — fix round 1, the review's minor —
// decided in Stream) include one outside its vetoed set; a prompt fact restated for them (`clarify`) answers them too.
function deferralDelivered(o: OpenDeferral, d: Pick<DataDecisions, 'requests'>, out: ReadonlySet<string>): boolean {
  return d.requests.some(x => normAsk(x.request.what) === normAsk(o.what)
    && ((x.response === 'release' && x.ledgerItemIds.some(id => out.has(id) && !o.ids.includes(id))) || x.response === 'clarify'));
}
// A noun deferral (4.4) whose every noun still needed is met by what this turn delivers.
// A noun deferral's carriers (review F3): the items in every needed noun's list — one item that carries the whole ask.
// A noun no item shares (an empty list, like a period or scope in the words) leaves none, so it can never be delivered:
// it closes at the wrap-up instead. Resolving on any one needed noun would manufacture the hollow deferral E5 forbids.
export function needCarriers(need: Record<string, string[]> | undefined): string[] | null {
  if (need === undefined) return null;
  const lists = Object.values(need);
  if (lists.length === 0) return [];
  return lists.reduce<string[]>((acc, ids) => acc.filter(x => ids.includes(x)), [...new Set(lists[0])]);
}
const needMet = (o: OpenDeferral, out: ReadonlySet<string>) => (needCarriers(o.need) ?? []).some(id => out.has(id));
const decidedOut = (d: DeferralReading) => new Set([...d.releases.map(r => r.id), ...d.restates.map(r => r.id), ...(d.exhibit?.covers ?? [])]);
// Said "won't get to" this turn in another form: for its own words.
const deferralWontNow = (o: OpenDeferral, d: DeferralReading) => (d.wontGetTo ?? []).some(w => normAsk(w) === normAsk(o.what));
const deferralRefusedNow = (o: OpenDeferral, d: DeferralReading) => d.refusals.some(w => normAsk(w) === normAsk(o.what));
// Its words deferred again this turn (a promise said now: not closed beside it).
const deferralDeferredNow = (o: OpenDeferral, d: DeferralReading) => [...d.defers, ...d.gateDefers].some(w => normAsk(w) === normAsk(o.what));
// (ii): the first wrap-up turn says "We won't get to <ask> today." for each open one left, by name (`wontGetToNamed`;
// Stream and Settle alike: turnDataChecked).
function closeOpenDeferrals(plan: ModelPlan, d: TurnData): TurnData {
  if (!wrapUpTurn(plan)) return d;
  const out = decidedOut(d);
  const closing = openDeferrals(plan).filter(o => o.silent !== true && !needMet(o, out) && !deferralDelivered(o, d, out) && !deferralWontNow(o, d) && !deferralRefusedNow(o, d) && !deferralDeferredNow(o, d));
  if (closing.length === 0) return d;
  // Phase 2 S3 (`wontGetToGiven`): only the parts nothing revealed since states (turn-composer.ts wontGetToRemainder).
  // A part names an item through the case's names and covers, or by sharing two key nouns with its label or names
  // ("cost per bag" → variable_costs, "Variable costs per bag").
  const caseNames = properNames(plan.state.caseData.sttKeyterms);
  const labelled = (part: string) => { const own = keyNouns(part, caseNames); return plan.state.ledger.items.filter(i => [...keyNouns([i.label, ...(plan.state.factBase.quantities.find(q => q.id === i.id)?.names ?? [])].join('\n'), caseNames)].filter(n => own.has(n)).length >= 2).map(i => i.id); };
  const named = (part: string) => [...new Set([...refusalNamed(plan)(part), ...labelled(part)])];
  const said = switchOn(plan.state.caseData, 'wontGetToGiven')
    ? closing.map(o => wontGetToRemainder(o.what, named, refusalStated(plan), new Set([...plan.state.ledger.revealed, ...out]))).filter((w): w is string => w !== null)
    : closing.map(o => o.what);
  return { ...d, wontGetToNamed: [...(d.wontGetToNamed ?? []), ...said], deferralsClosed: closing };
}
// Settle's bookkeeping for one turn (`turn`: the interviewer turn's index): each open deferral from an earlier turn
// resolved by this turn's decisions — said "won't get to" here (deferralsClosed, or another form), delivered, or its
// words refused — leaves the open list, once; the deferrals this turn says join it (one per ask words, items merged).
// `booked`: what the turn delivered (Settle: newReveals, restated ids, the exhibit's reveals).
export function resolveDeferrals(open: readonly OpenDeferral[], d: TurnData, turn: number, booked: Iterable<string>): { open: OpenDeferral[]; resolved: DeferralResolved[] } {
  const out = new Set(booked);
  const closed = new Set((d.deferralsClosed ?? []).map(o => normAsk(o.what)));
  const resolved: DeferralResolved[] = [];
  const left: OpenDeferral[] = [];
  for (const o of open) {
    const how = o.turn >= turn ? null
      : o.silent === true ? (o.ids.some(id => out.has(id)) ? 'delivered' as const : null)
        : closed.has(normAsk(o.what)) ? 'wont_get_to' as const
          : needMet(o, out) || deferralDelivered(o, d, out) ? 'delivered' as const
          : deferralWontNow(o, d) ? 'wont_get_to' as const
            : deferralRefusedNow(o, d) ? 'refused' as const : null;
    if (how) resolved.push({ what: o.what, how, turn });
    else left.push(o);
  }
  for (const x of d.deferralsOpened ?? []) {
    const i = left.findIndex(o => normAsk(o.what) === normAsk(x.what));
    if (i < 0) left.push({ what: x.what, ids: x.ids, turn, ...(x.need ? { need: x.need } : {}), ...(x.silent ? { silent: x.silent } : {}) });
    else left[i] = { ...left[i], ids: [...new Set([...left[i].ids, ...x.ids])] };
  }
  return { open: left, resolved };
}

// ---- The message's asks the model left out (round 5 Tasks 48 and 50) ----
// Task 48 (A1; B1 Larkspur Marisol e6432db0 t11 → t12 and t25 → t26): handed the
// math checker's flag, the model wrote only the probe and declared no request,
// guard B's cues missed both asks, and neither got a word.
// Task 50 (A4; B2 Hollis Bay Jasmine 984d9066 t5 → t6): "One thing I'd want: how
// many bags of chips does Hollis Bay sell a year?" — guard B wrote the turn again
// and the model declared an offer of the planning assumptions instead
// (explicit:false), so the ask was never answered. Generalized from Task 48: on
// every model turn, after the model's requests close, when an addressed asking
// sentence has a clause no explicit declaration names (request-signal.ts
// undeclaredSentences — this only decides the wait), the classifier's detections on
// the message are read: those an asking sentence covers and no explicit
// declaration covers (by item, or named by one declaration's words —
// uncoveredAsks; fix round 1: decided per detection, as Task 48 did). They join the turn's requests as asks to release, so turnDataChecked
// decides them — released, deferred, restated, or through the item-less check
// (Task 45: refuse, restate, release now or name). The model's own declarations
// (an offer included) still go out. On a probe turn the data line is said between
// "say" and the probe. One classifier call per turn, only when a sentence asks:
// started beside the model call (session-runner.ts), shared by Stream and Settle
// (on the plan), and waited on only when a clause is undeclared — at most
// ASK_WAIT_MS, then the turn goes on without it (no hang on a slow call).
// From the brainstorm on, the sentences are guard B's late ones (rhetorical
// self-questions filtered; Lorenzo, 19 Oct).
const ASK_WAIT_MS = 1500;
// latencyMs: the classifier call's own time; waitMs: how long the turn waited on it.
// cue: 'want_is' when only row 11's cue made the message ask (wantIsOnly, below; Task 76 (c)).
export type MessageAsks = { sentences: string[]; detected: DetectedDataRequest[] | null; latencyMs?: number; waitMs?: number; cue?: 'want_is' };
export function probeTurn(plan: ModelPlan): boolean {
  const { checkerLine, kind } = plan.state;
  return kind === 'model' && checkerLine !== null && !correctsNow(checkerLine);
}
export function messageAskSentences(plan: ModelPlan): string[] {
  const { ctx, state } = plan;
  return WANT_ASK_PHASES.includes(ctx.currentPhase) ? addressedAskSentences(ctx.candidateText, ctx.currentPhase, { wantIs: state.factBase.answerGate, wantBroad: switchOn(state.caseData, 'wantCueBroad') })
    : lateAskSentences(ctx.candidateText, ctx.currentPhase, [state.caseData.prompt, ...Object.values(revealedValues(state.ledger))]);
}
// Row 11's classifier call (round 6 Task 76 (c); Lorenzo, 21 Oct, round 6 rulings, 2: "Row 11's classifier call:
// allowed, as long as all three hold: it fires only on that cue; it fires on no more than ~2% of turns in the replay
// corpus; it adds no more than 1.5 s on the turns where it fires. Report its cost and latency in the check-cost log."):
// a message that asks only through Task 71's "(what) I'd want is" cue (request-signal.ts WANT_IS; tagged cases, before
// the brainstorm) — no addressed asking sentence without it. Its usage row carries `cue: 'want_is'` and the call's
// latency; the turn's wait stays capped at ASK_WAIT_MS (heardAsks), logged on `uncovered_asks` (Settle).
// With 4.6's `wantCueBroad` on, its broad want cue counts the same way: a message that asks only through it (or
// row 11's) is tagged `cue: 'want_is'`, on any case — the share Lorenzo capped (~2%) is the want cue's as a whole.
// The denominator (Stream 4b's review, item 3): this function is only reached from startMessageAsks, which returns
// null unless the turn is the model's, so 1.72% of candidate turns understates it. Over batches 28–38 the broad cue
// adds 25 calls: 2.27% of the 1,100 model turns, 3.16% of the 791 want-phase model turns (request-signal.ts).
function wantIsOnly(plan: ModelPlan): boolean {
  const { ctx, state } = plan;
  const broad = switchOn(state.caseData, 'wantCueBroad');
  return (state.factBase.answerGate || broad) && WANT_ASK_PHASES.includes(ctx.currentPhase)
    && addressedAskSentences(ctx.candidateText, ctx.currentPhase).length === 0
    && addressedAskSentences(ctx.candidateText, ctx.currentPhase, { wantIs: true, wantBroad: broad }).length > 0;
}
// The classifier on the message: one call per turn, shared through the plan.
function classifyMessage(plan: ModelPlan, sentences: string[], onUsage?: OnUsage): Promise<MessageAsks> {
  const { state, ctx } = plan;
  if (state.messageAsks) return state.messageAsks;
  const t0 = Date.now();
  const cue = wantIsOnly(plan) ? 'want_is' as const : undefined;
  const usage: OnUsage | undefined = cue && onUsage ? u => onUsage({ ...u, cue, latencyMs: Date.now() - t0 }) : onUsage;
  state.messageAsks = classifyDataRequests({ candidateText: ctx.candidateText, interviewerText: null, catalog: state.catalog, onUsage: usage })
    .catch(() => null).then(detected => ({ sentences, detected, latencyMs: Date.now() - t0, ...(cue ? { cue } : {}) }));
  return state.messageAsks;
}
// Started beside the model call when a sentence asks; a message with none is
// classified only if a model release needs the check (Task 51, below).
export function startMessageAsks(plan: ModelPlan, onUsage?: OnUsage): Promise<MessageAsks> | null {
  const { state } = plan;
  if (state.kind !== 'model') return null;
  if (state.messageAsks) return state.messageAsks;
  const sentences = messageAskSentences(plan);
  return sentences.length === 0 ? Promise.resolve({ sentences, detected: [] }) : classifyMessage(plan, sentences, onUsage);
}
// The detections, waited on at most ASK_WAIT_MS from the first wait (null after it);
// one outcome for Stream and Settle.
function heardAsks(plan: ModelPlan, started: Promise<MessageAsks>): Promise<MessageAsks & { timedOut?: true }> {
  const { state } = plan;
  if (state.messageAsksHeard) return state.messageAsksHeard;
  const t0 = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(r => { timer = setTimeout(() => r(null), ASK_WAIT_MS); });
  state.messageAsksHeard = Promise.race([started, timeout]).finally(() => clearTimeout(timer))
    .then(x => ({ ...(x ?? { sentences: messageAskSentences(plan), detected: null, timedOut: true as const, ...(wantIsOnly(plan) ? { cue: 'want_is' as const } : {}) }), waitMs: Date.now() - t0 }));
  return state.messageAsksHeard;
}

// ---- A model release the message never asked for (round 5 Task 51, A5) ----
// B2 Hollis Bay Marisol a14ca044 t9 → t10: "Do we have a sense of what marketing
// looks like in year two, or is the $4.5 million a one-time launch push?" (and
// whether the roasting line's lease recurs) — the model declared a release of
// longer_term_goals, "Hollis Bay's goals beyond year one, including year-two
// marketing and line costs", and code said its line ("Hollis Bay's hope is that
// the line becomes a growth platform…"). The model's `what` is no evidence for its
// item: it was written from the item's label. So an explicit model release of an
// item not yet out is checked before release when the item's own words — its label,
// spoken name, the case's names and covers for it — share no content word with the
// candidate's message or the question it answers (request-signal.ts namesItem: stem
// match, the case's proper names aside), no group the message names holds it (the
// case's groups: "the cost breakdown"), and no earlier ask for it is open. The
// whole message, not only its asking sentences: those miss a pointer ("Can we see
// that breakdown?", "Do we have the cost breakdown per cup…") — over b28–b35's
// recorded declarations, asking sentences alone send 124 of 522 model releases of
// an item not yet out to the check (67 of prof-001's 371, all answering the ask);
// the whole message 3, none prof-001 (Marisol t9 among them). A message that names
// nothing at all ("Could you share them?") points at the conversation: no check.
// The check is the classifier on the message — the small model the item-less check
// uses, in detection mode, on the candidate's words (a check on the model's `what`
// maps it straight back to its item) — the call above, already running beside the
// model call when a sentence asks (started here otherwise), waited on at most
// ASK_WAIT_MS:
//   - a detection maps the item: the release stands;
//   - none does: the item is taken off the declaration (a declaration left with no
//     item is dropped, never refused in the model's words — "I don't have Hollis
//     Bay's goals beyond year one" would refuse data the case holds), and the
//     message's asks the declaration covered are answered on their own (`fresh`):
//     Task 45's decisions through turnDataChecked — refused, restated, released
//     under every gate, or named;
//   - no verdict (failure, timeout): the release stands — no data is withheld unchecked.
// Logged `release_checked` (Settle), with the classifier's latency and the turn's wait.
export type ReleaseCheck = { what: string; raw: string; id: string };
export function uncheckedReleases(plan: ModelPlan, declared: DeclaredRequest[]): ReleaseCheck[] {
  const { state, ctx } = plan;
  if (state.kind !== 'model') return [];
  const releases = declared.filter(r => r.explicit && r.respond === 'release' && r.itemIds.length > 0);
  if (releases.length === 0) return [];
  const resolve = caseResolver(plan);
  const fb = state.factBase;
  const text = `${ctx.candidateText}\n${state.lastQuestion ?? ''}`;
  const caseNames = properNames(state.caseData.sttKeyterms);
  // A message that names nothing points at the conversation, which only the model reads.
  if (namesNothing(ctx.candidateText, caseNames)) return [];
  const grouped = new Set(groupItemsAsked(text, fb));
  const open = new Set(state.openDataRequests.map(o => o.ledgerItemId));
  return releases.flatMap(r => r.itemIds.flatMap(raw => {
    const id = resolve(raw);
    const item = id ? state.ledger.items.find(i => i.id === id) : undefined;
    if (!item || !canReveal(state.ledger, item.id) || open.has(item.id) || grouped.has(item.id)) return [];
    const own = [item.label, item.spoken ?? '', ...(fb.quantities.find(q => q.id === item.id)?.names ?? [])];
    return namesItem(text, own, caseNames, fb.covers.find(c => c.id === item.id)?.phrases ?? []) ? [] : [{ what: r.what, raw, id: item.id }];
  }));
}
// The declarations without the releases the check withdrew; one left with no item is dropped.
function withoutReleases(requests: DeclaredRequest[], out: ReleaseCheck[]): DeclaredRequest[] {
  return requests.flatMap(r => {
    if (!r.explicit || r.respond !== 'release') return [r];
    const raws = new Set(out.filter(o => o.what === r.what).map(o => o.raw));
    if (raws.size === 0) return [r];
    const itemIds = r.itemIds.filter(x => !raws.has(x));
    return itemIds.length > 0 ? [{ ...r, itemIds }] : [];
  });
}
export type ReleaseOutcome = { checked: ReleaseCheck[]; confirmed: string[]; withdrawn: ReleaseCheck[]; classified: boolean; latencyMs: number | null; waitMs: number | null };

// The asks a model turn answers beside the model's declared ones (`fresh`), and
// those no asking sentence covers (`dropped`) or an explicit declaration does
// (`covered`); `open`: the sentences with a clause no explicit declaration names
// (none, and no release to check: the classifier is not waited on, `detected`
// null); `release`: the Task 51 check, when a model release needed it. Null off a model turn.
export type TurnAsks = MessageAsks & { open: string[]; waited: boolean; timedOut?: true; fresh: DetectedDataRequest[]; covered: DetectedDataRequest[]; dropped: DetectedDataRequest[]; release?: ReleaseOutcome };
export async function messageAsks(plan: ModelPlan, declared: DeclaredRequest[], onUsage?: OnUsage): Promise<TurnAsks | null> {
  const started = startMessageAsks(plan, onUsage);
  if (!started) return null;
  const caseNames = properNames(plan.state.caseData.sttKeyterms);
  const sentences = messageAskSentences(plan);
  const open = undeclaredSentences(sentences, declared.filter(r => r.explicit), caseNames);
  const checking = uncheckedReleases(plan, declared);
  const cue = wantIsOnly(plan) ? { cue: 'want_is' as const } : {};
  if (open.length === 0 && checking.length === 0) return { sentences, detected: null, open, waited: false, fresh: [], covered: [], dropped: [], ...cue };
  const heard = await heardAsks(plan, checking.length > 0 ? classifyMessage(plan, sentences, onUsage) : started);
  const { detected, timedOut } = heard;
  const confirmed = detected === null ? checking.map(c => c.id) : checking.filter(c => detected.some(d => d.ledgerItemIds.includes(c.id))).map(c => c.id);
  const withdrawn = checking.filter(c => !confirmed.includes(c.id));
  const release: ReleaseOutcome | undefined = checking.length > 0
    ? { checked: checking, confirmed: [...new Set(confirmed)], withdrawn, classified: detected !== null, latencyMs: heard.latencyMs ?? null, waitMs: heard.waitMs ?? null }
    : undefined;
  const base = { sentences, detected, open, waited: true, ...(timedOut ? { timedOut } : {}), ...(release ? { release } : {}), ...cue,
    ...(heard.latencyMs !== undefined ? { latencyMs: heard.latencyMs } : {}), ...(heard.waitMs !== undefined ? { waitMs: heard.waitMs } : {}) };
  // Waited only for the check, and the release stands: no ask was left out.
  if (open.length === 0 && withdrawn.length === 0) return { ...base, fresh: [], covered: [], dropped: [] };
  const explicit = withoutReleases(declared, withdrawn).filter(r => r.explicit);
  // Every asking sentence: the gate only decided to wait; coverage is per detection.
  const { kept, dropped } = matchAskDetections(sentences, (detected ?? []).filter(r => r.explicit));
  return { ...base, ...uncoveredAsks(explicit, kept, caseNames), dropped };
}
export function withAsks<T extends Pick<ModelTurn, 'requests'>>(turn: T, asks: TurnAsks | null): T {
  const out = asks?.release?.withdrawn ?? [];
  if (!asks || (asks.fresh.length === 0 && out.length === 0)) return turn;
  return { ...turn, requests: [...withoutReleases(turn.requests, out), ...asks.fresh.map(r => ({ what: r.what, itemIds: r.ledgerItemIds, explicit: true, respond: 'release' as const }))] };
}

// ---- Restatements (Phase 1 4.1, `restateRules`) ----
// Lorenzo, 22 Oct: "Restatements: if the asked thing is in an exhibit, point to it and give its one-line summary; read
// a number only if that specific figure was asked; restate only the matched item's line, and never the same item twice
// within 4 turns." (b38 Larkspur Tyler cee7d399 t22 / t24: the 90-word Exhibit 1 line restated twice in a row, first
// beside the connecting share for "the revenue attributable to those connecting passengers on the onward legs").
// For the ledger items a turn says again (decideData's restates), in this order:
//   (1) matched — the ask names the item: one of its naming words (label, spoken name, the case's names; request-
//       signal.ts namesItem, the case's proper names aside) or one of its covers, in the candidate's asking sentence for
//       the ask (else the message's sentence sharing most words with it; the model's words when none does). When some
//       restated items are matched and some aren't, only the matched are said; when none is, all are (nothing to tell
//       them apart by);
//   (2) never twice within four turns — an item whose line (or a pre-written version of it, or its exhibit's summary)
//       an interviewer turn of the last four (grading numbering: t20 and t22 for t24) said is named, not said again
//       ("I gave you <its spoken name> a moment ago.", `recentRestates`);
//   (3) the exhibit pointer — an item on an exhibit already shown that has a summary (Stream 2's overlay) gets the
//       summary in place of its line ("You'll find that on the exhibit — <summary>"), once per exhibit; its line is read
//       only when the ask names it (a name said whole, or a proper name the item carries) and asks for a figure ("what was
//       …", "how much", "the exact number"; not "remind me how … did").
// Logged `restate_rules`. Off, or a restatement none of these touch: the line, as before. A said-earlier item's line is
// still read when matched and not recent (the figure rule is read as the exhibit's: judgement, in the stream report).
// A re-ask that asks for the figure itself (review F5): a question word, a direct "can you give me / could you repeat /
// remind me / say that again / again", or a split or breakdown ask (its parts are figures). Such a re-ask is read again
// — neither named as recent nor answered by an exhibit pointer (b31 Brew & Bean Blake 47fa8cfd t17 "Can we get the COGS
// breakdown?", b32 Larkspur Marcus eb170e49 t9 "Can you give me the flight count for both years").
const FIGURE_ASK = /\bwhat(?:'s| (?:was|is|were|are))\b|\bhow (?:much|many|big|high|low|large)\b|\b(?:the )?(?:exact|precise|specific) (?:figure|number|amount|value)\b|\b(?:can|could|would|will) (?:we|i|you)\s+(?:please\s+)?(?:get|have|see|give|share|repeat|read|run)\b|\bremind me\b|\bsay that again\b|\bagain\b/i;
const SPLIT_ASK = new RegExp(String.raw`\b(?:split|splits|breakdown|broken (?:down|out)|break[- ]?down|composition|components?|makeup|make-up|mix)\b`, 'i');
const RESTATE_WINDOW = 4;
function saidRecently(plan: ModelPlan, texts: string[]): boolean {
  const { state, ctx } = plan;
  const from = ctx.nextTurnIndex + 1 - RESTATE_WINDOW;
  const said = state.turnRows.filter(t => t.role === 'interviewer' && t.turnIndex >= from).map(t => t.text);
  return texts.some(x => x.length > 0 && said.some(t => t.includes(x)));
}
function restateRules(plan: ModelPlan, d: DataDecisions, groupOrigin: ReadonlyMap<string, string>, asking: string[]): void {
  const { state } = plan;
  const { caseData, factBase: fb, ledger } = state;
  const caseNames = properNames(caseData.sttKeyterms);
  const itemOf = (id: string) => ledger.items.find(i => i.id === id);
  const own = (id: string) => { const i = itemOf(id); return i ? [i.label, i.spoken ?? '', ...(fb.quantities.find(q => q.id === id)?.names ?? [])] : []; };
  const coversOf = (id: string) => fb.covers.find(c => c.id === id)?.phrases ?? [];
  // The words each restated item was asked in: the candidate's sentence for the ask, else the model's (a group's own ask too).
  const askTexts = (id: string) => [...new Set(d.requests.filter(x => x.ledgerItemIds.includes(id)).flatMap(x => [x.request.what, groupOrigin.get(x.request.what)].filter((w): w is string => !!w)))]
    .map(w => askSentenceFor(w, asking, caseNames) ?? askSentenceFor(w, sentencesOf(plan.ctx.candidateText), caseNames) ?? w);
  const named = (id: string) => askTexts(id).some(t => namesItem(t, own(id), caseNames, coversOf(id)) || coverageOf(t, fb).items.includes(id));
  const ids = d.restates.map(r => r.id);
  const matched = ids.filter(named);
  const unmatched = matched.length > 0 ? ids.filter(id => !matched.includes(id)) : [];
  const exhibitOf = (id: string) => caseData.exhibits.find(e => state.shownExhibitIds.has(e.id) && (e.coversLedgerItems ?? []).includes(id) && e.summary);
  const linesOf = (id: string) => { const v = itemOf(id)?.value ?? ''; return [v, ...(dataLineVersions(v)?.versions ?? []), exhibitOf(id)?.summary ?? '']; };
  // A proper name said in the ask that the item's own words carry too: one of the case's ("Port Avery"), or a one-word
  // name of the item said capitalised ("Westhaven's contribution").
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lowerHas = (t: string, n: string) => new RegExp(`(?<![a-z])${esc(n.toLowerCase())}(?![a-z])`).test(t.toLowerCase());
  const properNamed = (t: string, id: string) => caseNames.some(n => lowerHas(t, n) && own(id).some(w => lowerHas(w, n)))
    || own(id).some(w => /^[a-z]{4,}$/.test(w) && new RegExp(`(?<![A-Za-z])${w.charAt(0).toUpperCase()}${esc(w.slice(1))}(?![a-z])`).test(t));
  // For the recent rule (review F5): a direct re-ask — the ask itself asks for the figure or for a split. The item is
  // already the one the ask names (step 1), so no further naming test applies ("Can you give me the flight count for
  // both years", b32 Larkspur Marcus eb170e49 t9).
  const directAsk = (id: string) => [...askTexts(id), ...asking.filter(t => namesItem(t, own(id), caseNames, coversOf(id)))]
    .some(t => FIGURE_ASK.test(t) || SPLIT_ASK.test(t));
  // For the pointer rule: the figure of that item, named ("What was Westhaven's contribution again?") — pointing at the
  // exhibit answers a vaguer re-ask, but not an ask for one figure.
  const figureAsked = (id: string) => askTexts(id).some(t => SPLIT_ASK.test(t) || (FIGURE_ASK.test(t) && (saysItemName([t], own(id)) || properNamed(t, id))));
  // Review F5: a direct re-ask of the figure is read again, however recently it was said.
  const recent = ids.filter(id => !unmatched.includes(id) && !directAsk(id) && saidRecently(plan, linesOf(id)));
  const pointed: string[] = [];
  const ownLine: string[] = [];
  const cutRefusals: string[] = [];
  const ownLineCuts = (id: string) => {
    const i = itemOf(id);
    if (!i) return [];
    const qitems = qualifierItems([i], caseData.dataLedger, x => labelWithPeriod(x as Parameters<typeof labelWithPeriod>[0]));
    const given = new Set([...ledger.revealed, ...d.releases.map(x => x.id), ...d.restates.map(x => x.id)]);
    // Only the declared ask's own words (never the candidate's sentence: its statements and figures are not asks), and
    // only a part that reads as a thing asked for — no figure (FR-4), no first-person or reply clause.
    const whats = [...new Set(d.requests.filter(x => x.ledgerItemIds.includes(id)).map(x => x.request.what))];
    return whats.flatMap(t => gateReading(t, qitems, caseData.dataLedger, { topics: true }).parts)
      .map(p => p.replace(/^(?:do|does|did|can|could)\s+(?:we|you|i)\s+(?:have|know|get)\s+/i, '').trim())
      .filter(p => p.length > 0 && !/\d/.test(p) && !/\b(?:I|I'd|I'm|we're|that's|so)\b/.test(p) && p.split(/\s+/).length <= 12)
      .filter(p => !statesAsked(p, { label: i.label, value: i.value }, caseData.dataLedger)
        && findFalseRefusals(`I don't have ${p}.`, fb, given, { covers: true }).length === 0
        && !d.refusals.some(x => normAsk(x) === normAsk(p)));
  };
  d.restates = d.restates.flatMap(r => {
    if (unmatched.includes(r.id) || recent.includes(r.id)) return [];
    // (the pointer rule reads `figureAsked` below)
    const e = exhibitOf(r.id);
    // `restatePointerOff` (measurement only, Lorenzo 27 Oct): the line instead of the exhibit pointer, the rest of 4.1 unchanged.
    if (!e || figureAsked(r.id) || switchOn(caseData, 'restatePointerOff')) return [r];
    // `restateOwnLine` (S6's start, Lorenzo 27 Oct, option B): the item's own line again, no exhibit summary, and the
    // ask's finer parts its line doesn't hold refused — only where that refusal is true. No model call.
    if (switchOn(caseData, 'restateOwnLine')) { ownLine.push(r.id); cutRefusals.push(...ownLineCuts(r.id)); return [r]; }
    pointed.push(r.id);
    return [{ ...r, pointer: /[.!?]$/.test(e.summary!.trim()) ? e.summary!.trim() : `${e.summary!.trim()}.` }];
  });
  const cuts = [...new Map(cutRefusals.map(p => [normAsk(p), p])).values()];
  if (cuts.length > 0) d.refusals = [...d.refusals, ...cuts];
  if (ownLine.length > 0) plan.ctx.checks.act('restate_own_line', 'an exhibit item re-asked: its own line again, no exhibit summary; finer parts it does not hold refused (S6 start, option B)', { items: ownLine, ...(cuts.length > 0 ? { refused: cuts } : {}) });
  if (recent.length > 0) d.recentRestates = [...new Set([...(d.recentRestates ?? []), ...recent.map(id => { const i = itemOf(id)!; return i.spoken ?? spokenItemName(i.label); })])];
  // Review F5: a restatement the rules dropped leaves the decision rows too — the log must not claim an item was given.
  // A row left with no item is dropped only while another row keeps its ask on the record (scoring reads these rows).
  const dropped = new Set([...unmatched, ...recent]);
  if (dropped.size > 0) {
    const rows = d.requests.map(x => (x.ledgerItemIds.some(id => dropped.has(id)) ? { ...x, ledgerItemIds: x.ledgerItemIds.filter(id => !dropped.has(id)) } : x));
    d.requests = rows.filter((x, i) => x.ledgerItemIds.length > 0 || !d.requests[i].ledgerItemIds.some(id => dropped.has(id))
      || !rows.some((y, j) => j !== i && normAsk(y.request.what) === normAsk(x.request.what)));
  }
  if (unmatched.length + recent.length + pointed.length > 0) plan.ctx.checks.act('restate_rules', 'a restatement: only the items the ask names; none said within the last four turns (named instead); an exhibit\'s item pointed to with its summary', { ...(unmatched.length > 0 ? { unmatched } : {}), ...(recent.length > 0 ? { recent } : {}), ...(pointed.length > 0 ? { pointed } : {}) });
}

// `checked`: the check's decisions on this turn's unmatched asks (turnDataChecked's
// second pass), applied once the coverage step has read every ask.
export function turnData(plan: ModelPlan, turn: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'>, checked?: ReadonlyMap<string, CheckedAsk>): TurnData {
  const { ctx, state } = plan;
  const { ledger } = state;
  const resolve = caseResolver(plan);
  // Closed: answered, waived (v3), or waiving on this turn — nothing is premature.
  const satisfied = (state.ptSatisfiedNow ?? state.pressureTest.state === 'satisfied')
    || Boolean(state.ptWaivingNow) || state.pressureTest.state === 'waived';
  const forcesOpen = FORCES_OPEN.has(state.kind);
  const gateOn = !satisfied && !forcesOpen;
  const exhibitCovers = new Map(state.caseData.exhibits.map(e => [e.id, (e as { coversLedgerItems?: string[] }).coversLedgerItems ?? []]));
  const gated = (id: string) => (exhibitCovers.has(id) ? exhibitIsGated(ledger, exhibitCovers.get(id)!) : isGatedItem(ledger, id));
  const gatedIds: string[] = [];
  const gateHeld = new Set<string>();
  const exhibits: ExhibitInfo[] = state.caseData.exhibits.map(e => ({ id: e.id, title: e.title, coversLedgerItems: e.coversLedgerItems, after: e.after, requiresItems: e.requiresItems }));
  // An open ask whose data waits on the exhibit order is not forced out (it
  // would be deferred out loud every turn); it goes once its exhibit is ready.
  const waiting = (id: string) => heldForOrder(id, exhibits, state.shownExhibitIds, ledger, state.stagesOut);

  // An unmapped explicit ask (item_ids []) that names exactly one catalog
  // label is that item (v3, batch 18 Maya t6): an empty mapping is the
  // model's claim, not proof the case lacks the data. Mentions stay as declared.
  let requests: DeclaredRequest[] = resolveRequests(turn.requests, resolve).map(r => {
    if (r.itemIds.length > 0 || !r.explicit) return r;
    const id = labelMatch(r.what, ledger.items);
    return id ? { ...r, itemIds: [id] } : r;
  });
  // A mention the candidate asked for (round 6 Task 71, audit row 6, the offer half; b36 Larkspur Tyler
  // 4e91d638 t5: "I'd want to know fares and passenger counts specifically on Lakeport and Port Avery." —
  // the model declared the Lakeport load line `explicit: false`, and code offered it): on a tagged case an
  // item of an `explicit: false` declaration that an asking sentence of the message names — says one of
  // its names whole in one sentence (request-signal.ts saysItemName: its label, spoken name, the case's
  // names and covers for it, proper names included, two words at least; namesItem's one shared word would promote b35 Hollis Bay
  // Jasmine t5's offer of the planning assumptions, a different item, Task 50's ruling) — is asked:
  // released under every gate, not offered (`mention_asked`). The sentences:
  // the message's addressed ones (messageAskSentences) and, before the brainstorm, guard B's explicit-cue
  // ones (requestSentences) — the addressed ones miss Tyler's (", I'd want to know …" reads as
  // self-answered). Not a bare stated need: b37 Quillpath Marcus t9's "I'd need to multiply by expected
  // tenure on each plan" (audit row 16) names "plan" and asks for nothing. Untagged prof-001 offers as before.
  if (state.factBase.answerGate && state.kind === 'model') {
    const early = WANT_ASK_PHASES.includes(ctx.currentPhase) ? requestSentences(ctx.candidateText) : [];
    const said = [...new Set([...messageAskSentences(plan), ...early])];
    const fbn = state.factBase;
    const asked: { what: string; ids: string[] }[] = [];
    requests = requests.flatMap(r => {
      if (r.explicit || said.length === 0) return [r];
      const named = r.itemIds.filter(id => {
        const item = ledger.items.find(i => i.id === id);
        return item !== undefined && saysItemName(said, [item.label, item.spoken ?? '', ...(fbn.quantities.find(q => q.id === id)?.names ?? []), ...(fbn.covers.find(c => c.id === id)?.phrases ?? [])]);
      });
      if (named.length === 0) return [r];
      asked.push({ what: r.what, ids: named });
      const rest = r.itemIds.filter(id => !named.includes(id));
      return [{ ...r, itemIds: named, explicit: true }, ...(rest.length > 0 ? [{ ...r, itemIds: rest }] : [])];
    });
    if (asked.length > 0) plan.ctx.checks.act('mention_asked', 'a mention an addressed asking sentence names: asked, not offered', { asks: asked });
  }
  // An ask that names a group of items (the case's factAnchors groups: "what's
  // inside COGS", "COGS breakdown by input", "the cost breakdown") is answered
  // with every item of the group the case holds (Phase 3, Lorenzo: a COGS-by-
  // input ask releases the bean share, the bean price change and the other
  // inputs' change — the scope check had kept only the share). The release
  // cap still applies; the rest is deferred out loud.
  const fbGroups = state.factBase;
  const grouped = new Map<string, Set<string>>();
  // The case's names for an item, for the scope checks.
  const namesOf = (id: string) => fbGroups.quantities.find(q => q.id === id)?.names ?? [];
  // A split within one item of a group is finer than the group (Lorenzo, 13
  // Oct; Marcus 71a04add t12: "the split within the non-bean input costs" is
  // not the input price changes): no expansion; refused when nothing is left.
  const finerAsks = new Set<string>();
  const inLedger = (id: string) => ledger.items.some(i => i.id === id);
  // The candidate's own asking sentence names the group too (Lorenzo, 15 Oct;
  // batch 25: Marcus f8ed869d t7 "a split of that 58 by category, coffee versus
  // dairy versus food", labelled "the breakdown of COGS by category" — one item;
  // Fiona 52743bea t5 "a split of COGS by component", labelled item by item): a
  // declared ask mapped into a group the sentence names is that group's ask —
  // what of it is still to come: a re-ask for "the rest of the COGS breakdown"
  // isn't answered with the share given earlier.
  const asking = askingSentences(ctx.candidateText, ctx.currentPhase);
  const sentenceGroups = asking.map(s => groupItemsAsked(s, fbGroups).filter(inLedger)).filter(g => g.length > 0);
  // The candidate's asking sentence for an ask, read by coverageOf on tagged cases (round 6 Task 68).
  const sentenceFor = (what: string) => askSentence(plan, what, asking);
  const toCome = (r: DeclaredRequest, g: string[]) => g.filter(id => r.itemIds.includes(id) || !ledger.revealed.has(id));
  // Asked by another of the turn's requests: kept there, in the model's order.
  const askedThisTurn = new Set(requests.filter(r => r.explicit).flatMap(r => r.itemIds));
  // Round 6 Task 68 (audit row 6, b36 Larkspur Tyler t5: "Do we have average fare by
  // route?" mapped to the Lakeport fare only; Lorenzo, 21 Oct): on a tagged case an
  // explicit ask the model mapped gets the items the case's covers name for it — in its
  // words or the candidate's sentence for it — their tags agreeing (`covers_added`; on an
  // untagged case only the per-store rule below adds). Before the group step, which may
  // say an ask back in its items' labels.
  if (fbGroups.answerGate) {
    const coversAdded: { what: string; added: string[] }[] = [];
    // Review F1: with coverNormalization on, a cover the synonyms reach does not add a line that repeats, word for word,
    // a line the turn already carries (b34 Larkspur Raj 061ef630 t7: the routes-and-schedule line's "the same number of
    // flights on each" beside the network totals' "the same number of flights in both years", in one utterance).
    const dedupe = switchOn(state.caseData, 'coverNormalization');
    const sameRun = (id: string, others: string[]) => others.some(o => o !== id && repeatsLine(ledger.items.find(i => i.id === id)?.value ?? '', ledger.items.find(i => i.id === o)?.value ?? ''));
    requests = requests.map(r => {
      if (!r.explicit || r.itemIds.length === 0) return r;
      const added = coverageOf(r.what, fbGroups, { sentence: sentenceFor(r.what) }).items
        .filter(id => inLedger(id) && !askedThisTurn.has(id) && !coverGateMiss(plan, r.what, id, sentenceFor(r.what))
          && !(dedupe && sameRun(id, [...askedThisTurn, ...r.itemIds])));
      if (added.length === 0) return r;
      coversAdded.push({ what: r.what, added });
      return { ...r, itemIds: [...r.itemIds, ...added] };
    });
    if (coversAdded.length > 0) plan.ctx.checks.act('covers_added', 'an ask the model mapped that the case\'s covers answer further: the items they name for it, their tags agreeing', { asks: coversAdded });
  }
  // The groups this turn asks for, whole: the release cap never splits one.
  const askedGroups: string[][] = [];
  // A group step's per-item ask → the ask it came from (the answer gate reads that ask, Task 70).
  const groupOrigin = new Map<string, string>();
  // Phase 1 4.7: an ask said back in an item's label (the group step, the coverage step, the names remap, the check's
  // items) → the words it was asked in, so a model deferral of those words reads this turn's rows for them.
  const askOrigin = new Map<string, string>();
  const labelAsk = (r: DeclaredRequest, id: string, extra: Partial<DeclaredRequest> = {}): DeclaredRequest => {
    const what = ledger.items.find(i => i.id === id)!.label;
    if (!askOrigin.has(what)) askOrigin.set(what, groupOrigin.get(r.what) ?? askOrigin.get(r.what) ?? r.what);
    return { ...r, itemIds: [id], what, ...extra };
  };
  requests = requests.flatMap(r => {
    if (!r.explicit) return [r];
    const named = groupItemsAsked(r.what, fbGroups).filter(inLedger);
    const fromSentence = sentenceGroups.filter(g => r.itemIds.some(id => g.includes(id))).flatMap(g => toCome(r, g));
    const groupIds = [...new Set([...named, ...fromSentence])];
    if (groupIds.some(id => splitOfItem(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)))) { finerAsks.add(r.what); return [r]; }
    // Every item of the group: those the model left out, and those it mapped that
    // the ask's wording would put out of scope — each asked in its own label, so
    // the scope rule reads the item, not the wording (Lorenzo, 14 Oct; batch 24:
    // Raj ba2e03be's "COGS split by input (beans versus other inputs)", mapped to
    // all three, lost the two price changes to the split rule).
    if (groupIds.length > 0) askedGroups.push(groupIds);
    const add = groupIds.filter(id => !r.itemIds.includes(id) && !askedThisTurn.has(id));
    const scopedOut = groupIds.filter(id => r.itemIds.includes(id) && outsideAskScope(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)));
    if (groupIds.length === 0 || (add.length === 0 && scopedOut.length === 0)) return [r];
    // One ask per item, in its own label — said back without the candidate's
    // wording, which may carry a cut the case doesn't hold ("… and unit cost per pound").
    const ids = [...new Set([...r.itemIds, ...add])];   // the model's order, then what it left out
    const asks = ids.map(id => ({ ...r, itemIds: [id], what: ledger.items.find(i => i.id === id)?.label ?? r.what }));
    for (const a of asks) { grouped.set(a.what, new Set(ids)); groupOrigin.set(a.what, r.what); }
    return asks;
  });
  if (grouped.size > 0) plan.ctx.checks.record('request_group', true, 'asks naming a group of items — every item of it', { groups: [...grouped].map(([what, ids]) => ({ what, ids: [...ids] })) });
  // A qualified ask keeps its scope (v4.10): an item it can't answer — the
  // whole when a split of it was asked for, a cut it doesn't have — is not
  // what was requested, released or restated (data-decisions.ts).
  const scoped: { what: string; ids: string[]; rules?: Record<string, ScopeRule> }[] = [];
  // Phase 1 4.2: the items the model itself named this turn, and every name of an item (label, spoken, the case's names).
  const keepNamed = switchOn(state.caseData, 'coarseKeepNamed');
  const modelNamed = new Set(keepNamed ? resolveRequests(turn.requests, resolve).filter(r => r.explicit).flatMap(r => r.itemIds) : []);
  const itemNames = (id: string) => { const item = ledger.items.find(i => i.id === id); return item ? [item.label, item.spoken ?? '', ...namesOf(id)] : []; };
  const keptNamed: { what: string; ids: string[] }[] = [];
  // Asks the BASIS rule emptied: checked like an item-less deferral before any refusal goes out.
  const basisEmptied = new Set<string>();
  // Asks the other scope rules emptied — they matched an item that can't answer
  // the finer cut they ask for (Lorenzo, 20 Oct, round 5 E1; batch 34 Aldermoor
  // Marisol t14 "the current treatment mix across treated patients", Jasmine t4
  // "current US treatment breakdown by drug class", both refused whole): each
  // keeps its coarse items, given back to it once the coverage step below has
  // read the ask (`coarseOf`). A finer ask left holding only the exhibit the
  // model handed over is backed by that exhibit (`exhibitBacked`).
  const coarseOf = new Map<string, string[]>();
  // Asks whose coarse item was dropped as a split OF THAT ITEM — the ask names the item and wants it cut finer
  // (b34a Jasmine "current US treatment breakdown by drug class" against `current_treatment`). Only these are
  // Lorenzo's refined rule 1 (`coarseNoRefusal`): an ask whose coarse item merely COVERS the topic (the coverage
  // path below) is a different quantity, so refusing the asked one beside it is true and right.
  const splitCoarse = new Set<string>();
  const exhibitBacked = new Map<string, string[]>();
  // Asks emptied of topic siblings only (no coarse item): refused unchecked, as before E1.
  const siblingsOnly = new Set<string>();
  const basisCut: Record<string, string[]> = {};
  requests = requests.flatMap(r => {
    // An item the case's own `covers` names for the ask is in its scope (Marisol
    // 0f7551c2 t9: "transaction volume per store" mapped to the ticket, which the
    // per-store cut had dropped; Lorenzo, 15 Oct, batch-25 ruling 7).
    const cov = coverageOf(r.what, fbGroups, { sentence: sentenceFor(r.what) });
    // Exempt from the scope rules only through the tag gate (fix round 1; untagged: every covered item).
    const coveredHere = new Set(cov.items.filter(id => !coverGateMiss(plan, r.what, id, sentenceFor(r.what))));
    // A per-store ask the covers answer whole (Lorenzo, 16 Oct; batch 27, Fiona
    // f4bd1da5 t9 "transaction volume per store" mapped to revenue per store and
    // the store count, Marcus 9cb2554f t15 to the ticket and revenue per store):
    // the item the covers name is added where the model left it out, and a mapped
    // item that is only the cut — its label per store, named by neither the
    // covers nor the ask — is dropped: the ticket, not revenue per store.
    // (An ask the model mapped to nothing goes to the coverage step below.)
    const storeCut = /\b(?:per|by) (?:store|location)\b/i;
    if (r.explicit && r.itemIds.length > 0 && cov.rest === null && storeCut.test(r.what) && cov.items.some(id => ledger.items.some(i => i.id === id))) {
      const lower = r.what.toLowerCase();
      const named = (id: string) => [...namesOf(id), ledger.items.find(i => i.id === id)?.label ?? '']
        .some(n => n && new RegExp(`(?<![a-z])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(lower));
      // On a tagged case only items whose tags agree (round 6 Task 68; covers_added, above, has added them already).
      const added = cov.items.filter(id => !r.itemIds.includes(id) && ledger.items.some(i => i.id === id) && coveredHere.has(id));
      const cutOnly = r.itemIds.filter(id => !coveredHere.has(id) && !named(id) && storeCut.test(ledger.items.find(i => i.id === id)?.label ?? ''));
      if (added.length > 0 || cutOnly.length > 0) {
        plan.ctx.checks.act('request_covers', 'a per-store ask the case\'s covers answer: the item they name, not the per-store cut', { what: r.what, added, dropped: cutOnly });
        r = { ...r, itemIds: [...r.itemIds.filter(id => !cutOnly.includes(id)), ...added] };
      }
    }
    // Phase 1 4.2 (`coarseKeepNamed`; data-decisions.ts namedAsPart): a split rule never drops an item the model named
    // when the ask names it as one side of the split asked (b38 Larkspur Jasmine t4); every rule that fired is logged.
    const rules: Record<string, ScopeRule> = {};
    const kept0: string[] = [];
    const out = r.itemIds.filter(id => {
      const item = ledger.items.find(i => i.id === id);
      if (item === undefined || coveredHere.has(id)) return false;
      if (!keepNamed) return outsideAskScope(r.what, item, namesOf(id));
      const rule = scopeRule(r.what, item, namesOf(id));
      if (rule === null) return false;
      if (r.explicit && SPLIT_RULES.has(rule) && modelNamed.has(id) && namedAsPart([r.what, sentenceFor(r.what) ?? ''], itemNames(id))) { kept0.push(id); return false; }
      rules[id] = rule;
      return true;
    });
    if (kept0.length > 0) keptNamed.push({ what: r.what, ids: kept0 });
    if (out.some(id => splitOfItem(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)))) finerAsks.add(r.what);
    const kept = { ...r, itemIds: r.itemIds.filter(id => !out.includes(id)) };
    if (out.length > 0) scoped.push({ what: r.what, ids: out, ...(keepNamed ? { rules } : {}) });
    if (r.explicit && out.length > 0 && kept.itemIds.length === 0) {
      if (BASIS.test(r.what)) { basisEmptied.add(r.what); basisCut[r.what] = [...new Set([...(basisCut[r.what] ?? []), ...out])]; }
      else {
        // Only an item that holds the asked quantity at a coarser cut is a coarse
        // item; a change item asked for a split is a sibling, never given for it.
        // An ask with no coarse item is refused as before, unchecked: the replay
        // has no verdict for a new check, and no verdict is a named deferral
        // (controller ruling, 20 Oct, replay r5-44: b31 Sofia t17).
        const coarse = out.filter(id => !changeForSplit(r.what, ledger.items.find(i => i.id === id)!));
        if (coarse.length > 0) {
          coarseOf.set(r.what, [...new Set([...(coarseOf.get(r.what) ?? []), ...coarse])]);
          if (coarse.some(id => splitOfItem(r.what, ledger.items.find(i => i.id === id)!, namesOf(id)))) splitCoarse.add(r.what);
        } else siblingsOnly.add(r.what);
      }
    }
    // A finer ask the case doesn't hold is refused (4b), even beside an exhibit the
    // model handed over for it — unchecked, as before E1 (a group-level split: the
    // controller's ruling, 20 Oct); `scope_coarse` logs it when the exhibit goes out.
    if (r.explicit && finerAsks.has(r.what) && kept.itemIds.length > 0 && !kept.itemIds.some(id => ledger.items.some(i => i.id === id))) {
      exhibitBacked.set(r.what, kept.itemIds);
      siblingsOnly.add(r.what);
      return [kept, { ...r, itemIds: [] }];
    }
    return [out.length === 0 ? r : kept];
  });
  if (scoped.length > 0) plan.ctx.checks.act('request_scope', 'items outside a qualified ask dropped from it', { scoped });
  if (keptNamed.length > 0) plan.ctx.checks.act('coarse_keep_named', 'a split rule would drop an item the model named that the ask names as one side of the split: kept', { asks: keptNamed });
  // ---- The answer gate (round 6 Task 70; answerGate above) ----
  // `gateMade`: the asks it writes (its parts; a named deferral) — the coverage step leaves
  // them; `gateRefused`: its refusals, said unchecked (never `toCheck`). `coverVetoed` (Task
  // 68, below): the named deferral in the ask's words, holding no item, no check.
  const gateMade = new Set<string>();
  const gateRefused = new Set<string>();
  const coverVetoed = new Set<string>();
  // Task 76: tag-mismatch deferrals off the check (answerGate `defer`), and every item-less deferral's items (tracking).
  const tagDeferred = new Set<string>();
  const deferredItems = new Map<string, string[]>();
  const heldBy = (what: string, ids: string[]) => deferredItems.set(what, [...new Set([...(deferredItems.get(what) ?? []), ...ids.filter(inLedger)])]);
  const gateLog: { what: string; path: string; refuse: string[]; drop: string[]; partial: string[]; defer?: string[] }[] = [];
  const revealedAtGate = new Set(Object.keys(revealedValues(ledger)));
  // A verdict's parts as said (figures the items' lines state dropped, a plan name kept, as the
  // check's), each through the M6 veto — findFalseRefusals with covers: a part naming a case item
  // (any item, out or not), or reached only by a cover of an item not yet out, is not said
  // (`partial_dropped` false_refusal, credited to the part's own item). For that cover reading the
  // part's own partial items count as out: their line goes beside the part, or is out already
  // (E1: the line is the coarse answer, the part the finer cut it lacks). Each kept part carries
  // its partial items, each partial item on one part.
  const gateParts = (what: string, g: GateVerdict, path: string): { part: string; partial: string[] }[] => {
    const lines = g.refuse.flatMap(x => x.ids).flatMap(id => ledger.items.filter(i => i.id === id).map(i => i.value));
    const given = new Set<string>();
    const out: { part: string; partial: string[] }[] = [];
    for (const x of g.refuse) {
      const part = refusalPhrase(dropStatedFigures(x.part, lines), plan);
      const beside = new Set([...revealedAtGate, ...x.ids.filter(id => g.partial.includes(id))]);
      if (findFalseRefusals(`I don't have ${part}.`, state.factBase, beside, { covers: true }).length > 0) {
        plan.ctx.checks.act('partial_dropped', 'an answer-gate part a ledger item or the prompt covers: not refused', { what, item: x.ids[0] ?? null, missing: null, checked: part, why: 'false_refusal', decision: `answer_gate:${path}` });
        continue;
      }
      if (out.some(o => o.part.toLowerCase() === part.toLowerCase())) continue;
      const partial = x.ids.filter(id => g.partial.includes(id) && !given.has(id));
      for (const id of partial) given.add(id);
      out.push({ part, partial });
    }
    return out;
  };
  // A gate part as an ask of its own: item-less, released (refused, or E1's coarse form with its partial items).
  const gatePartAsk = (r: DeclaredRequest, p: { part: string; partial: string[] }): DeclaredRequest => {
    gateMade.add(p.part);
    gateRefused.add(p.part);
    if (p.partial.length > 0) coarseOf.set(p.part, [...new Set([...(coarseOf.get(p.part) ?? []), ...p.partial])]);
    return { ...r, what: p.part, itemIds: [], explicit: true, respond: 'release' };
  };
  // The tag parts to defer (Task 76 (b)), through the M6 cover reading the refused parts get (gateParts): a part naming
  // data the case holds, beyond the items given beside it, is not promised (`partial_dropped`, as before Task 76: the
  // unit left with nothing is the named deferral below).
  const gateDefers = (what: string, g: GateVerdict, path: string, given: string[]): { part: string; ids: string[] }[] => {
    const beside = new Set([...revealedAtGate, ...given]);
    return g.defer.filter(x => {
      if (findFalseRefusals(`I don't have ${x.part}.`, state.factBase, beside, { covers: true }).length === 0) return true;
      plan.ctx.checks.act('partial_dropped', 'an answer-gate part a ledger item or the prompt covers: not refused', { what, item: x.ids[0] ?? null, missing: null, checked: x.part, why: 'false_refusal', decision: `answer_gate:${path}` });
      return false;
    });
  };
  // A tag part off the check as a deferral of its own (Task 76 (b)): item-less, unchecked (turnDataChecked: the named
  // deferral, as a cover-vetoed ask), tracked with the mismatched items until it resolves (Task 76 (a)).
  const gateDeferAsk = (r: DeclaredRequest, x: { part: string; ids: string[] }): DeclaredRequest => {
    gateMade.add(x.part);
    tagDeferred.add(x.part);
    heldBy(x.part, x.ids);
    return { ...r, what: x.part, itemIds: [], explicit: true, respond: 'defer' };
  };
  if (state.factBase.answerGate) {
    // Each explicit ask a path mapped to ledger items: the model's (after request_scope and
    // request_group; the alias; covers_added), the message's detections (withAsks), a
    // code-written turn's kept detections — read once in the words it was asked in (a group
    // step's per-item asks by the ask they came from), with every item mapped to it.
    const units = new Map<string, number[]>();
    requests.forEach((r, i) => {
      if (!r.explicit || !r.itemIds.some(inLedger)) return;
      const origin = groupOrigin.get(r.what) ?? r.what;
      units.set(origin, [...(units.get(origin) ?? []), i]);
    });
    const after = new Map<number, DeclaredRequest[]>();
    const taken = new Map<number, Set<string>>();
    for (const [origin, at] of units) {
      const ids = [...new Set(at.flatMap(i => requests[i].itemIds.filter(inLedger)))];
      const g = answerGate(plan, origin, ids, sentenceFor(origin), { topics: false, ...noncheckTags() });
      if (!g) continue;
      const parts = gateParts(origin, g, 'mapped');
      const off = new Set([...g.drop, ...parts.flatMap(p => p.partial)]);
      for (const i of at) taken.set(i, off);
      const last = at[at.length - 1];
      const base = requests[at[0]];
      const left = at.some(i => requests[i].itemIds.some(id => !off.has(id)));
      const defers = gateDefers(origin, g, 'mapped', ids.filter(id => !off.has(id)));
      const extra = [...parts.map(p => gatePartAsk(base, p)), ...defers.map(x => gateDeferAsk(base, x))];
      // Nothing left to give and no part to say (every part names data the case holds): the named deferral.
      if (!left && extra.length === 0) {
        gateMade.add(origin);
        coverVetoed.add(origin);
        heldBy(origin, [...off]);
        extra.push({ ...base, what: origin, itemIds: [], respond: 'release' });
      }
      after.set(last, extra);
      gateLog.push({ what: origin, path: 'mapped', refuse: parts.map(p => p.part), drop: g.drop, partial: parts.flatMap(p => p.partial), ...(defers.length > 0 ? { defer: defers.map(x => x.part) } : {}) });
    }
    if (after.size > 0) {
      requests = requests.flatMap((r, i) => {
        const off = taken.get(i);
        const kept = off ? { ...r, itemIds: r.itemIds.filter(id => !off.has(id)) } : r;
        return [...(kept.itemIds.length > 0 || !off ? [kept] : []), ...(after.get(i) ?? [])];
      });
    }
  }
  // No refusal names data the case holds (fact checks F3, 12 Oct; batch 20:
  // "I don't have what's inside COGS", "…COGS breakdown by input — beans, …",
  // "…coffee bean … shares of COGS, today and two years ago"; batch 18: "…the
  // number of stores over the 2 years"). An explicit ask left with no item
  // would be refused out loud: read the refusal it would become, and map the
  // ask to the held items it names — released, restated, or held by the gate
  // like any other ask. What it names finer than the case (per pound, by
  // store, today's share) still gets the refusal.
  const fb = state.factBase;
  const revealedNow = new Set(Object.keys(revealedValues(ledger)));
  const remapped: { what: string; ids: string[] }[] = [];
  // Lorenzo, 13 Oct (Larkspur rulings a): then whether a ledger item or the
  // prompt covers the ask — the case's `covers` phrases (coverageOf): a
  // covering item is given like any other ask (restated when out), a prompt
  // fact restated, and only what nothing covers is refused (Raj 55d12d38 t7
  // same-store → the store count; Omar 9bbf41bc t9 aircraft size → the
  // competitor line, the frequency still refused; Maya b0b28d36 t8 net margin).
  const covered: { what: string; ids: string[]; promptFacts: string[]; rest: string | null; coarse?: { what: string; ids: string[] }[] }[] = [];
  const promptRestates: { id: string; value: string; request: DeclaredRequest }[] = [];
  // The tag gate (round 6 Task 68; Lorenzo, 21 Oct: "A cover match vetoes a refusal. It
  // may release the matched item only if the item's tags (company; forecast vs current;
  // quantity) also agree with the ask. Otherwise defer, through the existing E5 stop
  // sequence."). On a tagged case a covered item goes out only through the tag gate
  // (coverGateMiss); a coarse item only when tagsAgree passes. An ask whose every cover
  // match fails gets the named deferral in its words, holding no item, without the check
  // (fix round 1, controller ruling, 21 Oct: "no added model calls" outranks the reading
  // of "through the existing E5 stop sequence"; turnDataChecked, `cover_deferred`) — so
  // does a list entry left only with hits on another company's items (fact-check.ts
  // coverageDetail `dropped`, entity). One left only with hits across a geography is
  // refused, unchecked (audit row 20: "I don't have Kelvexa's European net price").
  // A failing match beside one that passes is dropped (logged): the rest answers the ask.
  const regionRefused = new Set<string>();
  const coverGate: { what: string; deferred?: { id: string; why: 'entity' | 'forecast' | 'scope'; rule?: ScopeRule | null }[]; kept?: string[]; named?: string[]; coarse?: { what: string; ids: string[] }[]; excluded?: { what: string; why: 'entity' | 'region' }[] }[] = [];
  // X1 (Task 71): the cut of an ask whose covers missed only on scope, after the pressure test — refused unchecked.
  const scopeVetoed = new Set<string>();
  requests = requests.flatMap(r => {
    // Declared release or defer alike: after the pressure test a deferral becomes a release (below).
    if (!r.explicit || r.itemIds.length > 0 || gateMade.has(r.what)) return [r];
    let ids = [...new Set(findFalseRefusals(`I don't have ${r.what}.`, fb, revealedNow).flatMap(f => f.items))]
      .filter(id => ledger.items.some(i => i.id === id));
    if (ids.length === 0) {
      const cov = coverageDetail(r.what, fb, { sentence: sentenceFor(r.what) });
      let covIds = cov.items.filter(id => ledger.items.some(i => i.id === id));
      // An entry a cover reaches only at a coarser cut (a count of a figure-less
      // item; round 5 Task 50, fact-check.ts COUNT_ASK): its own item-less ask,
      // given its coarse items E1's way below — the line and "I don't have <entry>.".
      let coarse = cov.coarse.map(c => ({ what: c.what, ids: c.ids.filter(id => ledger.items.some(i => i.id === id)) })).filter(c => c.ids.length > 0);
      if (fb.answerGate) {
        const sentence = sentenceFor(r.what);
        const why = (id: string, scope: boolean) => coverGateMiss(plan, r.what, id, sentence, scope);
        // Review F6: a scope miss logs which rule fired ("log which scope rule fired"), as request_scope does.
        const scopeRuleOf = (id: string) => { const item = ledger.items.find(i => i.id === id); return item ? scopeRule(coverEntry(r.what, id, fb), item, namesOf(id), { count: false, spans: coverSpans(coverEntry(r.what, id, fb), fb, id) }) : null; };
        const deferred = [...covIds.map(id => ({ id, why: why(id, true) })), ...coarse.flatMap(c => c.ids).map(id => ({ id, why: why(id, false) }))]
          .flatMap(x => (x.why ? [{ id: x.id, why: x.why, ...(x.why === 'scope' ? { rule: scopeRuleOf(x.id) } : {}) }] : []));
        if (deferred.length > 0) {
          const out = new Set(deferred.map(x => x.id));
          covIds = covIds.filter(id => !out.has(id));
          coarse = coarse.map(c => ({ what: c.what, ids: c.ids.filter(id => !out.has(id)) })).filter(c => c.ids.length > 0);
          const kept = [...covIds, ...coarse.flatMap(c => c.ids), ...cov.promptFacts];
          coverGate.push({ what: r.what, deferred, ...(kept.length > 0 ? { kept } : {}) });
          // Task 70 fix round 2 (68b item 2; E5 d; b34 Aldermoor Jasmine t2 "current treatment breakdown by
          // drug class", before the pressure test): items whose covers only miss on scope answer coarsely; held
          // before the pressure test, the deferral names them and books them ("I'll come back to the current US
          // treatment"), never the finer cut the case doesn't hold.
          const scopeOnly = deferred.every(x => x.why === 'scope') && deferred.every(x => !coarse.some(c => c.ids.includes(x.id)));
          if (kept.length === 0 && scopeOnly && !satisfied) {
            const held = [...new Set(deferred.map(x => x.id))];
            coverGate.at(-1)!.named = held;
            // What nothing covers goes on as at BASE (the item-less path).
            return [...held.map(id => labelAsk(r, id, { respond: 'defer' })),
              ...(cov.plain ? [{ ...r, what: cov.plain, itemIds: [] as string[] }] : [])];
          }
          // Satisfied (round 6 Task 71, controller ruling X1, 21 Oct): E1's form, not the hollow named
          // deferral — each item's line and "I don't have <the cut>." for the list entry its cover sits in,
          // the refusal unchecked (it joins the scope refusals, never the check). An item out already: the
          // refusal alone (4b); one held by the release order or the cap: the refusal alone too. A change
          // item asked for a split is a sibling, never a coarse item (E1's ruling): its entry refused alone.
          if (kept.length === 0 && scopeOnly) {
            const byEntry = new Map<string, string[]>();
            for (const id of new Set(deferred.map(x => x.id))) {
              const entry = coverEntry(r.what, id, fb).trim();
              const coarse = !changeForSplit(entry, ledger.items.find(i => i.id === id)!);
              byEntry.set(entry, [...(byEntry.get(entry) ?? []), ...(coarse ? [id] : [])]);
            }
            coverGate.at(-1)!.coarse = [...byEntry].map(([what, ids]) => ({ what, ids }));
            for (const [entry, ids] of byEntry) {
              if (ids.length > 0) coarseOf.set(entry, [...new Set([...(coarseOf.get(entry) ?? []), ...ids])]);
              scopeVetoed.add(entry);
            }
            return [...[...byEntry.keys()].map(entry => ({ ...r, what: entry, itemIds: [] as string[], respond: 'release' as const })),
              ...(cov.plain ? [{ ...r, what: cov.plain, itemIds: [] as string[] }] : [])];
          }
          if (kept.length === 0) { coverVetoed.add(r.what); heldBy(r.what, deferred.map(x => x.id)); return [r]; }
        }
      }
      // The answer gate on the covered items (Task 70; R1): the covers decide the topic and
      // coverGateMiss the tags, so a period or scope a covered line doesn't state — the item
      // E1's coarse form, its part refused beside it, unchecked.
      const gateAsks: DeclaredRequest[] = [];
      const g = covIds.length > 0 ? answerGate(plan, r.what, covIds, sentenceFor(r.what), { topics: false, tags: false }) : null;
      if (g) {
        const parts = gateParts(r.what, g, 'covered');
        const off = new Set(parts.flatMap(p => p.partial));
        covIds = covIds.filter(id => !off.has(id));
        gateAsks.push(...parts.map(p => gatePartAsk(r, p)));
        gateLog.push({ what: r.what, path: 'covered', refuse: parts.map(p => p.part), drop: [], partial: [...off] });
      }
      const excluded = cov.dropped;
      if (covIds.length === 0 && cov.promptFacts.length === 0 && coarse.length === 0 && excluded.length === 0 && gateAsks.length === 0) return [r];
      if (excluded.length > 0) {
        coverGate.push({ what: r.what, excluded });
        for (const x of excluded) {
          (x.why === 'entity' ? coverVetoed : regionRefused).add(x.what);
          if (x.why === 'entity') heldBy(x.what, x.ids);
        }
      }
      const rest = cov.plain;
      for (const c of coarse) coarseOf.set(c.what, [...new Set([...(coarseOf.get(c.what) ?? []), ...c.ids])]);
      if (covIds.length + cov.promptFacts.length + coarse.length > 0) covered.push({ what: r.what, ids: covIds, promptFacts: cov.promptFacts, rest, ...(coarse.length > 0 ? { coarse } : {}) });
      for (const id of cov.promptFacts) {
        const value = fb.covers.find(c => c.id === id)?.say;
        if (value && !promptRestates.some(p => p.id === id)) promptRestates.push({ id, value, request: r });
      }
      // What nothing covers of an ask a scope rule emptied is still that ask's finer cut.
      if (rest && coarseOf.has(r.what)) coarseOf.set(rest, coarseOf.get(r.what)!);
      if (rest && siblingsOnly.has(r.what)) siblingsOnly.add(rest);
      return [
        ...covIds.map(id => labelAsk(r, id)),
        ...coarse.map(c => ({ ...r, what: c.what, itemIds: [] as string[] })),
        ...(rest ? [{ ...r, what: rest, itemIds: [] as string[] }] : []),
        // An excluded entry: the named deferral (entity) or the refusal (region), both unchecked.
        ...excluded.map(x => ({ ...r, what: x.what, itemIds: [] as string[], ...(x.why === 'region' ? { respond: 'release' as const } : {}) })),
        ...gateAsks,
      ];
    }
    // The answer gate on the names remap (Task 70; R2): the names decide the topic; the tags and
    // a period or scope are read. Nothing left and no part to say: the named deferral, unchecked.
    const g = answerGate(plan, r.what, ids, sentenceFor(r.what), { topics: false, ...noncheckTags() });
    const gateAsks: DeclaredRequest[] = [];
    if (g) {
      const parts = gateParts(r.what, g, 'remapped');
      const off = new Set([...g.drop, ...parts.flatMap(p => p.partial)]);
      ids = ids.filter(id => !off.has(id));
      const defers = gateDefers(r.what, g, 'remapped', ids);
      gateAsks.push(...parts.map(p => gatePartAsk(r, p)), ...defers.map(x => gateDeferAsk(r, x)));
      gateLog.push({ what: r.what, path: 'remapped', refuse: parts.map(p => p.part), drop: g.drop, partial: parts.flatMap(p => p.partial), ...(defers.length > 0 ? { defer: defers.map(x => x.part) } : {}) });
      if (ids.length === 0 && gateAsks.length === 0) { coverVetoed.add(r.what); heldBy(r.what, [...off]); return [r]; }
    }
    if (ids.length === 0) return gateAsks;
    remapped.push({ what: r.what, ids });
    // One ask per item, in its own label — a deferral must not promise the
    // finer cut the case doesn't hold ("bean cost per pound").
    return [...ids.map(id => labelAsk(r, id)), ...gateAsks];
  });
  if (gateLog.length > 0) plan.ctx.checks.act('answer_gate', 'an ask whose mapped items don\'t answer a part of it: those items not given, the part refused unchecked (a period or scope unmet: E1\'s form)', { asks: gateLog });
  if (coverGate.length > 0) plan.ctx.checks.act('cover_gate', 'a cover match whose item\'s tags or scope disagree with the ask: not given; an ask left with none goes to the check, and its "none" is the named deferral', { asks: coverGate });
  if (covered.length > 0) plan.ctx.checks.act('refusal_covered', 'an ask code would have refused is covered by a ledger item or the prompt', { covered });
  if (remapped.length > 0) plan.ctx.checks.act('refusal_remapped', 'an ask code would have refused names data the case holds — mapped to it', { remapped });
  // After the pressure test, nothing is premature: a declared deferral is
  // released (or refused, when the case doesn't hold the data).
  if (satisfied) requests = requests.map(r => (r.respond === 'defer' ? { ...r, respond: 'release' as const } : r));
  // The check's decisions (decideCheckedAsk; round 5 E5): an item-less ask the
  // check mapped is answered like an ask the model mapped, through every gate
  // below — `items` one ask per item in its own label (so a deferral names the
  // item, and its row books the ledger id), `coarse` through E1's coarse step with
  // the check's out-of-scope items. A checked ask is released, not deferred: the
  // model's deferral held nothing. Either way it is decided here: an ask still
  // item-less after it is refused, never checked again.
  const checkedAsks = new Set<string>();
  // A partial answer's refusal (E5 partial): the asked part the coarse item lacks, said for the ask.
  const missingOf = new Map<string, string[]>();
  if (checked) {
    const applied: { what: string; kind: string; ids: string[]; missing?: string | string[] }[] = [];
    requests = requests.flatMap(r => {
      const c = r.explicit && r.itemIds.length === 0 ? checked.get(r.what) : undefined;
      if (!c || c.kind === 'named') return [r];
      checkedAsks.add(r.what);
      applied.push({ what: r.what, kind: c.kind, ids: c.kind === 'refuse' ? [] : c.ids, ...(c.missing !== undefined ? { missing: c.missing } : {}) });
      if (c.kind === 'refuse') {
        // Refused by the answer gate's parts (Task 70): said unchecked, as the partial parts are.
        if (c.missing !== undefined) missingOf.set(r.what, c.missing);
        return [{ ...r, respond: 'release' as const }];
      }
      if (c.kind === 'coarse') {
        coarseOf.set(r.what, c.ids);
        if (c.missing !== undefined) missingOf.set(r.what, c.missing);
        return [{ ...r, respond: 'release' as const }];
      }
      // A mixed verdict's partial parts: refused beside the items, never checked again.
      for (const m of c.missing ?? []) checkedAsks.add(m);
      return [
        ...c.ids.map(id => labelAsk(r, id, { respond: 'release' })),
        ...(c.missing ?? []).map(m => ({ ...r, itemIds: [] as string[], what: m, respond: 'release' as const })),
      ];
    });
    if (applied.length > 0) plan.ctx.checks.act('checked_ask', 'the check\'s mapping of an unmatched ask, decided by code', { asks: applied });
  }
  // An explicit release a scope rule emptied gets back its coarse items not yet
  // revealed (E1): released under every gate below and in decideData, the finer
  // cut refused beside them. One whose coarse items are all out already (said, or
  // on a shown exhibit) is refused alone, unchecked: the answer is in front of the
  // candidate (controller ruling on E1, 20 Oct: Lorenzo's 13 Oct 4b stands — "As I
  // mentioned" only for a re-ask of the same item; Marcus 71a04add t12, batch 18
  // Tyler t19). A declared deferral stays item-less: the check decides it.
  const coarseAsks = new Set<DeclaredRequest>();
  const alreadyOut: { what: string; ids: string[] }[] = [];
  requests = requests.map(r => {
    const all = r.explicit && r.respond === 'release' && r.itemIds.length === 0 ? coarseOf.get(r.what) : undefined;
    if (!all) return r;
    const ids = all.filter(id => canReveal(ledger, id));
    if (ids.length === 0) {
      if (all.every(id => ledger.revealed.has(id))) alreadyOut.push({ what: r.what, ids: all });
      return r;
    }
    const back = { ...r, itemIds: ids };
    coarseAsks.add(back);
    return back;
  });
  // Before it, the part of a release that needs it is held; the rest
  // (scoping facts) goes out. Every held ask is answered out loud with the
  // reason, repeats too (v3 — v2 held a repeat silently: Destiny asked eight
  // times and heard nothing).
  if (gateOn) {
    requests = requests.flatMap(r => {
      if (r.respond !== 'release') return [r];
      // Data already given is never held again: a re-ask restates it (data-decisions.ts).
      const held = r.itemIds.filter(id => gated(id) && !ledger.revealed.has(id));
      if (held.length === 0) return [r];
      // A coarse item the gate holds is not given: what's left of the ask (all of
      // it, when nothing is) goes the way of any item-less ask — the check (E1).
      if (coarseAsks.has(r)) {
        const back = { ...r, itemIds: r.itemIds.filter(id => !held.includes(id)) };
        coarseAsks.add(back);
        return [back];
      }
      gatedIds.push(...held);
      gateHeld.add(r.what);
      const free = r.itemIds.filter(id => !held.includes(id));
      return [
        ...(free.length ? [{ ...r, itemIds: free }] : []),
        { ...r, itemIds: held, respond: 'defer' as const },
      ];
    });
  }

  const revealed = new Set(Object.keys(revealedValues(ledger)));
  if (forcesOpen) {
    const declared = new Set(requests.flatMap(r => r.itemIds));
    for (const id of planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex })) {
      if (declared.has(id) || waiting(id)) continue;
      const open = state.openDataRequests.find(o => o.ledgerItemId === id)!;
      requests.push({ what: open.what, itemIds: [id], explicit: true, respond: 'release' });
    }
  } else {
    // Fulfilment: once the pressure test is satisfied — and on a turn whose
    // model missed an explicit ask twice — pending requests go out up to
    // what's left of the cap, through the gate, with no new promises.
    const missedTwice = state.requestGuardRegenerated && turn.requests.length === 0;
    if (satisfied || missedTwice) {
      const declared = new Set(requests.flatMap(r => r.itemIds));
      const releasing = requests.filter(r => r.explicit && r.respond === 'release')
        .flatMap(r => r.itemIds).filter(id => ledger.items.some(i => i.id === id) && !revealed.has(id)).length;
      const room = Math.max(0, RELEASE_CAP - releasing);
      const pending = planForcedReleases(state.openDataRequests, revealed, { currentTurnIndex: ctx.nextTurnIndex, cap: Infinity })
        .filter(id => !declared.has(id) && !(gateOn && gated(id)) && !waiting(id));
      // Over the cap: deferred out loud, released on a later turn (v3).
      pending.forEach((id, i) => {
        const open = state.openDataRequests.find(o => o.ledgerItemId === id)!;
        requests.push({ what: open.what, itemIds: [id], explicit: true, respond: i < room ? 'release' : 'defer' });
      });
    }
  }

  const modelExhibit = turn.exhibit ? resolve(turn.exhibit) : null;
  const decide = (requests: DeclaredRequest[]) => decideData({
    requests,
    candidateText: ctx.candidateText,
    exhibit: modelExhibit && !(gateOn && gated(modelExhibit)) ? modelExhibit : null,
    rescueItem: turn.rescueItem ? resolve(turn.rescueItem) : null,
    rung3: Boolean(state.stallDecision.intervene && state.stallDecision.rung === 3),
    ledger,
    exhibits,
    shownExhibitIds: state.shownExhibitIds,
    stagesOut: state.stagesOut,
    open: state.openDataRequests,
    gateHeld,
    // The release cap never splits a group the candidate asked for (Lorenzo, 15
    // Oct; batch 25 Jasmine f4fcab5b t5, Owen d3db78c0 t5: the menu prices took a
    // slot and the third COGS item was deferred).
    groups: askedGroups,
    wrapUp: wrapUpTurn(plan),
    // A tagged case's offer gate (round 6 Task 71, audit row 16): two label words or the spoken name.
    ...(state.factBase.answerGate ? { need: { caseNames: properNames(state.caseData.sttKeyterms) } } : {}),
  });
  let decisions = decide(requests);
  // E1 (Lorenzo, 20 Oct): a coarse item goes out when it is released or shown
  // on the exhibit handed over this turn. Those that
  // don't (not in the ledger, waiting on the release order, over the cap) are
  // taken off the ask — no deferral is said for data the ask didn't name — and
  // the turn decided again: an ask left with none goes to the check below.
  // Once is enough: narrowing only removes ids that went nowhere, so it frees no
  // release slot they held, can't change the exhibit chosen (an id it covers went
  // out, so it stays), and restates nothing new — every id left goes out again.
  const wentOut = (id: string) => decisions.releases.some(x => x.id === id)
    || decisions.exhibit?.id === id || Boolean(decisions.exhibit?.covers.includes(id));
  if ([...coarseAsks].some(r => requests.includes(r) && !r.itemIds.every(wentOut))) {
    requests = requests.map(r => {
      if (!coarseAsks.has(r) || r.itemIds.every(wentOut)) return r;
      const back = { ...r, itemIds: r.itemIds.filter(wentOut) };
      coarseAsks.add(back);
      return back;
    });
    decisions = decide(requests);
  }
  // Each coarse ask still holding an item that went out: the item's line, and
  // "I don't have <the ask>." for the finer cut, refused beside it (logged
  // `scope_coarse`; its own refuse row after the release row). So is a finer ask
  // whose exhibit is handed over.
  const scopeCoarse: { what: string; ids: string[] }[] = [];
  for (const r of requests) {
    if (coarseAsks.has(r) && r.itemIds.length > 0 && r.itemIds.some(wentOut)) scopeCoarse.push({ what: r.what, ids: r.itemIds });
  }
  for (const [what, ids] of exhibitBacked) {
    if (!decisions.refusals.includes(what)) continue;
    if (ids.some(wentOut)) scopeCoarse.push({ what, ids });
    // Its exhibit already on screen: the refusal alone, like an ask whose coarse items are all out.
    else if (ids.every(id => state.shownExhibitIds.has(id))) alreadyOut.push({ what, ids });
  }
  const outAlready = alreadyOut.filter(x => decisions.refusals.includes(x.what));
  if (outAlready.length > 0) plan.ctx.checks.act('scope_coarse', 'an ask a scope rule emptied whose coarse items are already out: the finer cut refused alone, unchecked', { alreadyOut: outAlready });
  const scopeRefused = new Set([...scopeCoarse.map(x => x.what), ...outAlready.map(x => x.what), ...siblingsOnly, ...scopeVetoed]);
  if (scopeCoarse.length > 0) {
    const firstAt = (w: string) => requests.findIndex(r => r.what === w);
    // Only the coarse asks' own finer cuts join the refusals: an ask emptied of
    // siblings that the coverage step remapped to held items is not refused (it
    // would contradict its own release or deferral).
    const coarseWhats = new Set(scopeCoarse.map(x => x.what));
    // Lorenzo's pre-wave ruling 1 (26 Oct), behind `coarseNoRefusal`: an ask whose coarse items go out on THIS
    // turn is not also refused in the same breath. b34a Jasmine 4e89a7cc t4 releases `current_treatment` ("the
    // main option in the US today is Nimbrel") and says, in the same data line, "I don't have current US
    // treatment breakdown by drug class" — the case holds that quantity, coarsely, and had just given it. His
    // refined rule 1 (20 Oct) grades that a serious false refusal. Off, the finer cut is refused beside the
    // coarse item (the controller's 20 Oct E1 ruling, today's behaviour). An ask whose coarse items are ALL out
    // already is unaffected: `outAlready` is the other branch, and its refusal is the only word on it.
    // Cost if wrong: the finer cut gets no word of its own, only the coarse line — a silent non-answer where
    // there used to be a false statement. `scope_coarse` records which it was.
    // Only the split-of-item asks (`splitCoarse`): a cover-mapped coarse item is another quantity, and an
    // exhibit-backed finer ask has only the exhibit — both are refused as before. Measured on the bank: the
    // unnarrowed rule cost one correct record (b36a Jasmine t4's true refusal of the treated-population trend,
    // exhibit-backed) and three fault records whose refusal is the right behaviour (b36a Tyler t6, b37h Tyler
    // t6, b35q Raj t12, all cover-mapped).
    const withheld = [...coarseWhats].filter(w => splitCoarse.has(w));
    const noRefusal = withheld.length > 0 && switchOn(state.caseData, 'coarseNoRefusal');
    if (!noRefusal) {
      decisions.refusals = [...new Set([...decisions.refusals, ...coarseWhats])].sort((a, b) => firstAt(a) - firstAt(b));
      decisions.requests = decisions.requests.flatMap(d => (coarseAsks.has(d.request) && coarseWhats.has(d.request.what) && d.ledgerItemIds.length > 0
        ? [d, { request: { ...d.request, itemIds: [] }, response: 'refuse' as const, ledgerItemIds: [] }] : [d]));
    } else {
      const keep = new Set(withheld);
      decisions.refusals = [...new Set([...decisions.refusals, ...[...coarseWhats].filter(w => !keep.has(w))])].sort((a, b) => firstAt(a) - firstAt(b));
      decisions.requests = decisions.requests.flatMap(d => (coarseAsks.has(d.request) && coarseWhats.has(d.request.what) && !keep.has(d.request.what) && d.ledgerItemIds.length > 0
        ? [d, { request: { ...d.request, itemIds: [] }, response: 'refuse' as const, ledgerItemIds: [] }] : [d]));
      decisions.refusals = decisions.refusals.filter(w => !keep.has(w));
    }
    plan.ctx.checks.act('scope_coarse', noRefusal
      ? 'an ask a scope rule emptied keeps its coarse items: given, and the split it asked for NOT refused beside them (coarseNoRefusal)'
      : 'an ask a scope rule emptied keeps its coarse items: given, and the finer cut refused beside them', { asks: scopeCoarse, ...(noRefusal ? { refusalWithheld: withheld } : {}) });
  }
  // Lorenzo, 19 Oct (R1, "don't add code-spoken refusals without the check";
  // round-2 ruling 2, every unmatched ask): an item-less ask code would refuse
  // goes through the same check as an item-less deferral (turnDataChecked)
  // instead of being refused at once: decided by its verdict (decideCheckedAsk).
  // That includes an ask the model mapped to an item and the BASIS rule emptied
  // (Larkspur Marisol t27; a mapping back to the items the rule cut is out of the
  // ask's scope: E1's form since round 5 E5 b). An ask the check already decided
  // (`checkedAsks`) is not checked again: still item-less, it is refused. An
  // ask the finer-cut scope rules emptied is refused unchecked only beside its
  // coarse item, or when its coarse items are all out already (E1, `scope_coarse`,
  // above); one whose coarse items are held is checked like the rest (round 5
  // reverses the round-2 exception).
  // A geography-excluded entry's refusal is unchecked (round 6 Task 68, fix round 1).
  // An answer-gate part is said unchecked too (round 6 Task 70: no model call BASE didn't make).
  const toCheck = decisions.refusals.filter(w => !scopeRefused.has(w) && !checkedAsks.has(w) && !regionRefused.has(w) && !gateRefused.has(w));
  if (toCheck.length > 0) {
    const checking = new Set(toCheck);
    decisions.unmatchedDefers.push(...toCheck);
    decisions.refusals = decisions.refusals.filter(w => !checking.has(w));
    decisions.requests = decisions.requests.map(d => (d.response === 'refuse' && checking.has(d.request.what) ? { ...d, response: 'defer' as const } : d));
  }
  // A partial answer's refusal says the part the item lacks (E5 partial; the
  // decision row keeps the ask's words): beside the item's line, or alone when the
  // item is out already or held.
  if (missingOf.size > 0) decisions.refusals = [...new Set(decisions.refusals.flatMap(w => missingOf.get(w) ?? [w]))];
  // Code's correction of a misquote (plan-turn.ts), on any turn that answers
  // the message — a code-written close or recommendation ask included (batch 20:
  // R21 and R47's corrections were decided at the close and never spoken).
  const correction = state.misquote ? { item: state.misquote.item, items: state.misquote.items, text: state.misquote.text } : null;
  // Phase 1 4.1: the restatement rules on the ledger items said again (restateRules, below).
  const restating = switchOn(state.caseData, 'restateRules');
  if (restating && decisions.restates.length > 0) restateRules(plan, decisions, groupOrigin, asking);
  // A prompt fact that covers an ask is said again ("As I mentioned: …"); nothing is booked.
  // 4.1: not one said within the last four turns — it is in the prompt too, so it is left out, not named.
  for (const p of promptRestates) {
    if (restating && !FIGURE_ASK.test(p.request.what) && !SPLIT_ASK.test(p.request.what) && saidRecently(plan, [p.value])) {
      plan.ctx.checks.act('restate_rules', 'a prompt fact said within the last four turns: not said again', { recent: [p.id] });
      continue;
    }
    decisions.restates.push({ id: p.id, value: p.value });
    decisions.requests.push({ request: p.request, response: 'clarify', ledgerItemIds: [] });
  }
  // Proper adjectives and names keep their capital in a line (Task 70 fix round 2, 68b item 3; tagged cases only).
  const properWords = fb.answerGate ? [...PROPER_ADJECTIVES, ...properNames(state.caseData.sttKeyterms)] : undefined;
  // Must-reach items due at this turn's exhibit or code's recommendation ask (round 6 Task 72): first in the line.
  const mustNow = mustReachItems(plan, { exhibit: decisions.exhibit?.id ?? null, recommendation: MUST_REACH_REC_KINDS.has(state.kind) }, decisions);
  if (mustNow.length > 0) decisions.releases = [...decisions.releases, ...mustNow];
  return { ...decisions, correction, gatedIds, ...(basisEmptied.size > 0 ? { basisCut } : {}), ...(coverVetoed.size > 0 ? { coverDeferred: [...coverVetoed] } : {}),
    ...(tagDeferred.size > 0 ? { tagDeferred: [...tagDeferred] } : {}), ...(deferredItems.size > 0 ? { deferredItems: Object.fromEntries(deferredItems) } : {}), ...(properWords ? { properWords } : {}),
    ...(askOrigin.size + groupOrigin.size > 0 && switchOn(state.caseData, 'modelDeferrals') ? { askOrigin: Object.fromEntries([...groupOrigin, ...askOrigin]) } : {}) };
}
