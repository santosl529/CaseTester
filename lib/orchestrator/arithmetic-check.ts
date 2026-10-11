// Stated arithmetic, checked in code (round-3 fixes, 11 Oct 2026). A candidate
// who writes "16 divided by 18 is 1.6%" or "0.25 × 40 = 10" has made a claim
// that needs no case data to verify: the operation is on the page. Until now
// only a case's authored math steps could verify or flag a figure, so most of
// a candidate's working was "unverified" — and an interviewer challenge on it
// could be neither backed nor refuted (batch 18: Owen's correct "58/42 =
// 1.38" was doubted and he conceded; Maya's "16 divided by 18 is 1.6%" was a
// real slip the probe guard then cut half of).
//
// Three outcomes per claim, never two: correct, incorrect, or unclear. The
// bands are deliberately wide — candidates round ("≈ 28", "call it 67") — so
// a rounding is never "incorrect": incorrect needs the stated result to miss
// by more than 10% (15% when the candidate marks it approximate), and correct
// needs it within 3% (7% approximate). Anything between is unclear, and
// unclear is not evidence either way.
//
// Parsed: numbers (digits, or number words via normalizeNumberWords) joined by
// ×, x (spaced), *, times, multiplied by, /, ÷, divided by, over, +, plus,
// − / - (spaced), minus; a result after =, ≈, ~, →, is, equals, gives, comes
// to, gets you, which is, that's. A word that is none of these, or a comma,
// semicolon, colon or bracket, ends the expression — "25% of COGS" is not an
// operation, and "= 10, plus 0.75 × 37.5 = 28.1" is two claims, not one.
// Percent shorthand ("25 × 42 = 10.5", "16/18 = 89%") and growth read off a
// ratio ("66.7/42 ≈ 59%" — up 59%) count as correct when a % is in the claim.
import { normalizeNumberWords } from '@/lib/number-words';

export type ArithmeticVerdict = 'correct' | 'incorrect' | 'unclear';

export type ArithmeticClaim = {
  span: string;        // the sentence the claim is in, as normalized
  expression: string;  // the left side as written ("16 / 18")
  stated: number;      // the candidate's result
  computed: number;    // the left side evaluated
  verdict: ArithmeticVerdict;
  approximate: boolean;
  selfCorrected: boolean;  // an incorrect claim the candidate fixed in the same message
};

type Tok =
  | { t: 'num'; v: number; pct: boolean; scaled: boolean; raw: string }  // v carries its scale ($480M → 480e6)
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'eq' }
  | { t: 'approx' }
  | { t: 'break' };

const APPROX = /^(?:about|roughly|around|approximately|approx\.?|nearly|almost|basically|~|≈|call it|say|maybe|like|ish)$/i;

// Word operators need a word boundary on both sides ("over" is not
// "overhead", "is" is not "issue").
const W = (alts: string) => new RegExp(`^(?:${alts})(?![a-z'])`, 'i');
// Thousands separators only in groups of three ("353,000"; "10, plus" is a comma).
const NUMBER = /^\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:\s?(%|percent(?![a-z])|pp(?![a-z])|points?(?![a-z])|pts(?![a-z]))|(m|mm|mn|bn|b|k)(?![a-z]))?/i;
const SCALE: Record<string, number> = { m: 1e6, mm: 1e6, mn: 1e6, b: 1e9, bn: 1e9, k: 1e3 };
// A result introduced after a comma: "16 divided by 18, that's about 1.6%".
const EQ_AFTER_COMMA = /^,\s*(?:(?:about|roughly|around|approximately|so|which is|that'?s|thats|gives(?: you| us)?|=|≈|~)(?![a-z']))/i;

// Ordered: longest phrases first.
const LEXEMES: [RegExp, (m: RegExpMatchArray) => Tok][] = [
  [W('multiplied by|times'), () => ({ t: 'op', v: '*' })],
  [/^[×*]/, () => ({ t: 'op', v: '*' })],
  [/^x(?=\s)/i, () => ({ t: 'op', v: '*' })],
  [W('divided by|over'), () => ({ t: 'op', v: '/' })],
  [/^[÷/]/, () => ({ t: 'op', v: '/' })],
  [W('plus'), () => ({ t: 'op', v: '+' })],
  [/^\+(?=\s|\d)/, () => ({ t: 'op', v: '+' })],
  [W('minus'), () => ({ t: 'op', v: '-' })],
  [/^−/, () => ({ t: 'op', v: '-' })],
  [/^-(?=\s)/, () => ({ t: 'op', v: '-' })],
  [/^~(?!=)/, () => ({ t: 'approx' })],
  [/^(?:=|→|->)/, () => ({ t: 'eq' })],
  [W("comes to|gets you|gives you|gives us|gives|which is|that's|thats|equals|is|are"), () => ({ t: 'eq' })],
  [W('approximately|roughly|around|about|nearly|almost|call it|approx'), () => ({ t: 'approx' })],
];

