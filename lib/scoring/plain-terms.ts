// Plain English in every report line the candidate reads (Lorenzo, 6 Nov; session 36e78afc: a coverage caveat read
// "The interview entered load-shedding during the exhibit stage, so optional follow-up probes were dropped"). The
// system's own words — load-shedding, the pressure test, probes, stage names as the state machine spells them, rule
// numbers, rubric terms — never reach the page. Three layers: what the judge is fed is worded plainly (assists.ts,
// stage-caps.ts), the judge is told to write plainly (judge.ts), and this pass rewrites what still slips through in
// the free-text lines the page shows as written (coverage caveats, the top fix). Quoted candidate words are never
// touched.
import type { Phase } from '@/lib/orchestrator/state-machine';

// The interview's parts, as a candidate would name them.
export const PHASE_PLAIN: Record<Phase, string> = {
  INTRO: 'the opening', CLARIFY: 'the clarifying questions', STRUCTURE: 'your opening structure',
  ANALYSIS: 'the analysis', EXHIBIT: 'the exhibit discussion', BRAINSTORM: 'the brainstorm',
  RECOMMENDATION: 'the recommendation', WRAP: 'the close', SCORING: 'the end of the interview',
};

// "…" or “…” spans: the candidate's own words, left exactly as they are.
const QUOTED = /"[^"]*"|“[^”]*”/g;

type Rule = [RegExp, string | ((m: string, ...g: string[]) => string)];
const PHASES = Object.keys(PHASE_PLAIN) as Phase[];
const STAGE_PLAIN: Record<string, string> = {
  exhibit: 'exhibit discussion', analysis: 'analysis', brainstorm: 'brainstorm', brainstorming: 'brainstorming',
  recommendation: 'recommendation', structure: 'opening structure', structuring: 'opening structure', risk: 'question on risks',
  clarifying: 'clarifying questions', opening: 'opening', wrap: 'close', 'wrap-up': 'close', close: 'close',
};

