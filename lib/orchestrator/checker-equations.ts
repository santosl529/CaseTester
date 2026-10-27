// The checker's per-message equations and answer sheet (Phase 1, switch
// `checkerEquations`; Lorenzo's ruling of 27 Oct, item E).
//
// Two additions to the math checker's existing per-message output — no second
// model call:
//
//   (a) EQUATIONS HEARD — every calculation the candidate states, in structured
//       form: the operands with their scale and unit, the operator, the stated
//       result, the candidate's own words, and the model's confidence that it
//       heard the sentence right. The model only *transcribes*: **code verifies
//       the arithmetic exactly**, with the same bands the text reader uses, and
//       a low-confidence entry is `unclear` whatever the numbers say.
//   (b) ANSWER SHEET — each quantity's latest value with a short label, changes
//       only, each change naming the figure it replaces. Before any probe or
//       correction goes out, code drops it when the sheet shows the figure is
//       no longer the candidate's latest.
//
// Why the model is allowed near this at all: the deterministic reader
// (`arithmetic-check.ts`) parses a *written* chain well and real speech badly —
// 0 claims over the 131 recorded voice turns before `speechNormalization`, 6
// after. Hearing the equation is the part a model is good at and code is not;
// deciding whether it is right is the part code is good at and a model is not.
// So the model hears and code judges, and nothing the model says about
// correctness is read at all.
//
// Everything here is pure. No API call, no I/O.
import { z } from 'zod';
import { normalizeNumberWords } from '@/lib/number-words';
import { verdictFor, type ArithmeticVerdict } from './arithmetic-check';

export const SCALES = { none: 1, thousand: 1e3, million: 1e6, billion: 1e9 } as const;
export type EquationScale = keyof typeof SCALES;

const OperandSchema = z.object({
  value: z.number(),                                     // as said, before the scale word
  scale: z.enum(['none', 'thousand', 'million', 'billion']),
  unit: z.string(),                                      // "%", "points", "$", "months", "" …
});

export const EquationSchema = z.object({
  quoted: z.string(),            // the candidate's own words for this calculation, verbatim
  operands: z.array(OperandSchema),
  operator: z.enum(['+', '-', '*', '/']),
  statedResult: OperandSchema,
  confidence: z.enum(['high', 'medium', 'low']),
});
export type Equation = z.infer<typeof EquationSchema>;

export const AnswerSheetEntrySchema = z.object({
  label: z.string(),             // a short name for the quantity
  value: z.number(),
  scale: z.enum(['none', 'thousand', 'million', 'billion']),
  unit: z.string(),
  supersedes: z.string(),        // the earlier figure this replaces, as they said it ('' if new)
  quoted: z.string(),            // the words it comes from, verbatim
});
export type AnswerSheetEntry = z.infer<typeof AnswerSheetEntrySchema>;

// The block that asks for them. Behind the switch, so the prompt is byte-identical off.
export const EQUATIONS_INSTRUCTIONS = `
EQUATIONS HEARD ("equations")
Also transcribe every calculation the candidate states in the latest message, whether you think it right or wrong — you are not judging these, code checks the arithmetic itself. One entry per calculation: "operands" in the order said (each with the figure as said, its scale word, and its unit), the "operator" between them, the "statedResult" they give, and "quoted" — their own words for it, copied verbatim from the message. A chain that mixes operators is entered as the sub-calculations it is made of. A calculation with no stated result is not an entry. "confidence" is how sure you are that you heard the sentence right (speech-to-text drops words and runs sentences together), not how sure you are that it is correct: "low" when the words are broken or the figure could be read more than one way.

ANSWER SHEET ("answerSheet")
And list the quantities whose value CHANGED in this message — only those, none of the rest: a short "label", the latest "value" with its scale and unit, "supersedes" (the earlier figure it replaces, as the candidate said it, or "" if the quantity is new), and "quoted", their words for it. A figure they withdraw, redo or restate differently is a change.`;

// ── (a) code verifies the arithmetic ────────────────────────────────────────

export type EquationCheck = {
  quoted: string;
  expression: string;
  computed: number;
  stated: number;
  verdict: ArithmeticVerdict;
  why: string;                   // why it is unclear, when it is unclear for a reason other than the bands
};

