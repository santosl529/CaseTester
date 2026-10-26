// The one data decision (Phase 2 design §2, docs/superpowers/plans/2026-10-27-phase2-design.md), built in shadow
// (step S1, `askDecisionShadow`): for every sub-ask of the candidate's message — one thing asked, from their own
// asking sentences split at conjuncts, with the model's declarations and the classifier's detections aligned to it —
// one outcome: release, true refusal, defer, or point (already out). Settle logs it beside what today's paths decided
// (`ask_decision_shadow`); nothing here is spoken, booked or written to the flags.
//
// Rules, in priority order (design §2.4, with Lorenzo's 27 Oct rulings):
//   R1 already given this turn — a candidate item another sub-ask releases answers this one too;
//   R2 a model-named item that matches is kept — the line test (the candidate's words share a key noun with the item's
//      own words, or a cover hits) and not a sibling quantity; a scope rule that only says it is coarser keeps it and
//      refuses the cut beside it (E1). A tag mismatch is logged and the item still released (Q3: log only);
//   R3 a Haiku positive that passes the tag gate — `partial` with its missing part as the cut; a CLEAR tag mismatch
//      on every Haiku item, with nothing else matching, is R6's evidence (session-1 ruling 2); an uncertain one defers;
//   R4 a deterministic match (covers, names, detections, the case's groups) that passes the tag gate;
//   R5 already out — point (S1 decides point vs not; which form — the exhibit's summary, the line when the figure is
//      asked, the name when said recently — is 4.1's restateRules today and is ported in S6);
//   R6 a true refusal, only when nothing matches: the check said none or the model's own sentence refuses it, the
//      false-refusal veto (M6) passes and nothing given this turn states it; never on an undeclared sub-ask (Q1: the
//      check there may release or defer, never refuse). Logged both with and without 4.4's head-noun test (Q2);
//   R7 otherwise defer (`uncertain`).
// Then the gates on a release: the pressure test, the release order, the cap of 3. Offers are gone (Q4).
// Pure apart from awaiting the turn's cached check verdicts (plan.state.deferChecks): no model call is made — a
// sub-ask a check would be needed for and today's code never checked is marked `wouldCheck` (Q1's extra calls).
import type { DeclaredRequest } from '@/lib/agent/models/turn-schema';
import type { ModelPlan } from './plan-turn';
import type { DetectedDataRequest } from './data-requests';
import { caseResolver, messageAskSentences, ptGateOn, wrapUpTurn, headNoun, answerGate, type CheckVerdict, type TurnData } from './turn-data';
import { keyNouns, scopeRule, changeForSplit, heldForOrder, RELEASE_CAP } from './data-decisions';
import { coverageDetail, findFalseRefusals, groupItemsAsked } from './fact-check';
import { addressedAskSentences, properNames } from './request-signal';
import { askClauses, askGroups, askTags, itemTagsAgree, tagsAgree } from './item-tags';
import { statesAsked } from './ask-qualifiers';
import { isGatedItem } from './pressure-test';
import { switchOn } from '@/lib/cases/engine-switches';

export type Outcome = 'release' | 'refuse' | 'defer' | 'point' | 'none';
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
export type DeferWhy = 'gate' | 'order' | 'cap' | 'uncertain';
export type SubAsk = {
  words: string;
  sentence: string | null;
  source: 'candidate' | 'model' | 'detection';
  /** The model declared it explicitly, or the classifier detected it (Q1: only these may be refused). */
  declared: boolean;
  modelIds: string[];
  modelWhats: string[];
  detectionIds: string[];
  detectionWhats: string[];
};
export type AskDecided = {
  words: string;
  /** The declared words aligned to it (the model's, the classifier's): what code's line would say. */
  whats: string[];
  sentence: string | null;
  source: SubAsk['source'];
  declared: boolean;
  outcome: Outcome;
  rule: RuleId;
  items: string[];
  /** E1: the finer part refused beside a coarse release. */
  cut?: string;
  why?: DeferWhy;
  /** On a wrap-up turn a deferral is "We won't get to …". */
  wont?: true;
  /** R6 with 4.4's head-noun test (Q2): the outcome had it been applied. */
  withHead?: Outcome;
  /** Q3: model-named items released though their tags disagree with the ask. */
  tagMismatch?: string[];
  /** R2's line test failed on these model items, kept for want of a contradiction (logged). */
  lineFail?: string[];
  /** Q1: the check would be called here — no verdict cached for it. */
  wouldCheck?: true;
  /** What today's paths decided for this sub-ask, and whether the two agree. */
  old: Outcome | 'offer';
  oldItems: string[];
  agree: boolean;
};
// `volunteered`: what today's code gives unasked this turn — must-reach, fulfilment of earlier asks — which the design
// keeps outside the sub-asks (§2.4), carried over as decided.
export type ShadowDecision = { asks: AskDecided[]; volunteered: string[]; offersDropped: string[]; sentences: string[] };

