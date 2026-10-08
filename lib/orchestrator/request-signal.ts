// Guard B detector (7 Oct, batch 17): explicit data asks in the candidate's
// message, by phrasing — deterministic, before the model call. Tuned for
// precision, not recall: it only has to catch a turn where the candidate
// plainly asked for data and the model declared no request at all (Luna's
// Nikhil run: fourteen turns of "could I get…" with nothing declared).
// Statement-form asks without these phrasings ("this hinges on volume") are
// left to the model, as today.

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