const scaled = (o: { value: number; scale: EquationScale }) => o.value * SCALES[o.scale];
const MONEY = /\$|dollar|usd/i;
const SHARE = /%|percent|point|pp\b/i;
const HEDGE = /\b(?:about|roughly|around|approximately|approx|nearly|almost|call it|ish|like|maybe|say)\b|~|≈/i;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

const figuresIn = (text: string) =>
  [...normalizeNumberWords(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

// The candidate said it: every figure in the entry is one of the message's, and
// the quoted words are the message's words. A paraphrase or a figure the model
// supplied itself cannot be audited, so it is never a flag.
function unquoted(e: Equation, message: string): string | null {
  const said = figuresIn(message);
  const present = (o: { value: number; scale: EquationScale }) =>
    said.some(n => near(n, o.value)) || said.some(n => near(n, scaled(o)));
  const missing = [...e.operands, e.statedResult].find(o => !present(o));
  if (missing) return `the message does not state ${missing.value}`;
  const q = squash(e.quoted);
  if (!q) return 'no quoted words';
  if (!squash(message).includes(q)) return 'the quoted words are not the candidate\'s';
  return null;
}

export function verifyEquation(e: Equation, message: string): EquationCheck {
  const values = e.operands.map(scaled);
  const stated = scaled(e.statedResult);
  const expression = `${e.operands.map(o => `${o.value}${o.scale === 'none' ? '' : ` ${o.scale}`}${o.unit}`).join(` ${e.operator} `)} = ${e.statedResult.value}${e.statedResult.scale === 'none' ? '' : ` ${e.statedResult.scale}`}${e.statedResult.unit}`;
  const unclear = (why: string, computed = NaN): EquationCheck => ({ quoted: e.quoted, expression, computed, stated, verdict: 'unclear', why });
  if (e.operands.length < 2) return unclear('fewer than two operands');
  if (!values.every(Number.isFinite) || !Number.isFinite(stated)) return unclear('a figure is not finite');
  if (e.operator === '/' && values.slice(1).some(v => v === 0)) return unclear('a division by zero');
  const computed = values.reduce((a, b) => (e.operator === '+' ? a + b : e.operator === '-' ? a - b : e.operator === '*' ? a * b : a / b));
  if (!Number.isFinite(computed)) return unclear('the left side is not finite');
  // Low confidence is `unclear` whatever the arithmetic says: the sentence may
  // not be the sentence the candidate spoke.
  if (e.confidence === 'low') return unclear('the checker is not sure it heard the sentence right', computed);
  const why = unquoted(e, message);
  if (why) return unclear(why, computed);
  const all = [...e.operands, e.statedResult];
  const share = all.some(o => SHARE.test(o.unit));
  const hedge = HEDGE.test(e.quoted);
  const verdict = verdictFor(stated, computed, share, hedge, all.some(o => o.scale !== 'none' || MONEY.test(o.unit)));
  if (verdict !== 'incorrect') return { quoted: e.quoted, expression, computed, stated, verdict, why: '' };
  // Two readings the deterministic reader already allows, and this check did not — both
  // measured on the 16-message extractor run of 27 Oct, where 3 of the 5 `incorrect`
  // verdicts were false and all 3 were one of these shapes. A false flag making the
  // interviewer doubt correct work is the harm this whole checker is tuned against, so
  // they are applied in the safe direction only: a verdict may move off `incorrect`,
  // never onto it.
  //
  //   (1) a percent operand read as a growth factor — "a 10% price increase takes
  //       revenue to 126.5" is transcribed as `115 × 10% = 126.5`, and the candidate
  //       means 115 × 1.10. `checkStatedArithmetic` has this rescue already (pctAt →
  //       1 + n/100, multiplicative chains only), and it makes the claim `correct`.
  const factors = e.operands.map(o => (SHARE.test(o.unit) ? 1 + scaled(o) / 100 : scaled(o)));
  if ((e.operator === '*' || e.operator === '/') && factors.some((f, i) => f !== values[i])) {
    const asFactors = factors.reduce((a, b) => (e.operator === '*' ? a * b : a / b));
    if (Number.isFinite(asFactors) && verdictFor(stated, asFactors, share, hedge, true) === 'correct') {
      return { quoted: e.quoted, expression, computed: asFactors, stated, verdict: 'correct', why: '' };
    }
  }
  //   (2) a relative change stated as a percent, transcribed as the difference — "158.8
  //       versus 115 today, that's a 38% price increase" comes through as `158.8 − 115 =
  //       38%`. Here the operator itself may not be the one he meant, so this is `unclear`:
  //       no flag, and no evidence the other way either.
  if ((e.operator === '-' || e.operator === '+') && values.length === 2 && SHARE.test(e.statedResult.unit) && values[1] !== 0) {
    const relative = (values[0] / values[1] - 1) * 100;
    if (Number.isFinite(relative) && verdictFor(stated, relative, true, hedge) === 'correct') {
      return unclear('the operands read as a relative change give their figure — the transcribed operator may not be the one they meant', computed);
    }
  }
  return { quoted: e.quoted, expression, computed, stated, verdict, why: '' };
}

export const verifyEquations = (equations: Equation[], message: string) => equations.map(e => verifyEquation(e, message));

// ── (b) the answer sheet drops a stale line ─────────────────────────────────

// Lorenzo, 27 Oct: before any probe or correction, code drops it if the answer
// sheet shows the figure is no longer the candidate's latest. The match is on
// the figure, not on the label — an entry declares which earlier figure it
// replaces, and the replacement must itself be a figure the candidate said, so
// code never drops a line on a quantity it only guessed at.
// A figure with what the words around it say it is. The match below needs this because
// the numbers alone are not enough: the 27 Oct extractor run dropped a probe on the
// candidate's "1.4x" ratio against a sheet entry that superseded "$1.4m net" — the same
// digits, a different quantity, and a line that should have been spoken was silenced by a
// coincidence. A false drop is a missed real error, so kinds that are both known and
// different, or explicit scales that disagree, are not a match.
type FigureKind = 'usd' | 'share' | 'ratio' | 'unknown';
type Figure = { v: number; kind: FigureKind; scale: number | null };
const FIGURE_RE = /(\$)?\s*(\d[\d,]*(?:\.\d+)?)\s*(%|percent|points?|pp|x|times|k|m|bn?|thousand|million|billion|dollars?|cents?)?/gi;
const SCALE_WORD: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

export function figuresWithKind(text: string): Figure[] {
  return [...normalizeNumberWords(text).matchAll(FIGURE_RE)].map(m => {
    const suffix = (m[3] ?? '').toLowerCase();
    const scale = SCALE_WORD[suffix] ?? null;
    const kind: FigureKind = m[1] || /^(?:dollars?|cents?)$/.test(suffix) ? 'usd'
      : /^(?:%|percent|points?|pp)$/.test(suffix) ? 'share'
        : /^(?:x|times)$/.test(suffix) ? 'ratio' : 'unknown';
    return { v: parseFloat(m[2].replace(/,/g, '')), kind, scale };
  });
}

// Two figures may be the same quantity: the same number, and nothing in the words says
// they are different things.
function sameFigure(a: Figure, b: Figure): boolean {
  if (!near(a.v, b.v)) return false;
  if (a.kind !== 'unknown' && b.kind !== 'unknown' && a.kind !== b.kind) return false;
  if (a.scale !== null && b.scale !== null && a.scale !== b.scale) return false;
  return true;
}

export function supersededBy(
  candidateValue: string,
  sheet: AnswerSheetEntry[],
  message: string,
): AnswerSheetEntry | null {
  const theirs = figuresWithKind(candidateValue);
  if (theirs.length === 0) return null;
  const said = figuresIn(message);
  for (const entry of sheet) {
    const replaced = figuresWithKind(entry.supersedes);
    if (replaced.length === 0) continue;
    // The new value has to be the candidate's own, and really a different figure.
    if (!said.some(n => near(n, entry.value)) && !said.some(n => near(n, scaled(entry)))) continue;
    if (!theirs.some(t => replaced.some(r => sameFigure(t, r)))) continue;
    if (theirs.some(t => near(t.v, entry.value) || near(t.v, scaled(entry)))) continue;
    return entry;
  }
  return null;
}

export const staleNote = (e: AnswerSheetEntry) =>
  `no longer their latest: ${e.label} is now ${e.value}${e.scale === 'none' ? '' : ` ${e.scale}`}${e.unit} ("${e.quoted}"), replacing ${e.supersedes}`;
