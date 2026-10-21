// Guard B detector (7 Oct, batch 17): explicit data asks in the candidate's
// message, by phrasing — deterministic, before the model call. Tuned for
// precision, not recall: it only has to catch a turn where the candidate
// plainly asked for data and the model declared no request at all (Luna's
// Nikhil run: fourteen turns of "could I get…" with nothing declared).
// Statement-form asks without these phrasings ("this hinges on volume") are
// left to the model, as today.
import type { Phase } from './state-machine';
import { normalizeNumberWords } from '@/lib/number-words';
import { DATA_NOUN, isQuestionForm, selfAnswered, sentencesOf } from './stall';

const CUES: [label: string, pattern: RegExp][] = [
  ['could I get', /\b(could|can|may)\s+(i|we)\s+(get|have|see)\b/i],
  ['do we have', /\bdo\s+(we|you)\s+have\b/i],
  ['is there data', /\bis\s+there\s+(any\s+)?(data|information|a\s+breakdown|a\s+split)\b/i],
  // "One thing I'd want: how…" asks too (Lorenzo, 19 Oct; batch 32 Aldermoor Marisol t7, Jasmine t5, Marcus t5).
  ["I'd want the", /\b(i'?d|i\s+would)\s+(want|need|like)\s*(:|\s(the|a|an|some|any|to\s+see|to\s+know|to\s+get)\b)/i],
  ['please share', /\bplease\s+(share|send|give|show)\b/i],
];

// The cues that matched, in order (empty when none did).
export function explicitRequestCues(text: string): string[] {
  return CUES.filter(([, re]) => re.test(text)).map(([label]) => label);
}

// The sentences that carry an explicit ask — kept with the request_signal
// event so the candidate's own words are preserved. Never mapped to data here.
export function requestSentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+/).filter(s => explicitRequestCues(s).length > 0).map(s => s.trim()).slice(0, 8);
}

// ---- Code-written turns (smoke fix B, 9 Oct) ----
// The close, grace ask, time warning and rung 1 have no model to read the
// message, so they answer only the sentences that ask the interviewer for
// data. Guard B's list above was the wrong test there: its "I'd want/need…"
// cue let goodbye data-dumps through (a final answer's next steps — Jordan
// 15ad9d8e t25, Ines debc9b60 t25) and it missed plain asks ("What was the
// store count two years ago?"). explicitRequestCues is unchanged.

const ADDRESSED_CUES: RegExp[] = [
  ...CUES.filter(([label]) => label !== "I'd want the").map(([, re]) => re),
  /\b(could|can|would|will)\s+you\s+(share|give|send|show|tell|pull|provide)\b/i,
  /\bany\s+(data|numbers|figures|information)\s+on\b/i,
];
const WANT_CUE = CUES.find(([label]) => label === "I'd want the")![1];
// "(What) I'd want is …" too, on a tagged case (round 6 Task 71, audit row 11; b37 Hollis Bay Marcus
// ddbb070b t9: "What I'd want is distribution math: how many stores Hollis Bay can get the line into …"
// asked nothing, and the turn answered with an offer). `wantIs` (the callers pass the case's
// `answerGate`): prof-001's b29 Blake t3 "One thing I would want is the menu-price history …" would
// start a classifier call its replay never made. Guard B's cue list (explicitRequestCues) is unchanged:
// this only makes the sentence an asking sentence, so the message's classifier reads it.
const WANT_IS = /\b(?:i'?d|i\s+would)\s+want\s+is\b/i;
// Before the brainstorm "I'd want the…" is usually an ask; later it is usually
// a next step (plan-turn.ts, guard B) — unless the sentence is a question.
export const WANT_ASK_PHASES: Phase[] = ['INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS', 'EXHIBIT'];
// stall.ts's case nouns, plus the store count (prof-001's scoping facts).
const ASK_DATA_NOUN = /\b(stores?|counts?)\b/i;
// A list that continues an ask: "Could I get: one, …. Two, …." or bullets.
const LIST_ITEM = /^(?:(?:one|first(?:ly)?|two|three|four|five|six|seven|eight|nine|ten|second(?:ly)?|third(?:ly)?|fourth|fifth|finally|lastly)\b|\d+\)\s|[-•*]\s)/i;

