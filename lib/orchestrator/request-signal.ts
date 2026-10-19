// Guard B detector (7 Oct, batch 17): explicit data asks in the candidate's
// message, by phrasing — deterministic, before the model call. Tuned for
// precision, not recall: it only has to catch a turn where the candidate
// plainly asked for data and the model declared no request at all (Luna's
// Nikhil run: fourteen turns of "could I get…" with nothing declared).
// Statement-form asks without these phrasings ("this hinges on volume") are
// left to the model, as today.
import type { Phase } from './state-machine';
import { normalizeNumberWords } from '@/lib/number-words';
import { DATA_NOUN, isQuestionSentence, sentencesOf } from './stall';

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
// Before the brainstorm "I'd want the…" is usually an ask; later it is usually
// a next step (plan-turn.ts, guard B) — unless the sentence is a question.
export const WANT_ASK_PHASES: Phase[] = ['INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS', 'EXHIBIT'];
// stall.ts's case nouns, plus the store count (prof-001's scoping facts).
const ASK_DATA_NOUN = /\b(stores?|counts?)\b/i;
// A list that continues an ask: "Could I get: one, …. Two, …." or bullets.
const LIST_ITEM = /^(?:(?:one|first(?:ly)?|two|three|four|five|six|seven|eight|nine|ten|second(?:ly)?|third(?:ly)?|fourth|fifth|finally|lastly)\b|\d+\)\s|[-•*]\s)/i;

// "Do we know how many stores…" asks; "Do you know what worries me?" is
// rhetorical (fix round 2). It counts only before a quantity ("how many",
// "how much") or a case figure ("the / our / what the … store count"), or
// "whether / if" with a data noun or a number ("whether the 30% is
// negotiable" — Lorenzo, 19 Oct; batch 32 Aldermoor Marcus t19).
const DO_KNOW = /\bdo\s+(?:we|you)\s+know\s+(.*)$/i;
const isDataNoun = (t: string) => DATA_NOUN.test(t) || ASK_DATA_NOUN.test(t);
function doKnowAsk(sentence: string): boolean {
  const rest = DO_KNOW.exec(sentence)?.[1];
  if (rest === undefined) return false;
  if (/^how\s+(many|much)\b/i.test(rest)) return true;
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

function asksAddressed(sentence: string, phase: Phase, given: number[] = []): boolean {
  if (cueAsk(sentence)) return true;
  if (WANT_CUE.test(sentence) && (WANT_ASK_PHASES.includes(phase) || sentence.endsWith('?'))) return true;
  if (!isQuestionSentence(sentence)) return false;
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
  if (!isQuestionSentence(s) || cueAsk(s)) return false;
  const after = sentences.slice(i + 1);
  if (after.length === 0 || after.every(x => isQuestionSentence(x))) return false;
  return EITHER_OR.test(s) || SELF_FRAME.test(sentences[i - 1] ?? '');
}

// The sentences of the message that ask the interviewer for data — by an
// addressed-ask cue, or as a question about case data — with any enumerated
// list that follows one. At the close, a rhetorical question is none.
// "1. Store count" would split after "1.": numbered lines become "1) …".
const askSentencesOf = (text: string) => sentencesOf(text.replace(/(^|\n)\s*(\d+)[.)]\s+/g, '$1$2) '));
export function addressedAskSentences(text: string, phase: Phase, opts: { closing?: boolean; given?: number[] } = {}): string[] {
  const out: string[] = [];
  let inAsk = false;
  const sentences = askSentencesOf(text);
  sentences.forEach((s, i) => {
    inAsk = (asksAddressed(s, phase, opts.given) && !(opts.closing && rhetorical(sentences, i))) || (inAsk && LIST_ITEM.test(s));
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
  const given = caseTexts.flatMap(numbersIn);
  return addressedAskSentences(text, phase, { closing: true, given }).length > 0 ? ['addressed ask'] : [];
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
export function matchAskDetections<T extends { what: string }>(sentences: string[], detections: T[]): { kept: T[]; dropped: T[] } {
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