function tokenize(sentence: string): Tok[] {
  const out: Tok[] = [];
  let s = sentence;
  while (s.length > 0) {
    const ws = /^\s+/.exec(s);
    if (ws) { s = s.slice(ws[0].length); continue; }
    if (EQ_AFTER_COMMA.test(s)) { s = s.slice(1); continue; }
    if (/^[,;:()[\]]/.test(s)) { out.push({ t: 'break' }); s = s.slice(1); continue; }
    const n = NUMBER.exec(s);
    if (n) {
      s = s.slice(n[0].length);
      // A number glued to letters ("1.15x", "2nd", "2-thirds", "18-point") is not an operand.
      if (/^-?[a-z]/i.test(s)) { out.push({ t: 'break' }); s = s.replace(/^-?[a-z]+/i, ''); continue; }
      const scale = n[3] ? SCALE[n[3].toLowerCase()] : 1;
      out.push({ t: 'num', v: parseFloat(n[1].replace(/,/g, '')) * scale, pct: Boolean(n[2] && /%|percent/i.test(n[2])), scaled: scale !== 1, raw: n[0].trim() });
      continue;
    }
    // "≈" / "~=" are both: an approximate result follows.
    const approxEq = /^(?:≈|~=)/.exec(s);
    if (approxEq) { out.push({ t: 'approx' }, { t: 'eq' }); s = s.slice(approxEq[0].length); continue; }
    const hit = LEXEMES.find(([re]) => re.test(s));
    if (hit) {
      const m = hit[0].exec(s)!;
      out.push(hit[1](m));
      s = s.slice(m[0].length);
      continue;
    }
    const word = /^[^\s,;:()[\]]+/.exec(s)![0];
    out.push(APPROX.test(word) ? { t: 'approx' } : { t: 'break' });
    s = s.slice(word.length);
  }
  return out;
}

type Expr = { nums: number[]; ops: ('+' | '-' | '*' | '/')[]; pct: boolean; scaled: boolean; raw: string[]; pctAt: number[] };

function evaluate(e: Expr): number | null {
  if (e.nums.length !== e.ops.length + 1) return null;
  // * and / first, then + and -.
  const terms: number[] = [e.nums[0]];
  const addOps: ('+' | '-')[] = [];
  for (let i = 0; i < e.ops.length; i++) {
    const op = e.ops[i], n = e.nums[i + 1];
    if (op === '*') terms[terms.length - 1] *= n;
    else if (op === '/') { if (n === 0) return null; terms[terms.length - 1] /= n; }
    else { addOps.push(op); terms.push(n); }
  }
  return terms.slice(1).reduce((acc, t, i) => (addOps[i] === '+' ? acc + t : acc - t), terms[0]);
}

const rel = (a: number, b: number) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));

// The smallest relative miss of `stated` against `computed`, allowing percent
// shorthand (powers of 100) and growth read off a ratio when a % is present.
function bestMiss(stated: number, computed: number, pct: boolean, scaled: boolean): number {
  // Shares are written either way ("0.06 × 1.15 = 6.9", "25 × 42 = 10.5"):
  // a factor of 100 (or 100²) is a percent reading, never an error by itself.
  const readings = [computed, computed * 100, computed / 100, computed * 1e4, computed / 1e4];
  if (pct) readings.push((computed - 1) * 100);
  // "451 ÷ 0.76 = $594M": operands in millions without the suffix.
  if (scaled) for (const k of [1e3, 1e6, 1e9]) readings.push(computed * k, computed / k);
  return Math.min(...readings.map(r => rel(stated, r)));
}

export function verdictFor(stated: number, computed: number, pct: boolean, approximate: boolean, scaled = false): ArithmeticVerdict {
  const miss = bestMiss(stated, computed, pct, scaled);
  if (miss <= (approximate ? 0.07 : 0.03)) return 'correct';
  // Tiny absolute differences are rounding whatever the ratio says (0.04 vs 0.035).
  if (Math.abs(stated) < 1 && Math.abs(stated - computed) < 0.06) return 'unclear';
  if (miss > (approximate ? 0.15 : 0.10)) return 'incorrect';
  return 'unclear';
}