// "Do we know how many stores…" asks; "Do you know what worries me?" is
// rhetorical (fix round 2). It counts only before a quantity ("how many",
// "how much", a time: "how quickly / fast / long / soon" — round 5 Task 48, B1
// Larkspur Marisol t25 "Do we know how quickly we can exit the Lakeport and
// Port Avery slots?") or a case figure ("the / our / what the … store count"),
// or "whether / if" with a data noun or a number ("whether the 30% is
// negotiable" — Lorenzo, 19 Oct; batch 32 Aldermoor Marcus t19).
const DO_KNOW = /\bdo\s+(?:we|you)\s+know\s+(.*)$/i;
const isDataNoun = (t: string) => DATA_NOUN.test(t) || ASK_DATA_NOUN.test(t);
function doKnowAsk(sentence: string): boolean {
  const rest = DO_KNOW.exec(sentence)?.[1];
  if (rest === undefined) return false;
  if (/^how\s+(many|much|quickly|fast|long|soon)\b/i.test(rest)) return true;
  if (/^(?:whether|if)\b/i.test(rest)) return isDataNoun(rest) || /\d/.test(rest);
  return /^(?:what\s+)?(?:the|our|their|its|any)\b/i.test(rest) && isDataNoun(rest);
}

// An (A) cue: the sentence asks the interviewer by its phrasing.
function cueAsk(sentence: string): boolean {
  return ADDRESSED_CUES.some(re => re.test(sentence)) || doKnowAsk(sentence);
}

// The numbers in a text, spoken forms read as digits ("80 million" -> 80).
const numbersIn = (text: string) => [...normalizeNumberWords(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
const sameFigure = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);

// A question about how to proceed names a figure without asking for data
// ("Do you want me to work from 25%?" — prof-001 Tyler, batch 28 t15).
const PROCEED_Q = /^\W*(?:(?:and|so|ok(?:ay)?|then)\b,?\s+)?(?:do you want|would you (?:like|prefer)|should (?:i|we)|shall (?:i|we)|want me to|is that (?:ok|okay|fine|right|correct)|does that (?:work|sound))/i;

// A question that names an item not yet out, on a code-written turn (round 6 Task 71, audit row 17; b37
// Quillpath Marisol 084e7508 t15 → t16, code's exhibit turn: "So I'd want to pressure-test that: are
// those upgraders people who'd have bought Pro directly anyway?" — no cue, no data noun, so the turn
// dropped the classifier's detection). The question is the sentence, or what follows its last colon
// ("…: are those …?"); it names the item by a content word of its label — the case's proper names aside
// ("Pro" alone names nothing), a stem or a prefix of five letters or more ("upgraders" / "upgrade") — and
// is not about how to proceed. Only code-written turns pass the labels (session-runner.ts codeWrittenAsks):
// they classify every message already, so this adds no model call.
export type LedgerNouns = { labels: string[]; caseNames: string[] };
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
function namesLedgerLabel(sentence: string, ledger: LedgerNouns): boolean {
  const colon = sentence.lastIndexOf(':');
  const question = isQuestionForm(sentence) ? sentence : colon >= 0 && isQuestionForm(sentence.slice(colon + 1).trim()) ? sentence.slice(colon + 1).trim() : null;
  if (question === null || PROCEED_Q.test(question)) return false;
  const asked = [...namingWords(question, ledger.caseNames)];
  return ledger.labels.some(label => [...namingWords(label, ledger.caseNames)].some(w => asked.some(a => sameWord(a, w))));
}

type AskOpts = { closing?: boolean; given?: number[]; ledger?: LedgerNouns; wantIs?: boolean };
function asksAddressed(sentence: string, phase: Phase, o: AskOpts = {}): boolean {
  const given = o.given ?? [];
  if (selfAnswered(sentence)) return false; // "Do we know X, I would assume so": answered by the candidate, no "?"
  if (cueAsk(sentence)) return true;
  const want = WANT_CUE.test(sentence) || (o.wantIs === true && WANT_IS.test(sentence));
  if (want && (WANT_ASK_PHASES.includes(phase) || sentence.endsWith('?') || isQuestionForm(sentence))) return true;
  if (o.ledger && namesLedgerLabel(sentence, o.ledger)) return true;
  if (!isQuestionForm(sentence)) return false;
  if (PROCEED_Q.test(sentence)) return isDataNoun(sentence);
  // A question naming a figure the candidate was given: "does the $80 million hold flat…?"
  return isDataNoun(sentence) || (given.length > 0 && numbersIn(sentence).some(n => given.some(g => sameFigure(n, g))));
}

// A question the candidate asks themselves (Lorenzo, 14 Oct; batch 24, Sofia
// 84910bd6 t25: "First I'd want to know what kind of drop it is. Is it
// transaction count falling, or is the same customer buying less…? Those need
// different responses." — the goodbye read out the average ticket): no
// addressed cue, the message goes on with their own statements, and it is an
// either/or or set up as their own question. A plain ask stays an ask. Only the
// close reads it so (Lorenzo, 15 Oct): mid-case, "Is it beans, or dairy?" is
// a real ask even when the candidate guesses after it.
const SELF_FRAME = /\b(?:i'?d (?:want|need) to know|i'?d ask|the (?:real |key )?question is|i'?d check|first,?\s+i'?d)\b/i;
const EITHER_OR = /,\s*or\b|\bor is\b|\bor are\b|\bor does\b|\bor do\b/i;
function rhetorical(sentences: string[], i: number): boolean {
  const s = sentences[i];
  if (!isQuestionForm(s) || cueAsk(s)) return false;
  const after = sentences.slice(i + 1);
  if (after.length === 0 || after.every(x => isQuestionForm(x))) return false;
  return EITHER_OR.test(s) || SELF_FRAME.test(sentences[i - 1] ?? '');
}

// The sentences of the message that ask the interviewer for data — by an
// addressed-ask cue, or as a question about case data — with any enumerated
// list that follows one. At the close, a rhetorical question is none.
// "1. Store count" would split after "1.": numbered lines become "1) …".
const askSentencesOf = (text: string) => sentencesOf(text.replace(/(^|\n)\s*(\d+)[.)]\s+/g, '$1$2) '));
// `ledger`: the labels of the items not yet out, on a code-written turn (namesLedgerLabel above);
// `wantIs`: "I'd want is …" is a want (WANT_IS above; tagged cases).
export function addressedAskSentences(text: string, phase: Phase, opts: AskOpts = {}): string[] {
  const out: string[] = [];
  let inAsk = false;
  const sentences = askSentencesOf(text);
  sentences.forEach((s, i) => {
    inAsk = (asksAddressed(s, phase, opts) && !(opts.closing && rhetorical(sentences, i))) || (inAsk && LIST_ITEM.test(s));
    if (inAsk) out.push(s);
  });
  return out;
}

