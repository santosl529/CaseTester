// What an interviewer sentence does to the candidate's math (round-3 fixes,
// 11 Oct 2026): doubt it, ask how it was done, or neither. Batch 18: the
// interviewer cast doubt on correct math in 14 interviews — 9 from a keyword
// unit hint, 5 on its own ("Revenue grew 15% — is that the right base?",
// "your 43.3 points assumes the same volume against flat prices, while revenue
// grew 15%"; with menu prices flat, the candidates were right).
//
// The read is structural, not a list of phrasings: a sentence is about the
// candidate's math when it names one of their figures or their work ("your
// arithmetic", "that conversion", "points of what"), and it DOUBTS it when it
//   - asks about correctness or consistency ("is that the right base?",
//     "does that change your 53.8?", "how does that square with…?"),
//   - sets a counter-premise against it ("…, but revenue has since grown"),
//   - or asserts an error ("that doesn't add up", "you've double-counted").
// It EXPLAINS when it asks for the working ("walk me through", "how did you
// get there?") without doubting. Whether a doubt may be spoken is decided by
// what code verified (probe-guard.ts), never by the sentence.
import { normalizeNumberWords } from '@/lib/number-words';

export type MathTalkKind = 'doubt' | 'explain' | 'none';
export type MathTalk = { kind: MathTalkKind; figures: number[]; why: string };

// A figure the sentence holds as the candidate's own: "your 53.8", "that
// 66.7", "the 53.8 you're comparing". A figure used as the yardstick ("does
// the effect match the 16-point increase?") is not.
function ownsFigure(s: string, figures: number[]): boolean {
  return figures.some(f => {
    const n = String(f).replace('.', '\\.');
    return new RegExp(String.raw`\b(?:your|that|this|those|these)\s+(?:\$\s?)?${n}(?![\d])|(?<![\d.])${n}(?:%|\s*(?:points?|percent))?[^.?!]{0,25}\byou(?:'re|'ve| are| have)?\b`, 'i').test(s);
  });
}

const CALC_NOUN = String.raw`(?:math|maths|arithmetic|calculations?|calc|figures?|numbers?|estimates?|derivation|build|reconciliation|base|units?|ratio|sum|result|answer|index(?:ed|ing)?|conversion|weighting|multiplier|blend(?:ed)?|residual|decomposition|bridge|sizing)`;
// The candidate's work: "your arithmetic", "you indexed everything", "that conversion".
const WORK_REF = new RegExp(String.raw`\b(?:your|you'?ve|you have|you)\b[^.?!]{0,40}?\b${CALC_NOUN}\b|\b(?:that|this|the)\s+(?:${CALC_NOUN})\b(?=[^.?!]*\b(?:you|your)\b)|\bpoints of what\b|\bof what\b\s*\??$`, 'i');

// A bare doubt about whatever was just said ("Are you sure?", "Is that right?").
const BARE_DOUBT = new RegExp(String.raw`^(?:hmm[,.]?\s*)?(?:are you (?:sure|certain)|is (?:that|this|it) (?:the )?(?:right|correct)(?:\s+${CALC_NOUN})?|double[- ]check (?:that|it)|check (?:that|your math) again)\b[^.?!]{0,30}[?.!]?$`, 'i');
const POINTS_OF_WHAT = /\b(?:points|percent|percentage points) of what\b|\b(?:of|in) what units\b|\bpoints of what\b/i;
// Correctness asked as a question ("is that the right base?", "are you sure?").
const CORRECTNESS_Q = /\b(?:right|correct|accurate|valid|consistent|wrong|off|true|sure|certain)\b/i;
// Consistency or impact on the figure, asked ("does that change your 53.8?",
// "how does that square with…", "does it hold up?").
const CONSISTENCY_Q = /\b(?:change[sd]?|affect(?:s|ed)?|alter(?:s|ed)?|reconcil\w*|squares?|hold(?:s)?(?: up)?|adds? up|ties? (?:out|back)|match(?:es)?|fits?|lines? up|double[- ]count\w*)\b/i;
// A counter-premise set against the figure: "…, but revenue has since grown".
const COUNTER = /\b(?:but|while|whereas|however|yet|although|though)\b\s+(?!(?:what|how|which|why|where|when|who|is|are|does|do|can|could|would)\b)/i;
// An error asserted outright.
const ASSERTED_ERROR = /\b(?:not (?:quite )?(?:right|correct)|isn'?t (?:quite )?(?:right|correct)|doesn'?t (?:add up|hold|work|tie)|that'?s (?:wrong|off|not right|incorrect)|(?:you'?ve|you have|you) (?:double[- ]counted|mixed (?:up )?|confused|dropped|forgot(?:ten)?|missed (?:the|a))|(?:a|an|the) (?:mistake|error|slip)\b)/i;
const EXPLAIN = /\b(?:walk me through|take me through|how did you (?:get|arrive|land|reach|calculate|compute|come up)|how do you get|explain how|show me how|where does (?:that|this|the)\b[^?]*\bcome from)\b/i;