const SENTENCES = /(?<=[.!?])\s+(?=[A-Z0-9"“$(])|\n+/;

export function checkStatedArithmetic(rawText: string): ArithmeticClaim[] {
  const claims: ArithmeticClaim[] = [];
  for (const raw of normalizeNumberWords(rawText).split(SENTENCES)) {
    const sentence = raw.trim();
    if (!sentence || !/\d/.test(sentence)) continue;
    const toks = tokenize(sentence);
    let left: Expr | null = null;      // the expression before an equals
    let cur: Expr = { nums: [], ops: [], pct: false, scaled: false, raw: [], pctAt: [] };
    let approx = false;
    let expectOperand = true;
    const reset = () => { left = null; cur = { nums: [], ops: [], pct: false, scaled: false, raw: [], pctAt: [] }; approx = false; expectOperand = true; };
    const settle = () => {
      // A claim: an operation on the left, a single number on the right.
      if (left && cur.nums.length === 1 && cur.ops.length === 0 && left.ops.length > 0) {
        const lv = evaluate(left), rv = evaluate(cur);
        if (lv !== null && rv !== null && Number.isFinite(lv) && Number.isFinite(rv)) {
          const pct = left.pct || cur.pct;
          let verdict = verdictFor(rv, lv, pct, approx, left.scaled || cur.scaled);
          // Growth written as percents: "15% ÷ 1.10 ≈ 4.5%" is 1.15 / 1.10 → up 4.5%.
          if (verdict !== 'correct' && left.pctAt.length > 0 && left.ops.every(o => o === '*' || o === '/')) {
            const asFactors = evaluate({ ...left, nums: left.nums.map((n, i) => (left!.pctAt.includes(i) ? 1 + n / 100 : n)) });
            if (asFactors !== null && verdictFor(rv, asFactors, true, approx) === 'correct') verdict = 'correct';
          }
          claims.push({
            span: sentence, expression: left.raw.join(' '), stated: rv, computed: lv,
            verdict, approximate: approx, selfCorrected: false,
          });
        }
      }
    };
    for (const tok of toks) {
      if (tok.t === 'approx') { approx = true; continue; }
      if (tok.t === 'break') {
        settle();
        reset();
        continue;
      }
      if (tok.t === 'num') {
        if (!expectOperand) { settle(); reset(); }
        if (tok.pct) cur.pctAt.push(cur.nums.length);
        cur.nums.push(tok.v); cur.pct ||= tok.pct; cur.scaled ||= tok.scaled; cur.raw.push(tok.raw.trim());
        expectOperand = false;
        continue;
      }
      if (tok.t === 'op') {
        if (expectOperand) continue;  // a leading operator ("plus 0.75 × …") starts nothing
        cur.ops.push(tok.v); cur.raw.push(tok.v === '*' ? '×' : tok.v === '/' ? '/' : tok.v);
        expectOperand = true;
        continue;
      }
      // equals
      if (expectOperand || cur.nums.length === 0) { reset(); continue; }
      settle();
      left = cur;
      cur = { nums: [], ops: [], pct: false, scaled: false, raw: [], pctAt: [] };
      expectOperand = true;
    }
    settle();
  }
  return markSelfCorrections(normalizeNumberWords(rawText), claims);
}

const CORRECTION_MARKER = /\b(?:wait|no,|sorry,? (?:that'?s|it'?s|i meant)|oops|actually|i mean|let me redo|scratch that|correction|that'?s wrong|my mistake)\b/i;

// An incorrect claim is a slip the candidate caught when, in the same
// message, a correct claim of the same expression follows, or a correction
// marker ("wait", "no,", "actually") follows the stated result and the right
// value comes after it ("= 94 — wait, that's 76"). An apology alone is not a
// correction (batch 18, Maya: "1.6%… Sorry, let me think. Yeah, around 1.6%").
function markSelfCorrections(text: string, claims: ArithmeticClaim[]): ArithmeticClaim[] {
  return claims.map((c, i) => {
    if (c.verdict !== 'incorrect') return c;
    if (claims.slice(i + 1).some(o => o.expression === c.expression && o.verdict === 'correct')) return { ...c, selfCorrected: true };
    const at = text.indexOf(c.span);
    if (at < 0) return c;
    const window = text.slice(at, at + c.span.length + 200);
    const result = window.search(new RegExp(`(?<![\\d.])${String(c.stated).replace('.', '\\.')}(?![\\d])`));
    const tail = result >= 0 ? window.slice(result + String(c.stated).length) : window;
    const marker = CORRECTION_MARKER.exec(tail);
    if (!marker) return c;
    const after = tail.slice(marker.index);
    const fixed = [...after.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')))
      .some(n => verdictFor(n, c.computed, true, true, false) === 'correct');
    return fixed ? { ...c, selfCorrected: true } : c;
  });
}
