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
  | { t: 'num'; v: number; pct: boolean; scaled: boolean; unit: boolean; raw: string; base?: number; unitWord?: UnitWord }  // v carries its scale ($480M → 480e6); unit: %, points, pp
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
  [W('minus|negative'), () => ({ t: 'op', v: '-' })],
  [/^−/, () => ({ t: 'op', v: '-' })],
  [/^-(?=\s)/, () => ({ t: 'op', v: '-' })],
  [/^~(?!=)/, () => ({ t: 'approx' })],
  [/^(?:=|→|->)/, () => ({ t: 'eq' })],
  [W("comes to|gets you|gives you|gives us|gives|which is|that's|thats|equals|is|are"), () => ({ t: 'eq' })],
  [W('approximately|roughly|around|about|nearly|almost|call it|approx'), () => ({ t: 'approx' })],
];

// A unit noun spoken after the figure ("seventy cents", "three million",
// "$320 million"): today it is an unknown word, so it ends the expression and
// the figure loses its scale. The spoken reader (spokenReadings) absorbs it;
// the live reader never does, so nothing changes with the switch off.
type UnitWord = 'cents' | 'dollars' | 'scale';
const UNIT_AFTER_NUMBER = /^\s*(cents?|dollars?|bucks|thousands?|millions?|billions?)(?![a-z'])/i;
const UNIT_WORDS: Record<string, { kind: UnitWord; factor: number }> = {
  cent: { kind: 'cents', factor: 0.01 }, cents: { kind: 'cents', factor: 0.01 },
  dollar: { kind: 'dollars', factor: 1 }, dollars: { kind: 'dollars', factor: 1 }, bucks: { kind: 'dollars', factor: 1 },
  thousand: { kind: 'scale', factor: 1e3 }, thousands: { kind: 'scale', factor: 1e3 },
  million: { kind: 'scale', factor: 1e6 }, millions: { kind: 'scale', factor: 1e6 },
  billion: { kind: 'scale', factor: 1e9 }, billions: { kind: 'scale', factor: 1e9 },
};

function tokenize(sentence: string, opts?: { units?: boolean }): Tok[] {
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
      const tok: Tok = { t: 'num', v: parseFloat(n[1].replace(/,/g, '')) * scale, pct: Boolean(n[2] && /%|percent/i.test(n[2])), scaled: scale !== 1, unit: Boolean(n[2]), raw: n[0].trim() };
      const unitAfter = opts?.units && !n[2] ? UNIT_AFTER_NUMBER.exec(s) : null;
      if (unitAfter) {
        const u = UNIT_WORDS[unitAfter[1].toLowerCase()];
        tok.base = tok.v;
        tok.v *= u.factor;
        tok.unitWord = u.kind;
        if (u.kind === 'scale') tok.scaled = true;
        s = s.slice(unitAfter[0].length);
      }
      out.push(tok);
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

type Expr = { nums: number[]; ops: ('+' | '-' | '*' | '/')[]; pct: boolean; scaled: boolean; money?: boolean; raw: string[]; pctAt: number[]; unitAt: number[] };

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
  // The right size with the other sign — a drop written as negative ("46.8 −
  // 33.6 = −$13.2M") or a loss as positive — is no evidence either way.
  if (stated * computed < 0 && bestMiss(Math.abs(stated), Math.abs(computed), pct, scaled) <= (approximate ? 0.07 : 0.03)) return 'unclear';
  const miss = bestMiss(stated, computed, pct, scaled);
  if (miss <= (approximate ? 0.07 : 0.03)) return 'correct';
  // Tiny absolute differences are rounding whatever the ratio says (0.04 vs 0.035).
  if (Math.abs(stated) < 1 && Math.abs(stated - computed) < 0.06) return 'unclear';
  if (miss > (approximate ? 0.15 : 0.10)) return 'incorrect';
  return 'unclear';
}

// ---------------------------------------------------------------------------
// The spoken-math parser (Phase 1 task 3.6, switch `spokenMathParser`).
//
// Speech chains its arithmetic and leaves the grouping to the listener:
// "three minus seventy cents plus thirty plus thirty plus twenty equals one
// fifty" is 3 − (0.70 + 0.30 + 0.30 + 0.20) = 1.50, which the left-to-right
// reader above calls a math error. Lorenzo, 22 Oct: "if any reading matches
// the stated result, treat it as consistent."
//
// So this is a reading *enumerator*, not a second checker. It re-reads the
// sentence with four tolerances and returns every (left side, stated result)
// pair they produce; `checkStatedArithmetic` then downgrades an `incorrect`
// claim to `unclear` when one of them holds. It can only ever remove a flag:
// it never raises a claim, and never makes one `correct`.
//
//   1. a unit noun after the figure — "seventy cents", "$320 million" — which
//      today ends the expression and strips the scale;
//   2. that unit inherited by the bare figures after it (70 cents, plus
//      thirty → $0.30);
//   3. a leading minus distributed over the plus chain that follows it, when
//      two or more pluses follow (one does not: "100 minus 40 plus 10" is
//      read as written);
//   4. two adjacent spoken figures as one — "one fifty" is 1.50 as well as
//      150, "two thirty eight" is 238.
//
// A reading is tied to the claim it may excuse by the stated side's *first*
// figure as the live reader read it (`statedFirst`), so a reading of another
// equation in the same sentence cannot excuse this one.
export type SpokenReading = { computed: number; stated: number; statedFirst: number; pct: boolean; scaled: boolean; via: string };

type SNum = { t: 'n'; v: number; raw: number; pct: boolean; scaled: boolean; money: boolean; cents: boolean; bare: boolean };
type SOp = { t: 'o'; v: '+' | '-' | '*' | '/' };
type SItem = SNum | SOp;

const isNum = (x: SItem): x is SNum => x.t === 'n';

function collapse(nums: number[], ops: ('+' | '-' | '*' | '/')[]): { terms: number[]; addOps: ('+' | '-')[] } | null {
  if (nums.length !== ops.length + 1 || nums.length < 2) return null;
  const terms: number[] = [nums[0]];
  const addOps: ('+' | '-')[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i], n = nums[i + 1];
    if (op === '*') terms[terms.length - 1] *= n;
    else if (op === '/') { if (n === 0) return null; terms[terms.length - 1] /= n; }
    else { addOps.push(op); terms.push(n); }
  }
  return { terms, addOps };
}

// Tolerance 3: a − b + c + d read as a − (b + c + d). Two or more pluses must
// follow the minus — "100 minus 40 plus 10" is the ordinary reading, and
// treating it as a group would silence a one-step error for free.
function distributed(terms: number[], addOps: ('+' | '-')[]): number | null {
  const j = addOps.indexOf('-');
  if (j < 0) return null;
  const rest = addOps.slice(j + 1);
  if (rest.length < 2 || rest.some(o => o !== '+')) return null;
  let head = terms[0];
  for (let i = 0; i < j; i++) head = addOps[i] === '+' ? head + terms[i + 1] : head - terms[i + 1];
  return head - terms.slice(j + 1).reduce((a, b) => a + b, 0);
}

function valuesOf(nums: number[], ops: ('+' | '-' | '*' | '/')[]): { v: number; via: string }[] {
  const c = collapse(nums, ops);
  if (!c) return [];
  const out: { v: number; via: string }[] = [];
  const std = c.terms.slice(1).reduce((acc, t, i) => (c.addOps[i] === '+' ? acc + t : acc - t), c.terms[0]);
  if (Number.isFinite(std)) out.push({ v: std, via: 'left to right' });
  const d = distributed(c.terms, c.addOps);
  if (d !== null && Number.isFinite(d)) out.push({ v: d, via: 'minus distributed' });
  return out;
}

// "A = B plus C × D = E": the spoken result belongs to C × D, not to the whole
// chain (b35q ee99bd82 t23, "$905k plus 350 × $2,800 = $980k"). Only a tail
// that opens after a + or − and whose own first operator multiplies — the
// shape a fresh sub-calculation takes.
function tails(items: SItem[]): SItem[][] {
  const out: SItem[][] = [];
  for (let i = 1; i < items.length - 1; i++) {
    if (!isNum(items[i]) || items[i - 1].t !== 'o' || items[i + 1].t !== 'o') continue;
    const before = (items[i - 1] as SOp).v, next = (items[i + 1] as SOp).v;
    if ((before !== '+' && before !== '-') || (next !== '*' && next !== '/')) continue;
    out.push(items.slice(i));
  }
  return out;
}

// Tolerance 2: once a figure is given in cents, the bare figures after it are
// cents too ("seventy cents plus thirty plus twenty").
function centsInherited(items: SItem[]): SItem[] | null {
  const first = items.findIndex(x => isNum(x) && x.cents);
  if (first < 0) return null;
  let changed = false;
  const out = items.map((x, i) => {
    if (i > first && isNum(x) && x.bare) { changed = true; return { ...x, v: x.v * 0.01 }; }
    return x;
  });
  return changed ? out : null;
}

// Tolerance 4: two adjacent figures with no operator between them are one
// spoken figure — "one fifty" (1 50) is 150 or 1.50. Only one such pair per
// side, both bare, the second a two-digit number.
function mergedFigures(a: SNum, b: SNum): number[] {
  if (!a.bare || !b.bare || !Number.isInteger(a.raw) || !Number.isInteger(b.raw)) return [];
  if (a.raw <= 0 || b.raw < 10 || b.raw > 99) return [];
  return [a.raw * 100 + b.raw, a.raw + b.raw / 100];
}

function mergeVariants(items: SItem[]): SItem[][] {
  const at: number[] = [];
  for (let i = 0; i + 1 < items.length; i++) if (isNum(items[i]) && isNum(items[i + 1])) at.push(i);
  if (at.length !== 1) return [items];
  const i = at[0], a = items[i] as SNum, b = items[i + 1] as SNum;
  return [items, ...mergedFigures(a, b).map(v => [...items.slice(0, i), { ...a, v, raw: v }, ...items.slice(i + 2)])];
}

function statedReadings(ns: SNum[]): { v: number; via: string }[] {
  const out = [{ v: ns[0].v, via: 'as said' }];
  if (ns.length === 2) for (const v of mergedFigures(ns[0], ns[1])) out.push({ v, via: 'one figure' });
  return out;
}

export function spokenReadings(sentence: string): SpokenReading[] {
  const out: SpokenReading[] = [];
  const segments: Tok[][] = [[]];
  for (const t of tokenize(sentence, { units: true })) {
    if (t.t === 'break') { segments.push([]); continue; }
    if (t.t !== 'approx') segments[segments.length - 1].push(t);
  }
  for (const seg of segments) {
    const parts: SItem[][] = [[]];
    for (const t of seg) {
      if (t.t === 'eq') { parts.push([]); continue; }
      if (t.t === 'num') {
        parts[parts.length - 1].push({
          t: 'n', v: t.v, raw: t.base ?? t.v, pct: t.pct, scaled: t.scaled,
          money: t.raw.startsWith('$') || t.unitWord === 'dollars',
          cents: t.unitWord === 'cents',
          bare: !t.unit && !t.scaled && !t.raw.startsWith('$') && t.unitWord === undefined,
        });
      } else if (t.t === 'op') parts[parts.length - 1].push({ t: 'o', v: t.v });
    }
    for (let i = 0; i + 1 < parts.length; i++) {
      const right = parts[i + 1];
      const rightNums = right.filter(isNum);
      if (rightNums.length === 0 || right.some(x => x.t === 'o')) continue;
      const stateds = statedReadings(rightNums);
      const statedFirst = rightNums[0].raw;
      for (const merged of mergeVariants(parts[i])) {
        for (const variant of [merged, centsInherited(merged)]) {
          if (!variant) continue;
          for (const side of [variant, ...tails(variant)]) {
            const ns = side.filter(isNum);
            const ops = side.filter((x): x is SOp => x.t === 'o').map(x => x.v);
            if (ns.length !== ops.length + 1) continue;
            const pct = ns.some(n => n.pct) || rightNums.some(n => n.pct);
            const scaled = [...ns, ...rightNums].some(n => n.scaled || n.money);
            const where = side === variant ? '' : ' (tail)';
            for (const { v, via } of valuesOf(ns.map(n => n.v), ops)) {
              for (const st of stateds) out.push({ computed: v, stated: st.v, statedFirst, pct, scaled, via: `${via}${where} = ${st.via}` });
            }
          }
        }
      }
    }
  }
  return out;
}

// The only thing the switch may do: an `incorrect` claim whose sentence is
// consistent under some reading becomes `unclear` — no flag, and no evidence
// the other way either.
function withholdInconsistent(sentence: string, claims: ArithmeticClaim[], from: number): void {
  if (!claims.slice(from).some(c => c.verdict === 'incorrect')) return;
  const readings = spokenReadings(sentence);
  for (let i = from; i < claims.length; i++) {
    const c = claims[i];
    if (c.verdict !== 'incorrect') continue;
    const consistent = readings.some(r => Math.abs(r.statedFirst - c.stated) < 1e-9
      && verdictFor(r.stated, r.computed, r.pct, c.approximate, r.scaled) === 'correct');
    if (consistent) claims[i] = { ...c, verdict: 'unclear' };
  }
}
// ---------------------------------------------------------------------------

const SENTENCES = /(?<=[.!?])\s+(?=[A-Z0-9"“$(])|\n+/;

export function checkStatedArithmetic(rawText: string, opts?: { spokenReadings?: boolean }): ArithmeticClaim[] {
  const claims: ArithmeticClaim[] = [];
  for (const raw of normalizeNumberWords(rawText).split(SENTENCES)) {
    const sentence = raw.trim();
    if (!sentence || !/\d/.test(sentence)) continue;
    const claimsBefore = claims.length;
    const toks = tokenize(sentence);
    let left: Expr | null = null;      // the expression before an equals
    let cur: Expr = { nums: [], ops: [], pct: false, scaled: false, raw: [], pctAt: [], unitAt: [] };
    let approx = false;
    let expectOperand = true;
    let negate = false;   // "= −$600", "= negative $4M": a leading minus is the number's sign
    const reset = () => { left = null; cur = { nums: [], ops: [], pct: false, scaled: false, raw: [], pctAt: [], unitAt: [] }; approx = false; expectOperand = true; negate = false; };
    const settle = () => {
      // A claim: an operation on the left, a single number on the right.
      if (left && cur.nums.length === 1 && cur.ops.length === 0 && left.ops.length > 0) {
        const lv = evaluate(left), rv = evaluate(cur);
        if (lv !== null && rv !== null && Number.isFinite(lv) && Number.isFinite(rv)) {
          const pct = left.pct || cur.pct;
          // Money mixes scales — "26.4/2,000 = $13,200" is $26.4M per flight in $
          // (Lorenzo, 13 Oct; Larkspur): a power of 1,000 is a scale, not an error.
          let verdict = verdictFor(rv, lv, pct, approx, left.scaled || cur.scaled || Boolean(left.money || cur.money));
          // Growth written as percents: "15% ÷ 1.10 ≈ 4.5%" is 1.15 / 1.10 → up 4.5%.
          if (verdict !== 'correct' && left.pctAt.length > 0 && left.ops.every(o => o === '*' || o === '/')) {
            const asFactors = evaluate({ ...left, nums: left.nums.map((n, i) => (left!.pctAt.includes(i) ? 1 + n / 100 : n)) });
            if (asFactors !== null && verdictFor(rv, asFactors, true, approx) === 'correct') verdict = 'correct';
          }
          // The whole written as 1 beside figures in points: "1 − 94/1.10 = 1 −
          // 85.5 = 14.5% margin" is 100 − 85.5 (default candidate ee081845 t17
          // was flagged; the claim is right). Only "1 − …": a bare 1 that
          // opens the expression and is subtracted from — an added or
          // subtracted 1 is a point ("rose 1 point, so 13 + 1"), a 1 with a
          // unit is that unit, and "1 + 4" is no whole (Lorenzo, 13 Oct).
          if (verdict !== 'correct' && left.nums.some(n => n > 1) && left.nums[0] === 1 && left.ops[0] === '-' && !left.unitAt.includes(0)) {
            const asHundred = evaluate({ ...left, nums: [100, ...left.nums.slice(1)] });
            if (asHundred !== null && verdictFor(rv, asHundred, pct, approx) === 'correct') verdict = 'correct';
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
        if (tok.unit) cur.unitAt.push(cur.nums.length);
        cur.nums.push(negate ? -tok.v : tok.v); cur.pct ||= tok.pct; cur.scaled ||= tok.scaled; cur.money ||= tok.raw.startsWith('$'); cur.raw.push(tok.raw.trim());
        expectOperand = false;
        negate = false;
        continue;
      }
      if (tok.t === 'op') {
        if (expectOperand) { negate = tok.v === '-' && cur.nums.length === 0; continue; }  // a leading operator ("plus 0.75 × …") starts nothing; a minus is a sign
        cur.ops.push(tok.v); cur.raw.push(tok.v === '*' ? '×' : tok.v === '/' ? '/' : tok.v);
        expectOperand = true;
        continue;
      }
      // equals
      if (expectOperand || cur.nums.length === 0) { reset(); continue; }
      settle();
      left = cur;
      cur = { nums: [], ops: [], pct: false, scaled: false, raw: [], pctAt: [], unitAt: [] };
      expectOperand = true;
    }
    settle();
    if (opts?.spokenReadings) withholdInconsistent(sentence, claims, claimsBefore);
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