// A clause asking for a split stays one sub-ask ("the split of revenue decline between passengers and average fare");
// "FY2023 versus FY2025" is a period comparison, not a split.
const SPLIT_LIKE = /\b(?:split|splits|breakdown|broken (?:down|out)|mix|composition)\b|\bbetween\b[^,;?]*\band\b|\b(?:versus|vs\.?)\s+(?!(?:FY)?\s?\d)/i;
// The model's own refusal ("I don't have a repeat rate for sampled households.").
const MODEL_REFUSES = /\b(?:I don't have|I do not have|I don’t have|not something (?:I|we) have|we don't have|I have no)\b/i;
// The ask's opener ("Do we have data on …", "Can you remind me of …", "how has …") is not its head noun.
const ASK_OPENER = /^(?:(?:can|could|would|will|do|does|did|is|are)\s+(?:you|we|i)\s+(?:please\s+)?(?:have|get|see|share|give(?:\s+me)?|know|remind me(?:\s+of)?|tell me(?:\s+about)?|pull|look at)\b\s*|(?:any\s+)?(?:data|information|figures?|numbers?)\s+(?:on|about|for)\s+|(?:a\s+sense\s+of|anything\s+on)\s+)+/i;
const askHead = (words: string, caseNames: string[]) => headNoun(words.replace(ASK_OPENER, '').replace(ASK_OPENER, ''), caseNames);
const sentencesOf = (s: string) => s.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const normWords = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

// A frame before the ask ("To start, could I get …", "What I'd want to confirm: …", "One thing I'd want: …") is no
// sub-ask; nor is a purpose or contrast clause after it ("… to see whether the discounting is concentrated", "not an
// assumption"). Words that only frame an ask carry no key noun of a quantity.
const FRAME_LEAD = /^(?:(?:so|and|also|then|ok(?:ay)?|yes|great|first|second|third|next|finally|to start|to begin|plus)\b[,:]?\s*)+|^(?:(?:what\s+)?i'?d\s+(?:want|need|like|confirm|check|ask)(?:\s+to\s+(?:know|see|confirm|understand|check))?(?:\s+(?:on|is)\b[^:—]{0,40}[:—–-])?|one thing(?: i'?d want| that would help me[^:—]{0,40})?\s*[:—–-]|(?:yes,?\s+)?please share those\s*[:—–-]|can we start with[^—:]{0,40}[:—–-])\s*/i;
const PURPOSE = /^(?:to (?:see|confirm|check|test|understand|know|figure|size|build|find|identify|tell)|(?:i'?d|i will|i'?ll|i would)\s+(?:check|look|test|expect|assume|then)|so (?:i|we) can|(?:i|we) can (?:see|tell|check|judge)|so that|since|because|but|not (?:an?|the|just)\b|or equivalently|to start|to begin)\b/i;
const FRAME_NOUNS = new Set(['start', 'begin', 'confirm', 'assumption', 'bucket', 'thing', 'help', 'build']);
const asked = (t: string) => [...keyNouns(t)].some(n => !FRAME_NOUNS.has(n));