function numbersIn(text: string): number[] {
  return [...normalizeNumberWords(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);

// A consistency question whose subject is the figure or the work: "does that
// change your 53.8", "does it match the 58%", "does that 66.7 reconcile", "how
// does that affect the 53.8 you're comparing" — not "does volume hold when you
// raise prices?" (a business assumption, pushed back on by Rule 2's Socratic
// probe, not a doubt about the arithmetic).
const PRONOUN_SUBJECT = /\b(?:does|do|did|would|will|can|could|is|are)\s+(?:that|this|it|they|those|these)\b|\b(?:that|this|it)\s+(?:changes?|affects?|alters?|reconciles?|squares?|holds?|adds? up|ties?|matches?|fits?|lines? up)\b/i;
function consistencyOnFigure(s: string, figures: number[]): boolean {
  return s.split(/,\s*|\s+(?:and|but|or)\s+|\s[—–]\s|:\s*/).some(clause => CONSISTENCY_Q.test(clause)
    && (ownsFigure(clause, figures) || WORK_REF.test(clause) || PRONOUN_SUBJECT.test(clause)));
}

// `candidateFigures`: the figures the candidate derived — the numbers they
// wrote, less the case's own (prompt and released data): a sentence that
// cites "revenue grew 15%" is about the case, and correcting a misquote of
// released data ("that 37.5% was given for dairy, not beans") is not doubting
// the candidate's math.
// `previous`: the sentence before it in the same turn — a bare doubt ("Is that
// right?") is about the figure just named there.
export function classifyMathTalk(sentence: string, candidateFigures: number[], previous?: string): MathTalk {
  const s = normalizeNumberWords(sentence.trim());
  const figures = [...new Set(numbersIn(s).filter(n => candidateFigures.some(c => same(n, c))))];
  if (BARE_DOUBT.test(s)) {
    const before = previous ? numbersIn(normalizeNumberWords(previous)).filter(n => candidateFigures.some(c => same(n, c))) : [];
    return { kind: 'doubt', figures: figures.length > 0 ? figures : [...new Set(before)], why: 'bare doubt' };
  }
  const work = WORK_REF.test(s);
  if (figures.length === 0 && !work) return { kind: 'none', figures, why: 'not about the candidate\'s math' };
  const question = s.endsWith('?');
  const owned = work || ownsFigure(s, figures);
  const before = s.split(COUNTER)[0] ?? s;
  if (POINTS_OF_WHAT.test(s)) return { kind: 'doubt', figures, why: 'units questioned' };
  if (ASSERTED_ERROR.test(s)) return { kind: 'doubt', figures, why: 'error asserted' };
  if (question && CORRECTNESS_Q.test(s) && !EXPLAIN.test(s) && owned) return { kind: 'doubt', figures, why: 'correctness asked' };
  if (question && !EXPLAIN.test(s) && owned && consistencyOnFigure(s, figures)) return { kind: 'doubt', figures, why: 'consistency asked' };
  if (!question && COUNTER.test(s) && (WORK_REF.test(before) || ownsFigure(before, figures))) return { kind: 'doubt', figures, why: 'counter-premise' };
  if (EXPLAIN.test(s)) return { kind: 'explain', figures, why: 'working asked for' };
  return { kind: 'none', figures, why: 'about the figure, neither doubt nor working' };
}

// The figures the candidate derived: every number in their turns, less the
// case's own (the prompt, released data values).
export function candidateFiguresOf(texts: string[], caseTexts: string[] = []): number[] {
  const given = new Set(caseTexts.flatMap(numbersIn));
  return [...new Set(texts.flatMap(numbersIn))].filter(n => ![...given].some(g => same(n, g)));
}