// Guard B from the brainstorm on (Lorenzo, 19 Oct; batch 32 Aldermoor Marisol
// t7, Marcus t19): addressed asks, rhetorical self-questions filtered as at
// the close, so a next step ("I'd want the store-level data to confirm.")
// stays out. caseTexts: the prompt and revealed values — figures the
// candidate was given.
export function lateAskCues(text: string, phase: Phase, caseTexts: string[] = []): string[] {
  return lateAskSentences(text, phase, caseTexts).length > 0 ? ['addressed ask'] : [];
}
export function lateAskSentences(text: string, phase: Phase, caseTexts: string[] = []): string[] {
  return addressedAskSentences(text, phase, { closing: true, given: caseTexts.flatMap(numbersIn) });
}

// The sentences where the candidate asks for something or states what they
// want to see — addressed asks, guard B's cues, and "What I'd want next is
// what's inside that COGS line" (Owen d3db78c0 t5, batch 25). Wider than
// addressedAskSentences: it only widens an ask the model already declared
// (a group the sentence names, turn-data.ts), never makes one.
const STATED_WANT = /\b(?:i'?d|i\s+would)\s+(?:want|need|like)\b|\bi\s+(?:want|need)\s+to\s+(?:know|see|understand)\b/i;
export function askingSentences(text: string, phase: Phase): string[] {
  const addressed = new Set(addressedAskSentences(text, phase));
  return askSentencesOf(text).filter(s => addressed.has(s) || explicitRequestCues(s).length > 0 || STATED_WANT.test(s));
}

// Words that name nothing in particular: they never make a match on their own.
const GENERIC = new Set(`the and for any our you your could can get got have has had what was were how many much does did would will should
data information info numbers number figures figure breakdown split some with from that this there about over per both
year years month months week weeks day days ago last prior one two three four five also more like want need see share give send
show tell pull provide know please into across between each all whether which when where who why are been being its they them
their let just before after then than them other same any one first second third fourth`.split(/\s+/));
const stem = (w: string) => { const s = w.replace(/(?:ing|ed|es|s|e)$/, ''); return s.length >= 3 ? s : w; };
const contentWords = (t: string) => new Set((t.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length >= 3 && !GENERIC.has(w)).map(stem));

// The classifier's detections an asking sentence covers (kept) and the rest
// (dropped). One asking sentence with an addressed-ask cue ("Could you share
// that?") and one detection are a match; otherwise a detection needs a content
// word in common with an asking sentence — a lone data question is often
// rhetorical ("So what's driving the margin decline?", fix round 2) and covers
// only what it names.
//
// A held item asked about in a question (round 5 Task 49, A2; B1 Aldermoor
// Tyler fc5eb050 t21 → t22): "Do we know whether Kelvexa's US exclusivity runs
// long enough to make a build pay back?" names no data noun, so no sentence
// counted as an ask, and the brainstorm stage turn dropped the classifier's
// "How long Kelvexa's US exclusivity/patent protection lasts" (`patents`, held:
// to 2038) — the answer never reached him. With `held`, a detection the asking
// sentences don't cover is still kept when an item it maps to is held (in the
// ledger, not yet out) and a real question of the message (opens like a question; the "?" is
// not required — voice STT drops it, Task 57) shares a content word with that item's own names — its
// label, spoken name or the case's names for it — other than the case's proper
// names (the client, the product, places: "Kelvexa" alone is no match; fix
// round 1, controller). A statement ("I'd want that definition settled before
// the board meets.") is no question: still dropped. The close doesn't pass
// `held` (session-runner.ts codeWrittenAsks).
export type HeldAsks = { text: string; isHeld: (id: string) => boolean; itemNames: (id: string) => string[]; caseNames: string[] };
export function matchAskDetections<T extends { what: string; ledgerItemIds?: string[] }>(sentences: string[], detections: T[], held?: HeldAsks): { kept: T[]; dropped: T[] } {
  const split = coveredAsks(sentences, detections);
  if (!held || split.dropped.length === 0) return split;
  const questions = askSentencesOf(held.text).filter(isQuestionForm).join(' ');
  const named = (id: string) => namesItem(questions, held.itemNames(id), held.caseNames);
  const keep = new Set<T>([...split.kept, ...split.dropped.filter(d => (d.ledgerItemIds ?? []).some(id => held.isHeld(id) && named(id)))]);
  return { kept: detections.filter(d => keep.has(d)), dropped: detections.filter(d => !keep.has(d)) };
}
function coveredAsks<T extends { what: string }>(sentences: string[], detections: T[]): { kept: T[]; dropped: T[] } {
  if (sentences.length === 0) return { kept: [], dropped: [...detections] };
  if (sentences.length === 1 && detections.length === 1 && cueAsk(sentences[0])) {
    return { kept: [...detections], dropped: [] };
  }
  const asked = contentWords(sentences.join(' '));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const d of detections) ([...contentWords(d.what)].some(w => asked.has(w)) ? kept : dropped).push(d);
  return { kept, dropped };
}