const NOUN_LEAD = String.raw`(?:the|a|an|this|that|your|its|their|his|her|one|each|every|any|no)\s+`;
const RULES: Rule[] = [
  // Load-shedding (Rule 15): the interviewer was short of time.
  [/\b(?:entered|went into|hit|reached)\s+(?:a\s+)?load[- ]?shedding(?:\s+(?:window|mode|phase))?\b/gi, 'ran short of time'],
  [/\bload[- ]?shed(?:ding)?\s+(?=(?:the\s+|its\s+)?(?:later|remaining|optional|final|follow-up|other)\b)/gi, 'cut short '],
  [/\bload[- ]?shed\s+(?=\w)/gi, 'cut short '],
  [/\bload[- ]?shedding\b|\bload[- ]?shed\b/gi, 'time pressure'],
  // The pressure test (Rule 7). "the MECE / structure pressure test" and "the pressure-test answer" first, so no
  // phrase doubles up ("the structure follow-up question on your structure").
  [/\b(?:the\s+)?(?:early\s+)?(?:MECE|structure|structural)\s+pressure[- ]?tests?(?:\s+on\s+(?:the|your)\s+structure)?\b/gi, 'the follow-up question on your structure'],
  [/\b(the|your|their|his|her|that)\s+pressure[- ]?test\s+(answer|reply|response)\b/gi, (_m: string, d: string, n: string) => `${d} ${n} to the follow-up question on your structure`],
  [/\bunder\s+pressure[- ]?testing\b/gi, 'when tested'],
  // A noun after an article ("the pressure test"); otherwise the verb ("asked to
  // pressure-test the residual", "pressure-tested the figure") is plain "test".
  [new RegExp(String.raw`\b(${NOUN_LEAD}(?:early\s+|first\s+|second\s+|later\s+)?)pressure[- ]?tests?(?:\s+(?:probe|question))?(?:\s+on\s+(?:the|your)\s+structure)?(?:\s+stage)?\b`, 'gi'),
    (_m: string, lead: string) => `${lead}follow-up question on your structure`],
  [/\bpressure[- ]?tested\b/gi, 'tested'],
  [/\bpressure[- ]?testing\b/gi, 'testing'],
  [/\bpressure[- ]?tests\b(?=\s+\w)/gi, 'tests'],
  [/\bpressure[- ]?test\b(?=\s+(?:the|your|it|them|that|this|his|her|their|a|an)\b)/gi, 'test'],
  [/\bpressure[- ]?tests?(?:\s+on\s+(?:the|your)\s+structure)?\b/gi, 'follow-up question on your structure'],
  // Probes: "probe further/deeper/more" → "dig further"; as a verb with an object → "question"; bare past tense
  // ("when the interviewer probed.") → "pushed back"; as a noun → "follow-up question".
  [/\bprob(?:e|ed|ing)\s+(further|deeper|more)\b/gi, (_m: string, w: string) => `dig ${w}`],
  [/\bfollow-up\s+probes\b/gi, 'follow-up questions'],
  [/\bfollow-up\s+probe\b/gi, 'follow-up question'],
  [/\b(which|that|it|this)\s+probes\b/gi, (_m: string, w: string) => `${w} tests`],
  [/\b(?:the\s+)?(?:MECE|structure|structural)\s+probe\b/gi, 'the follow-up question on your structure'],
  [/\bprobes(?=\s+(?:it|them|that|this|those|your|you|the|a|an|his|her|their|whether|why|how)\b)/gi, 'questions'],
  [/\bprobed(?=\s+(?:it|them|that|this|those|your|you|the|a|an|his|her|their|on|whether|why|how)\b)/gi, 'questioned'],
  [/\b(interviewer|interviewer's follow-up|they|he|she)\s+probed\b/gi, (_m: string, who: string) => `${who} pushed back`],
  [/\bprobed\b/gi, 'questioned'],
  [/\bprobing(?=\s+(?:it|them|that|this|those|your|you|the|a|an|his|her|their|whether|why|how)\b)/gi, 'questioning'],
  [/\b(to|will|would|may|might|could|should|did|does|do|or|and)\s+probe\b(?=\s+(?:it|them|that|this|those|your|you|the|a|an|his|her|their)\b)/gi, (_m: string, aux: string) => `${aux} question`],
  [/\bto\s+probe\b/gi, 'to look into'],
  [/\bprobing\b/gi, 'follow-up questions'],
  [/\bprobes\b/gi, 'follow-up questions'],
  [/\bprobe\b/gi, 'follow-up question'],
  // State-machine names in capitals (EXHIBIT, RECOMMENDATION…): only as whole upper-case words.
  [new RegExp(`\\b(?:the\\s+)?(${PHASES.join('|')})(?:\\s+(?:stage|phase))?\\b`, 'g'), (m: string, p: string) => (m === p || /^the\s/i.test(m) || /\s(stage|phase)$/i.test(m) ? PHASE_PLAIN[p as Phase] : m)],
  // "the exhibit stage" → "the exhibit discussion"; "No brainstorming stage was…" → "No brainstorming was…".
  [/\b(exhibit|analysis|brainstorm(?:ing)?|recommendation|structur(?:e|ing)|risk|clarifying|opening|wrap(?:-up)?|close)\s+(?:stage|phase|module)s?\b/gi,
    (_m: string, w: string) => keepCase(w, STAGE_PLAIN[w.toLowerCase()] ?? w.toLowerCase())],
  // Rule numbers and rubric bookkeeping.
  [/\s*\((?:see\s+)?Rule\s+\d+[A-Z]?(?:\.\d+)?\)/g, ''],
  [/\bRule\s+\d+[A-Z]?(?:\.\d+)?\b/g, 'the interview rules'],
  [/\bmeets[ _]bar\b/gi, 'on track'],
  [/\bneeds[ _]work\b/gi, 'room to improve'],
  [/\bnot[ _]administered\b|\bnever\s+administered\b/gi, 'never asked'],
  [/\b(?:was|were)\s+(?:effectively\s+)?not\s+administered\b/gi, 'was not really tested'],
  [/\badministered\b/gi, 'asked'],
  [/\b(rate|rating|assess|assessing)\s+this dimension\b/gi, (_m: string, v: string) => `${v} this area`],
  [/\bthis dimension\b/gi, 'this area'],
  [/\bsession\s+coverage\b/gi, 'how the interview ran'],
  [/\bcoverage\s+gap\b/gi, 'gap in what the interview covered'],
];

// A word capitalised as a sentence's first word passes its capital on; an all-caps code name doesn't.
const keepCase = (orig: string, rep: string) => {
  const first = orig[0];
  const capital = first === first.toUpperCase() && first !== first.toLowerCase();
  const allCaps = /[a-z]/i.test(orig) && orig === orig.toUpperCase() && orig.replace(/[^A-Za-z]/g, '').length > 1;
  return capital && !allCaps ? rep[0].toUpperCase() + rep.slice(1) : rep;
};

// One report line, in plain words; quoted candidate words untouched.
export function plainReportLine(text: string): string {
  if (!text) return text;
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(QUOTED)) {
    parts.push(rewrite(text.slice(last, m.index)), m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(rewrite(text.slice(last)));
  return parts.join('').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1');
}

function rewrite(s: string): string {
  let out = s;
  // A plain replacement keeps the capital of what it replaces (a sentence's first word).
  for (const [re, rep] of RULES) out = out.replace(re, (typeof rep === 'string' ? (m: string) => keepCase(m, rep) : rep) as never);
  return out;
}

// Internal terms still present outside quotes (measured in tests and on the saved corpus).
const INTERNAL = new RegExp(`load[- ]?shed\\w*|pressure[- ]?test\\w*|\\bthis dimension\\b|\\bprob(?:e|es|ed|ing)\\b|\\bRule\\s+\\d+|\\bmeets[ _]bar\\b|\\bneeds[ _]work\\b|\\badministered\\b|\\b(?:${PHASES.join('|')})\\b|\\b(?:exhibit|analysis|brainstorm(?:ing)?|recommendation|structure|risk)\\s+(?:stage|phase)\\b|\\bsession coverage\\b`, 'g');
export function internalTerms(text: string): string[] {
  return (text ?? '').replace(QUOTED, ' ').match(INTERNAL) ?? [];
}

// Every line of a stored rubric the page shows as written: each dimension's coverage caveat, its items' points and
// plain-words fields, its missed moments, and the top fix (both forms). Ratings, quotes and evidence are untouched.
// Applied when the report is stored (score-session.ts) and when a stored one is shown (report-dimensions.ts), so
// reports scored before this pass read plainly too.
type Obj = Record<string, unknown>;
const PLAIN_FIELDS = ['where', 'what', 'why', 'next'] as const;
function plainItem(it: unknown): unknown {
  if (!it || typeof it !== 'object') return it;
  const o = { ...(it as Obj) };
  for (const k of ['point', 'moment'] as const) if (typeof o[k] === 'string') o[k] = plainReportLine(o[k] as string);
  if (o.plain && typeof o.plain === 'object') {
    const p = { ...(o.plain as Obj) };
    for (const k of PLAIN_FIELDS) if (typeof p[k] === 'string') p[k] = plainReportLine(p[k] as string);
    o.plain = p;
  }
  return o;
}
export function plainRubric<T>(rubric: T): T {
  if (!rubric || typeof rubric !== 'object') return rubric;
  const out = { ...(rubric as Obj) };
  for (const [k, v] of Object.entries(out)) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || !('rating' in (v as Obj))) continue;
    const d = { ...(v as Obj) };
    if (typeof d.coverageCaveat === 'string') d.coverageCaveat = plainReportLine(d.coverageCaveat);
    for (const list of ['wentWell', 'needsWork', 'missedOpportunities'] as const) if (Array.isArray(d[list])) d[list] = (d[list] as unknown[]).map(plainItem);
    out[k] = d;
  }
  if (typeof out.topFix === 'string') out.topFix = plainReportLine(out.topFix);
  if (out.topFixPlain && typeof out.topFixPlain === 'object') {
    const p = { ...(out.topFixPlain as Obj) };
    for (const k of PLAIN_FIELDS) if (typeof p[k] === 'string') p[k] = plainReportLine(p[k] as string);
    out.topFixPlain = p;
  }
  return out as T;
}