// Splitter v2 (Lorenzo, 27 Oct, session-1 ruling 1: ≥90% real asks on a labelled sample before an undeclared sub-ask
// may speak; evals/splitter/). Only a sentence that asks for data yields sub-asks — a question to the interviewer or a
// stated want of data — not a list item carried on from one ("Third, external factors: …"), a self-question ("Is it
// input prices … or volume?", "Should I dig into …", "Can I start with the revenue side?") or a question about the
// interviewer's own working. A purpose or condition tail is cut first ("…, so I can model …", "— if beans are the
// issue, …"). A list item that only qualifies its neighbour ("versus walk-up", "after January 2025", "separate from
// the $80M annual", "at what fare") or names only an entity ("Port Avery") stays with it; "10,000" is one number.
const ASKS_DATA = /\?|\b(?:i'?d|i would)\s+(?:also\s+)?(?:want|need|like)\b|\b(?:can|could)\s+(?:i|we)\s+(?:get|see|have)\b|\bdo we (?:have|know)\b|\bplease share\b|\bwhat i'?d want\b|\bone thing i'?d\b/i;
const SELF_QUESTION = /^(?:(?:so|and|but|ok(?:ay)?|first|second|third|next)[,:]?\s+)?(?:what i (?:was|am|'?m|did)\b|what i'?d (?:test|check|do|try)\b|what'?s missing\b|is (?:it|this|that)|are (?:we|they)|should (?:i|we)|can i (?:start|ask|go|begin)|could you (?:tell|walk|remind) me (?:which|how|why)|what'?s driving|why (?:is|does|did)|would (?:it|that) be|does (?:that|this) mean|am i)\b/i;
const NOT_DATA_Q = /\b(?:which base|your (?:base|number|figure|calculation)|you(?:'re| are) using|did i (?:get|miss)|is that (?:right|correct|mece)|makes? sense)\b/i;
const TAIL_CUT = /(?:,|\s+—|\s+–)?\s+(?:so (?:that )?(?:i|we) (?:can|could)|so i'?d|because|since|to (?:see|confirm|size|check|test)(?: (?:whether|if|which|how|the|that|exactly)\b.*)?$|\s+to (?:see|confirm|size|check|test)|before (?:i|we) (?:recommend|go|commit)|rather than|which (?:hits|means|would))\b.*$|\s+[—–]\s+(?:if|because|since|so)\b.*$|,\s+if\b.*$/i;
const QUALIFIER_LEAD = /^(?:versus|vs\.?|(?:\d+|one|two|three) years? ago|today\b|or (?:just|one|two)|before|after|then|separate(?:ly)?|when\b|at what|for (?:both|each)|in each|each|as a (?:percent|share)|ideally|specifically|and how it moved|by (?:month|year|route|plan))/i;
const NUM_COMMA = /(\d),(?=\d{3}\b)/g;
// Where the ask starts: an ask cue's object, or a question's own opener. Text before the cue is the candidate's
// reasoning ("The obvious lever is raising prices, but before I recommend magnitude I'd want …"); a cue whose object is
// a pronoun points back ("Breakeven: Port Avery's variable cost per flight — I'd need that directly"), so the ask is
// what comes before it.
const ASK_CUE = /\b(?:(?:i'?d|i would)\s+(?:also\s+)?(?:want|need|like)(?:\s+now)?(?:\s+to\s+(?:know|see|understand|get|confirm))?|(?:can|could)\s+(?:i|we)\s+(?:get|see|have)|do we (?:have|know)|is there (?:any|a)|please share)\b\s*(?:is\b\s*)?:?\s*/i;
const Q_OPENER = /^(?:do|does|did|is there|are there|how|what|which|when|where|who|has|have|any|can|could|would|will)\b/i;
const POINTS_BACK = /^(?:that|this|it|those|these)\b/i;
// "the one I'd want hardest", "what I'd want first": the cue is inside a statement, not an ask.
const NOT_AN_OBJECT = /^(?:hardest|most|more|less|first|next|to (?:do|avoid|be))\b/i;
const RHETORICAL_TAIL = /\s+[—–]\s+(?:is|are|did|does|do|was|were)\s+(?:this|it|they|that|there)\b.*$/i;
// A dash that opens an explanation (a clause with its own verb): "how they're classifying — a lot of chains book …".
const DASH_EXPLAIN = /\s+[—–]\s+(?=(?:[\w'’$%.,-]+\s+){0,5}?(?:is|are|was|were|book|books|has|have|had|means|could|would|will|tends?|feels?)\b)[^—–?]*$/i;
// A list item: split at commas; at "and" / "plus" only before a new noun phrase or clause; never at "or" (an
// alternative is the same ask).
const AND_SPLIT = /\s+(?:and|plus)\s+(?=(?:whether|what|how|which|when|where|if|the|their|its|our|a|an|any|do|does|is|are)\b)/i;
// An enumeration of one ask's parts ("a cost breakdown — COGS, labor, rent, marketing, overhead —", "into its
// components: beans, dairy, packaging, food") is one sub-ask: three or more short items in a row.
const ENUMERATION = /(?:[—–:]\s*|\binto\s+)(?:[^,—–:?]{1,20},\s*){2,}(?:and\s+|or\s+|plus\s+)?[^,—–:?]{1,20}(?=\s*[—–?.]|\s*$|,\s*(?:and|ideally|plus)\b)/i;
// A tail that explains rather than asks: ", which determines …", ", especially …", ", e.g. …", ", built up from …".
const EXPLAIN_TAIL = /,\s+(?:which|especially|built|e\.g|i\.e|not just|not the|so)\b.*$/i;
function listItems(text: string): string[] {
  const t0 = text.replace(EXPLAIN_TAIL, '').replace(/^on [^:]{1,40}:\s*(?:first,?\s*)?/i, '');
  // Protect an enumeration and an alternative (", or …") from the comma split.
  const enumM = ENUMERATION.exec(t0);
  const t1 = enumM ? t0.replace(enumM[0], enumM[0].replace(/,/g, '\u0000')) : t0;
  const t = t1.replace(/\([^)]*\)/g, m => m.replace(/,/g, '\u0000'));
  return t.split(/,(?!\s*or\b)\s*(?:and\s+|plus\s+)?/).flatMap(x => x.split(AND_SPLIT)).map(x => x.replace(/\u0000/g, ','))
    .map(x => x.replace(/^[:—–\s-]+|[\s—–-]+$/g, '').replace(/^(?:or|and|also|ideally|crucially)\s+/i, '').replace(/^while we wait\s*[—–-]\s*/i, '').trim()).filter(Boolean);
}
export function subAskTexts(sentence: string): string[] {
  const raw = sentence.trim();
  if (!ASKS_DATA.test(raw) || NOT_DATA_Q.test(raw)) return [];
  // A cue inside a quotation is the quoted speaker's ("not sure I'd like the taste").
  const cue = ASK_CUE.exec(raw.replace(/[“"][^”"]*[”"]/g, m => ' '.repeat(m.length)));
  let body: string;
  if (cue) {
    const after = raw.slice(cue.index + cue[0].length);
    if (NOT_AN_OBJECT.test(after)) return [];
    body = POINTS_BACK.test(after) ? raw.slice(0, cue.index).replace(/^[^:]{0,40}:\s*/, '') : (/^(?:do we|is there|please)/i.test(cue[0]) ? raw.slice(cue.index) : after);
  } else {
    const q = raw.replace(FRAME_LEAD, '').replace(/^[:—–\s-]+/, '');
    if (!raw.includes('?') || SELF_QUESTION.test(q) || !Q_OPENER.test(q)) return [];
    body = q;
  }
  if (SELF_QUESTION.test(body)) return [];
  body = body.replace(NUM_COMMA, '$1').replace(RHETORICAL_TAIL, '').replace(DASH_EXPLAIN, '').replace(TAIL_CUT, '').replace(/[?.!]+$/, '').trim();
  const caseless = (t: string) => [...keyNouns(t)].filter(n => !FRAME_NOUNS.has(n));
  return body.split(/;\s*|\?\s*/).flatMap(c => {
    const parts0 = SPLIT_LIKE.test(c) && !/,/.test(c) ? [c.trim()] : listItems(c);
    // Everything from a purpose clause on is the purpose ("… to see whether it is concentrated on one or two routes").
    const at = parts0.findIndex(t => PURPOSE.test(t));
    const parts = at < 0 ? [...parts0] : parts0.slice(0, at);
    const merged: string[] = [];
    // A leading prepositional phrase ("of the 20% who upgrade, are they …") belongs to the item after it.
    if (parts.length > 1 && /^(?:of|for|among|on|in)\s+the\b/i.test(parts[0])) parts.splice(0, 2, `${parts[0]}, ${parts[1]}`);
    for (const t of parts) {
      const bareName = /^[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*$/.test(t);
      const tiny = caseless(t).length === 0 || t.split(/\s+/).length <= 1 || (/^how\b/i.test(t) && t.split(/\s+/).length <= 3);
      if (merged.length > 0 && (QUALIFIER_LEAD.test(t) || bareName || tiny)) merged[merged.length - 1] = `${merged[merged.length - 1]}, ${t}`;
      else merged.push(t);
    }
    return merged.filter(asked);
  });
}
const overlap = (a: string, b: string, names: string[]) => { const x = keyNouns(b, names); return [...keyNouns(a, names)].filter(n => x.has(n)).length; };

export function buildSubAsks(sentences: string[], model: DeclaredRequest[], detections: { what: string; ledgerItemIds: string[] }[], caseNames: string[], resolve: (raw: string) => string | null): SubAsk[] {
  const out: SubAsk[] = sentences.flatMap(s => subAskTexts(s).map(words => ({ words, sentence: s, source: 'candidate' as const, declared: false, modelIds: [], modelWhats: [], detectionIds: [], detectionWhats: [] })));
  // A declaration attaches to every sub-ask it shares a key noun with (a model `what` often merges the sentence's
  // sub-asks); R2's line test then keeps each item only where it answers. One that shares none is a sub-ask of its own.
  // Meaningful: the declaration's head noun, or at least half its key nouns ("quarter-by-quarter fares and
  // passengers" does not attach to "the fare floor" on one shared word).
  const near = (what: string) => {
    const own = [...keyNouns(what, caseNames)];
    const head = headNoun(what.replace(ASK_OPENER, ''), caseNames);
    return out.map((sa, i) => {
      if (sa.source !== 'candidate') return -1;
      const theirs = keyNouns(sa.words, caseNames);
      const shared = own.filter(n => theirs.has(n)).length;
      return shared > 0 && ((head !== null && theirs.has(head)) || shared * 2 >= own.length) ? i : -1;
    }).filter(i => i >= 0);
  };
  for (const r of model) {
    const ids = r.itemIds.map(resolve).filter((x): x is string => x !== null);
    const at = near(r.what);
    // A mention (explicit:false) is an ask only where an asking sentence names it (round 6 mention_asked); else it
    // would have been an offer, which Phase 2 drops (Q4).
    if (!r.explicit && at.length === 0) continue;
    if (at.length === 0) { out.push({ words: r.what, sentence: null, source: 'model', declared: true, modelIds: ids, modelWhats: [r.what], detectionIds: [], detectionWhats: [] }); continue; }
    for (const i of at) {
      out[i].modelIds.push(...ids);
      out[i].modelWhats.push(r.what);
      if (r.explicit) out[i].declared = true;
    }
  }
  for (const d of detections) {
    const at = near(d.what);
    if (at.length === 0) { out.push({ words: d.what, sentence: null, source: 'detection', declared: true, modelIds: [], modelWhats: [], detectionIds: [...d.ledgerItemIds], detectionWhats: [d.what] }); continue; }
    for (const i of at) {
      out[i].detectionIds.push(...d.ledgerItemIds);
      out[i].detectionWhats.push(d.what);
      out[i].declared = true;
    }
  }
  return out;
}

type ShadowInput = {
  plan: ModelPlan;
  model: DeclaredRequest[];
  detections: DetectedDataRequest[] | null;
  modelWords: string[];
  old: TurnData;
};

export async function shadowAskDecision(x: ShadowInput): Promise<ShadowDecision> {
  const { plan, old } = x;
  const { state, ctx } = plan;
  const { ledger, factBase: fb, caseData } = state;
  const caseNames = properNames(caseData.sttKeyterms);
  const resolve = caseResolver(plan);
  const sentences = state.kind === 'model' ? messageAskSentences(plan)
    : addressedAskSentences(ctx.candidateText, ctx.currentPhase, { closing: state.kind === 'close', wantIs: fb.answerGate, wantBroad: switchOn(caseData, 'wantCueBroad') });
  const dets = (x.detections ?? []).filter(d => d.explicit).map(d => ({ what: d.what, ledgerItemIds: d.ledgerItemIds }));
  const subAsks = buildSubAsks(sentences, x.model, dets, caseNames, resolve);

  // The verdicts today's code fetched this turn (no new call): by the words they were asked in.
  const verdicts = new Map<string, CheckVerdict>();
  for (const [what, p] of state.deferChecks) { const v = await p.catch(() => null); if (v) verdicts.set(normWords(what), v); }

  const itemOf = (id: string) => ledger.items.find(i => i.id === id);
  const inLedger = (id: string) => itemOf(id) !== undefined;
  const namesOf = (id: string) => fb.quantities.find(q => q.id === id)?.names ?? [];
  const ownWords = (id: string) => { const i = itemOf(id); return i ? [i.label, i.spoken ?? '', i.value, ...namesOf(id), ...(fb.covers.find(c => c.id === id)?.phrases ?? [])].join('\n') : ''; };
  const tagged = (id: string) => caseData.dataLedger.find(i => i.id === id)?.tags;
  const tagOk = (sa: SubAsk, id: string) => {
    const text = sa.sentence ? `${sa.words}\n${sa.sentence}` : sa.words;
    return (!fb.answerGate || tagsAgree(text, id, fb).agree) && itemTagsAgree(askTags(sa.words, sa.sentence ?? '', fb), tagged(id)).agree;
  };
  // Rule 3 refined (Lorenzo, 27 Oct, session-1 ruling 2): a tag mismatch is CLEAR when the sub-ask's own words say it
  // (an entity, period or quantity kind the item's tags don't carry); one that only the rest of the candidate's
  // sentence brings in is UNCERTAIN. A clear one with nothing else matching is a true refusal (R6); uncertain defers.
  const tagReject = (sa: SubAsk, id: string): 'clear' | 'uncertain' | null => {
    if (tagOk(sa, id)) return null;
    const own = (!fb.answerGate || tagsAgree(sa.words, id, fb).agree) && itemTagsAgree(askTags(sa.words, '', fb), tagged(id)).agree;
    return own ? 'uncertain' : 'clear';
  };
  const scoped = (sa: SubAsk, id: string): 'in' | 'coarse' | 'sibling' => {
    const item = itemOf(id);
    if (!item) return 'in';
    const rule = scopeRule(sa.words, item, namesOf(id));
    if (rule === null) return 'in';
    return changeForSplit(sa.words, item) ? 'sibling' : 'coarse';
  };
  const coverHit = (sa: SubAsk, id: string) => coverageDetail(sa.words, fb, { sentence: sa.sentence ?? undefined }).items.includes(id);
  const lineTest = (sa: SubAsk, id: string) => overlap(sa.words, ownWords(id), caseNames) > 0 || coverHit(sa, id);
  // The stricter reading: the sub-ask's head noun is in the item's own words, or a cover names it for the sub-ask
  // ("turns per store per week" is not answered by the store count on "store").
  const headTest = (sa: SubAsk, id: string) => { const h = askHead(sa.words, caseNames); return coverHit(sa, id) || (h !== null && keyNouns(ownWords(id), caseNames).has(h)); };

  const shown = state.shownExhibitIds;
  const exhibitIds = new Set(caseData.exhibits.map(e => e.id));
  const gateOn = ptGateOn(plan);
  const wrap = wrapUpTurn(plan);
  const exhibitsInfo = caseData.exhibits.map(e => ({ id: e.id, title: e.title, coversLedgerItems: e.coversLedgerItems, after: e.after, requiresItems: e.requiresItems }));
  const pendingItems = ledger.items.filter(i => !ledger.revealed.has(i.id));

  // Today's outcome for a sub-ask: read from the decisions as rendered (old), by item and by words.
  const oldReleased = new Set([...old.releases.map(r => r.id), ...(old.exhibit?.covers ?? []), ...(old.exhibit ? [old.exhibit.id] : [])]);
  const oldRestated = new Set(old.restates.map(r => r.id));
  const oldDefers = [...old.defers, ...old.gateDefers, ...(old.wontGetTo ?? []), ...(old.wontGetToNamed ?? [])];
  const oldOf = (sa: SubAsk, cands: string[]): { outcome: AskDecided['old']; items: string[] } => {
    const rel = cands.filter(id => oldReleased.has(id));
    if (rel.length > 0) return { outcome: 'release', items: rel };
    const pt = cands.filter(id => oldRestated.has(id));
    if (pt.length > 0) return { outcome: 'point', items: pt };
    const near = (w: string) => overlap(w, sa.words, caseNames) > 0;
    if (old.refusals.some(near)) return { outcome: 'refuse', items: [] };
    if (oldDefers.some(near)) return { outcome: 'defer', items: [] };
    if (old.offers.some(near)) return { outcome: 'offer', items: [] };
    return { outcome: 'none', items: [] };
  };

  // The exhibit today's code hands over this turn is kept (design §2.4: the exhibit is decided after the sub-asks, as
  // today): what it shows is given, outside the cap.
  const given = new Set<string>([...(old.exhibit?.covers ?? []), ...(old.exhibit ? [old.exhibit.id] : [])]);
  let releasedCount = 0;
  const asks: AskDecided[] = [];
  for (const sa of subAsks) {
    const verdictsOf = [sa.words, ...sa.modelWhats, ...sa.detectionWhats].map(w => verdicts.get(normWords(w))).filter((v): v is CheckVerdict => v !== undefined);
    const covered = coverageDetail(sa.words, fb, { sentence: sa.sentence ?? undefined });
    const named = findFalseRefusals(`I don't have ${sa.words}.`, fb, ledger.revealed).flatMap(f => f.items);
    const haikuFull = verdictsOf.flatMap(v => v.ids.filter(id => !v.partial.includes(id) && !v.outOfScope.includes(id)));
    const haikuPartial = verdictsOf.flatMap(v => v.ids.filter(id => v.partial.includes(id) || v.outOfScope.includes(id)).map(id => ({ id, missing: v.missing[id] })));
    const deterministic = [...covered.items, ...covered.coarse.flatMap(c => c.ids), ...named, ...sa.detectionIds, ...groupItemsAsked(sa.words, fb)];
    const allCands = [...new Set([...sa.modelIds, ...haikuFull, ...haikuPartial.map(p => p.id), ...deterministic])].filter(id => inLedger(id) || exhibitIds.has(id));
    const o = oldOf(sa, allCands);
    const base = { words: sa.words, whats: [...new Set([...sa.modelWhats, ...sa.detectionWhats])], sentence: sa.sentence, source: sa.source, declared: sa.declared, old: o.outcome, oldItems: o.items };

    // Pick the matching items, rule by rule.
    let rule: RuleId | null = null;
    let pick: string[] = [];
    let cut: string | undefined;
    const tagMismatch: string[] = [];
    const lineFail: string[] = [];
    const r1 = allCands.filter(id => given.has(id) && (exhibitIds.has(id) || headTest(sa, id)));
    if (r1.length > 0) { rule = 'R1'; pick = r1; }
    if (!rule) {
      // The line test (design R2 c) withdraws a model item only on a positive contradiction: its words share nothing
      // with the sub-ask AND the check or a detection maps the sub-ask to another item. Otherwise a failed line test is
      // logged (`lineFail`) and the model's semantic mapping stands ("departures flown by the fleet" → the schedule).
      const elsewhere = new Set([...haikuFull, ...haikuPartial.map(p => p.id), ...sa.detectionIds]);
      const contradicted = (id: string) => !lineTest(sa, id) && elsewhere.size > 0 && !elsewhere.has(id);
      const model = sa.modelIds.filter(id => exhibitIds.has(id) || (!contradicted(id) && scoped(sa, id) !== 'sibling'));
      lineFail.push(...model.filter(id => !exhibitIds.has(id) && !lineTest(sa, id)));
      if (model.length > 0) {
        rule = 'R2'; pick = model;
        for (const id of model) if (!exhibitIds.has(id) && !tagOk(sa, id)) tagMismatch.push(id);
        if (model.some(id => scoped(sa, id) === 'coarse')) cut = sa.words;
        // A model item whose words lack the sub-ask's head noun answers it at best coarsely: E1's form, the ask's
        // words refused beside it — when the false-refusal veto lets that refusal stand (else nothing is refused).
        const coarseOnly = model.filter(id => !exhibitIds.has(id)).every(id => !headTest(sa, id));
        if (!cut && coarseOnly && findFalseRefusals(`I don't have ${sa.words}.`, fb, new Set([...ledger.revealed, ...given, ...model]), { covers: true }).length === 0) cut = sa.words;
      }
    }
    if (!rule) {
      const full = haikuFull.filter(id => tagOk(sa, id) && scoped(sa, id) !== 'sibling');
      const part = haikuPartial.filter(p => tagOk(sa, p.id) && scoped(sa, p.id) !== 'sibling');
      if (full.length + part.length > 0) {
        rule = 'R3'; pick = [...full, ...part.map(p => p.id)];
        if (full.length === 0 || full.some(id => scoped(sa, id) === 'coarse')) cut = part.find(p => p.missing)?.missing ?? sa.words;
      }
    }
    if (!rule) {
      const det = [...new Set(deterministic)].filter(id => inLedger(id) && tagOk(sa, id) && scoped(sa, id) !== 'sibling' && (headTest(sa, id) || sa.detectionIds.includes(id)));
      if (det.length > 0) {
        rule = 'R4'; pick = det;
        if (det.some(id => scoped(sa, id) === 'coarse') || covered.dropped.some(d => d.why === 'region')) cut = covered.plain ?? sa.words;
      }
    }

    // The answer gate on the items picked (round 6 Task 70; tagged cases): a period or scope they don't state is the
    // cut refused beside them (E1); a topic unmet — on the check's items only, as ruled 21 Oct — drops them.
    let gateParts: string[] = [];
    // The check's own guard parts on the items picked (the qualifier guard / answer gate it ran): the cut.
    const guardParts = verdictsOf.flatMap(v => (v.guard && v.guard.parts.length > 0 && pick.some(id => v.ids.includes(id) || v.guard!.ids.includes(id)) ? v.guard.parts : []));
    if (rule && guardParts.length > 0) cut = [...new Set(guardParts)].join(' or ');
    if (rule) {
      const g = answerGate(plan, sa.words, pick.filter(inLedger), sa.sentence ?? undefined, { topics: rule === 'R3', tags: false });
      if (g) {
        pick = pick.filter(id => !g.drop.includes(id));
        gateParts = [...new Set([...guardParts, ...g.refuse.map(r => r.part)])];
        if (gateParts.length > 0) cut = gateParts.join(' or ');
        if (pick.length === 0) rule = null;
      }
    }
    if (rule === 'R1' && cut && sa.declared) {
      // Given for a sibling sub-ask, but not stating this one's period or scope: the cut refused (E1, 4b).
      asks.push({ ...base, outcome: 'refuse', rule: 'R6', items: [], cut, withHead: 'refuse', agree: o.outcome === 'refuse' });
      continue;
    }

    if (rule) {
      // R5: already out → point; out with a cut → the cut refused alone (E1, 4b); new → the gates; the rest released.
      const out = pick.filter(id => ledger.revealed.has(id) || shown.has(id));
      const fresh = pick.filter(id => !out.includes(id) && !given.has(id));
      const givenNow = pick.filter(id => given.has(id) && !out.includes(id));
      // A pointer only to an item whose own words carry the sub-ask's head noun (4.1's matched-item rule: a re-ask is
      // answered by the item it names, not by one sharing a generic word — b38l Tyler t24's elasticity and the routes).
      const head = askHead(sa.words, caseNames);
      const pointable = out.filter(id => exhibitIds.has(id) || (head !== null && keyNouns(ownWords(id), caseNames).has(head)));
      let decided: AskDecided | null = null;
      if (rule !== 'R1' && cut && out.length === pick.length && sa.declared) {
        decided = { ...base, outcome: 'refuse', rule: 'R6', items: [], cut, withHead: 'refuse', agree: o.outcome === 'refuse' };
      } else if (fresh.length === 0 && out.length === 0 && givenNow.length > 0) {
        // Already given this turn (another sub-ask, or the exhibit going out): R1.
        decided = { ...base, outcome: 'release', rule: 'R1', items: givenNow, agree: o.outcome === 'release' };
      } else if (rule !== 'R1' && fresh.length === 0 && givenNow.length === 0 && out.length > 0) {
        decided = pointable.length > 0
          ? { ...base, outcome: 'point', rule: 'R5', items: pointable, ...(cut ? { cut } : {}), agree: o.outcome === 'point' || o.outcome === 'release' }
          : null;   // out, but not the item asked about: nothing matches (R6 / R7 below)
        if (!decided) rule = null;
      }
      if (decided) { asks.push(decided); continue; }
      if (rule) {
        let why: DeferWhy | undefined;
        const ok: string[] = [];
        for (const id of fresh) {
          if (exhibitIds.has(id)) { ok.push(id); continue; }
          if (gateOn && isGatedItem(ledger, id)) { why ??= 'gate'; continue; }
          if (heldForOrder(id, exhibitsInfo, shown, ledger, state.stagesOut)) { why ??= 'order'; continue; }
          if (releasedCount >= RELEASE_CAP) { why ??= 'cap'; continue; }
          ok.push(id); releasedCount++;
        }
        for (const id of ok) given.add(id);
        if (rule !== 'R1' && ok.length === 0 && givenNow.length === 0 && why) {
          asks.push({ ...base, outcome: 'defer', rule, items: fresh, why, ...(wrap ? { wont: true as const } : {}), agree: o.outcome === 'defer' });
          continue;
        }
        const items = rule === 'R1' ? pick : [...ok, ...givenNow, ...pointable];
        asks.push({ ...base, outcome: 'release', rule, items, ...(cut ? { cut } : {}), ...(tagMismatch.length ? { tagMismatch } : {}), ...(lineFail.length ? { lineFail } : {}),
          agree: o.outcome === 'release' && items.some(id => o.items.includes(id)) });
        continue;
      }
    }

    // R6 / R7: nothing matches.
    const checkedNone = verdictsOf.some(v => v.mapped === false);
    const haikuIds = [...new Set([...haikuFull, ...haikuPartial.map(p => p.id)])].filter(inLedger);
    const rejections = haikuIds.map(id => tagReject(sa, id));
    const tagRefused = haikuIds.length > 0 && rejections.every(r => r === 'clear');
    const modelRefused = x.modelWords.flatMap(sentencesOf).some(s => MODEL_REFUSES.test(s) && overlap(s, sa.words, caseNames) > 0);
    const deterministicCut = covered.dropped.some(d => d.why === 'region') || gateParts.length > 0;
    const vetoed = findFalseRefusals(`I don't have ${sa.words}.`, fb, new Set([...ledger.revealed, ...given]), { covers: true }).length > 0;
    const stated = [...given].some(id => { const i = itemOf(id); return i ? statesAsked(sa.words, { label: i.label, value: i.value }, caseData.dataLedger) : false; });
    const evidence = checkedNone || modelRefused || deterministicCut || tagRefused;
    const refusable = sa.declared && evidence && !vetoed && !stated;
    const headR6 = askHead(sa.words, caseNames);
    const headShared = headR6 !== null && pendingItems.some(i => !given.has(i.id) && keyNouns(ownWords(i.id), caseNames).has(headR6));
    const wouldCheck = !evidence && verdictsOf.length === 0 ? { wouldCheck: true as const } : {};
    const outcome: Outcome = refusable ? 'refuse' : 'defer';
    asks.push({ ...base, outcome, rule: refusable ? 'R6' : 'R7', items: [], ...(outcome === 'defer' ? { why: 'uncertain' as const, ...(wrap ? { wont: true as const } : {}) } : {}),
      withHead: refusable && headShared ? 'defer' : outcome, ...wouldCheck, agree: o.outcome === outcome });
  }
  return { asks, volunteered: old.releases.filter(r => r.mustReach !== undefined || r.earlier).map(r => r.id), offersDropped: old.offers, sentences };
}

// The disagreement class of one sub-ask: today's outcome → the shadow's ("same" when they agree).
export const disagreement = (a: Pick<AskDecided, 'old' | 'outcome' | 'agree'>) => (a.agree ? 'same' : `${a.old}→${a.outcome}`);