// The case's proper names (sttKeyterms: the client, products, places) — they name no item on their own.
export const properNames = (sttKeyterms: string[]) => sttKeyterms.filter(t => /^[A-Z]/.test(t));
// A text's naming words: its content words, the case's proper names aside — one rule
// for every caller (round 5 Task 50: "Hollis Bay" is in the offer and in the ask it
// replaced — B2 Jasmine t5; Task 49: "Kelvexa" alone names no item; Task 51 fix round
// 1). A proper name is taken out as a whole phrase, and a word of one said alone
// ("snacks" of "Hollis Bay Snacks", "bean" of "Brew & Bean") names nothing either —
// unless `own` (an item's own label, spoken name and names, the proper names taken
// out) uses it as a common noun: "beans" names the bean items ("coffee bean price
// change"). The ask-to-declaration comparisons (namedBy) pass no `own`.
const withoutNames = (text: string, caseNames: string[]) => [...caseNames].sort((a, b) => b.length - a.length)
  .reduce((t, n) => t.replace(new RegExp(`(?<![a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'gi'), ' '), text);
export const namingWords = (text: string, caseNames: string[], own?: Set<string>) => {
  const proper = contentWords(caseNames.join(' '));
  return new Set([...contentWords(withoutNames(text, caseNames))].filter(w => !proper.has(w) || own?.has(w)));
};
// Whether a text names an item: a naming word (stem match) in common with the item's
// own words — `own` (label, spoken name, the case's names for it) and `more` (its
// covers, Task 51) — a word of a proper name only through `own`.
export function namesItem(text: string, own: string[], caseNames: string[], more: string[] = []): boolean {
  const ownWords = contentWords(withoutNames(own.join(' '), caseNames));
  const words = new Set([...ownWords, ...contentWords(withoutNames(more.join(' '), caseNames))]);
  return [...namingWords(text, caseNames, ownWords)].some(w => words.has(w));
}
// Whether a text says one of an item's names whole (round 6 Task 71, audit row 6): every naming word of
// one of its phrases — label, spoken name, the case's names and covers for it — the case's proper names
// aside ("lakeport passengers" is said by "passenger counts … on Lakeport"). Stricter than namesItem: one
// shared word is not enough ("bags" is in the planning assumptions' label and in b35 Hollis Bay Jasmine
// t5's "how many bags of chips …", a different item — round 5 Task 50's ruling).
export function saysItemName(text: string, phrases: string[], caseNames: string[]): boolean {
  const said = namingWords(text, caseNames);
  return phrases.some(ph => { const words = [...namingWords(ph, caseNames)]; return words.length > 0 && words.every(w => said.has(w)); });
}
// A text with no naming word: a pointer ("Can I see the data?").
export const namesNothing = (text: string, caseNames: string[]) => namingWords(text, caseNames).size === 0;

// Whether one declaration names an ask by its words: two of the ask's naming words
// in its "what", or the ask's only one (round 5 Task 50, fix round 1: one shared
// word is not enough — "bags" is in the planning-assumptions declaration and in
// Jasmine t5's "how many bags of chips …", a different item). Each declaration is
// read on its own, never their words pooled.
function namedBy(ask: Set<string>, declared: { what: string }[], caseNames: string[]): boolean {
  if (ask.size === 0) return false;
  return declared.some(r => {
    const words = namingWords(r.what, caseNames);
    return [...ask].filter(w => words.has(w)).length >= Math.min(2, ask.size);
  });
}

// The detections a declared request already covers — a ledger item in common, or
// its "what" named by one declaration (namedBy) — and the rest (round 5 Task 48: a
// probe turn answers only the asks the model left out — never one twice). Callers
// pass the explicit declarations only: an offer answers no ask (Task 50).
export function uncoveredAsks<T extends { what: string; ledgerItemIds: string[] }>(declared: { what: string; itemIds: string[] }[], detections: T[], caseNames: string[] = []): { fresh: T[]; covered: T[] } {
  const ids = new Set(declared.flatMap(r => r.itemIds));
  const fresh: T[] = [];
  const covered: T[] = [];
  for (const d of detections) (d.ledgerItemIds.some(id => ids.has(id)) || namedBy(namingWords(d.what, caseNames), declared, caseNames) ? covered : fresh).push(d);
  return { fresh, covered };
}

// The asking sentences the model may have left an ask in (round 5 Task 50, A4):
// this decides only whether code waits for the message's classifier — what is
// answered is decided per detection (uncoveredAsks). A sentence counts as
// declared only when each of its list clauses (split as coverageOf splits a list:
// commas, "and", "or", "plus") is named by a declaration (namedBy); a clause with
// no naming word asks nothing. Fix round 1 (review): "do we have the projected
// price point and volume, and the cost structure for the chickpea line?" (Jasmine
// t1) with only the price point declared still waits — its cost-structure ask is
// answered.
const LIST_SPLIT = /,\s*(?:and\s+|or\s+)?|\s+(?:and|or|plus)\s+/i;
export function undeclaredSentences(sentences: string[], declared: { what: string }[], caseNames: string[] = []): string[] {
  return sentences.filter(s => s.split(LIST_SPLIT).some(clause => {
    const words = namingWords(clause, caseNames);
    return words.size > 0 && !namedBy(words, declared, caseNames);
  }));
}
