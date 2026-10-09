// Guard B detector (7 Oct, batch 17): explicit data asks in the candidate's
// message, by phrasing — deterministic, before the model call. Tuned for
// precision, not recall: it only has to catch a turn where the candidate
// plainly asked for data and the model declared no request at all (Luna's
// Nikhil run: fourteen turns of "could I get…" with nothing declared).
// Statement-form asks without these phrasings ("this hinges on volume") are
// left to the model, as today.
import type { Phase } from './state-machine';
import { DATA_NOUN, isQuestionSentence, sentencesOf } from './stall';

const CUES: [label: string, pattern: RegExp][] = [
  ['could I get', /\b(could|can|may)\s+(i|we)\s+(get|have|see)\b/i],
  ['do we have', /\bdo\s+(we|you)\s+have\b/i],
  ['is there data', /\bis\s+there\s+(any\s+)?(data|information|a\s+breakdown|a\s+split)\b/i],
  ["I'd want the", /\b(i'?d|i\s+would)\s+(want|need|like)\s+(the|a|an|some|any|to\s+see|to\s+know|to\s+get)\b/i],
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
  /\bdo\s+(we|you)\s+know\b/i,
  /\bany\s+(data|numbers|figures|information)\s+on\b/i,
];
const WANT_CUE = CUES.find(([label]) => label === "I'd want the")![1];
// Before the brainstorm "I'd want the…" is usually an ask; later it is usually
// a next step (plan-turn.ts, guard B) — unless the sentence is a question.
const WANT_ASK_PHASES: Phase[] = ['INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS', 'EXHIBIT'];
// stall.ts's case nouns, plus the store count (prof-001's scoping facts).
const ASK_DATA_NOUN = /\b(stores?|counts?)\b/i;
// A list that continues an ask: "Could I get: one, …. Two, …." or bullets.
const LIST_ITEM = /^(?:(?:two|three|four|five|six|seven|eight|nine|ten|second(?:ly)?|third(?:ly)?|fourth|fifth|finally|lastly)\b|\d+[.)]\s|[-•*]\s)/i;

function asksAddressed(sentence: string, phase: Phase): boolean {
  if (ADDRESSED_CUES.some(re => re.test(sentence))) return true;
  if (WANT_CUE.test(sentence) && (WANT_ASK_PHASES.includes(phase) || sentence.endsWith('?'))) return true;
  return isQuestionSentence(sentence) && (DATA_NOUN.test(sentence) || ASK_DATA_NOUN.test(sentence));
}

// The sentences of the message that ask the interviewer for data — by an
// addressed-ask cue, or as a question about case data — with any enumerated
// list that follows one.
export function addressedAskSentences(text: string, phase: Phase): string[] {
  const out: string[] = [];
  let inAsk = false;
  for (const s of sentencesOf(text)) {
    inAsk = asksAddressed(s, phase) || (inAsk && LIST_ITEM.test(s));
    if (inAsk) out.push(s);
  }
  return out;
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
// (dropped). One asking sentence and one detection are a match; otherwise a
// detection needs a content word in common with an asking sentence.
export function matchAskDetections<T extends { what: string }>(sentences: string[], detections: T[]): { kept: T[]; dropped: T[] } {
  if (sentences.length === 0) return { kept: [], dropped: [...detections] };
  if (sentences.length === 1 && detections.length === 1) return { kept: [...detections], dropped: [] };
  const asked = contentWords(sentences.join(' '));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const d of detections) ([...contentWords(d.what)].some(w => asked.has(w)) ? kept : dropped).push(d);
  return { kept, dropped };
}
