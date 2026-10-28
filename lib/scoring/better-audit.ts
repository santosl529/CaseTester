import type { Case } from '@/lib/cases/schema';
import { normalizeNumberWords } from '@/lib/number-words';
import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from './rubric';

// Lorenzo, 19 Oct (§15 m; batch 32 Larkspur Tyler: "roughly 3 million
// passengers … about $30M", Marcus: "a 30–36% fare drop" — figures in a
// "great answer" that no case data supports, one the candidate could repeat
// as fact). Lists the figures in each missed-opportunity betterResponse that
// are none of: a case figure, a math-step answer, one operation of two such
// figures (within 1%), a year or small count, or a figure inside an
// "if / assume / say" clause. The verifier gets them as hints; it decides.

export type BetterFigure = { dimension: RubricDimensionKey; index: number; figure: string };

const SCALE: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9, bn: 1e9 };
// "$30M", "3 million", "840,000", "36%", "$2.4".
const FIGURE = /(\$)?(\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|percent\b|points?\b|(?:thousand|million|billion|bn|[kmb])\b)?/gi;

type Figure = { text: string; raw: number; scaled: number; money: boolean; percent: boolean; scale: boolean; start: number };

function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of normalizeNumberWords(text).matchAll(FIGURE)) {
    const raw = parseFloat(m[2].replace(/,/g, ''));
    if (Number.isNaN(raw)) continue;
    const unit = (m[3] ?? '').toLowerCase();
    const percent = unit === '%' || unit === 'percent' || unit.startsWith('point');
    const mult = percent ? 1 : SCALE[unit] ?? 1;
    out.push({ text: m[0].trim(), raw, scaled: raw * mult, money: !!m[1], percent, scale: mult !== 1, start: m.index ?? 0 });
  }
  return out;
}

const same = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * tol);

type Kind = 'money' | 'percent' | 'count' | 'any';
// directOnly: a unitless cell or an unscaled $M, matched as said, never an operand.
type Value = { v: number; kind: Kind; src: string; n?: number; directOnly?: boolean };
// A bare number ("the 16 COGS points") carries no unit in the sentence: any kind will do.
const kindOf = (f: Figure): Kind => (f.money ? 'money' : f.percent ? 'percent' : f.scale ? 'count' : 'any');
const STEP_KIND = { usd: 'money', percent: 'percent', points: 'percent', count: 'count', ratio: 'any' } as const;

// Every value the case gives, at the scales it is said in: the prompt, the
// ledger (periods too), the exhibits' cells, the math steps' answers.
export function caseFigureValues(caseData: Case): Value[] {
  const texts: [string, string][] = [
    ['prompt', caseData.prompt],
    ...caseData.dataLedger.map((d): [string, string] => [d.id, d.value]),
  ];
  const values: Value[] = texts.flatMap(([src, t]) => figuresIn(t).map((f, n) => ({ v: f.scaled, kind: kindOf(f) === 'any' ? 'count' : kindOf(f), src, n })));
  // Exhibit cells carry their unit in the column, not the number.
  for (const e of caseData.exhibits) for (const f of figuresIn(JSON.stringify(e.data))) values.push({ v: f.scaled, kind: 'any', src: e.id, directOnly: true }, { v: f.raw, kind: 'any', src: e.id, directOnly: true });
  for (const s of caseData.mathSteps) {
    const u = Array.isArray(s.unit) ? s.unit[0] : s.unit;
    const kind: Kind = u ? STEP_KIND[u] : 'any';
    for (const v of [s.answer, ...(s.altAnswers ?? [])]) values.push({ v, kind, src: s.id, directOnly: s.scale === 'million' || kind === 'any' }, ...(s.scale === 'million' ? [{ v: v * 1e6, kind, src: s.id }] : []));
  }
  // An index base: "revenue 100, costs 94" (100 − the 6% margin); "100%" in a share.
  values.push({ v: 100, kind: 'percent', src: 'base' }, { v: 100, kind: 'count', src: 'base' });
  const seen = new Set<string>();
  return values.filter(x => x.v !== 0 && !seen.has(`${x.v}|${x.kind}|${x.src}`) && seen.add(`${x.v}|${x.kind}|${x.src}`));
}

// What one operation of two case values can be, with its kind: sums and
// differences keep the kind; a count times a price is money; a ratio of two
// like values is a count or a percent. Kinds that make no sense give nothing.
function results(a: Value, b: Value): Value[] {
  const out: Value[] = [];
  const like = a.kind === b.kind;
  const k = a.kind === 'any' ? b.kind : a.kind;
  if (like) out.push({ ...a, v: a.v + b.v, kind: k }, { ...a, v: a.v - b.v, kind: k });
  const frac = a.kind === 'percent' ? a.v / 100 : b.kind === 'percent' ? b.v / 100 : null;
  if (frac !== null) out.push({ ...a, v: frac * (a.kind === 'percent' ? b.v : a.v), kind: a.kind === 'percent' ? b.kind : a.kind });
  else if (a.kind !== 'percent' && b.kind !== 'percent' && !(a.kind === 'money' && b.kind === 'money')) {
    out.push({ ...a, v: a.v * b.v, kind: a.kind === 'money' || b.kind === 'money' ? 'money' : k });
  }
  if (b.v !== 0 && a.kind !== 'percent' && b.kind !== 'percent') {
    const ratio = a.v / b.v;
    out.push({ ...a, v: ratio, kind: like ? 'count' : a.kind });
    // A share or a change (36% = 16.8 against 26.4) comes from two neighbouring figures of one line of the case ("from $26.4M to $16.8M"), else any two ratios would "explain" every percent.
    if (like && a.src === b.src && a.n !== undefined && b.n !== undefined && Math.abs(a.n - b.n) === 1) out.push({ ...a, v: ratio * 100, kind: 'percent' }, { ...a, v: (ratio - 1) * 100, kind: 'percent' }, { ...a, v: (1 - ratio) * 100, kind: 'percent' });
  }
  return out;
}

const EXEMPT_FROM = /\b(?:if|assum(?:e|es|ing)|suppose|supposing|imagine|hypothetically|let'?s say|say(?=,?\s+(?:we|a|an|the|that|it|they|\d|\$)))\b/i;

function inHypothetical(text: string, at: number): boolean {
  const sentenceStart = Math.max(text.lastIndexOf('.', at), text.lastIndexOf('!', at), text.lastIndexOf('?', at), text.lastIndexOf('\n', at)) + 1;
  return EXEMPT_FROM.test(text.slice(sentenceStart, at));
}

function derivable(f: Figure, pool: Value[]): boolean {
  const kind = kindOf(f);
  const ofKind = (x: Value) => x.kind === kind || x.kind === 'any' || kind === 'any';
  // The figure at its own scale matches any value; as typed ("$320M" → 320) only a unitless cell or an unscaled $M.
  const matches = (x: Value, tol: number) => same(x.v, f.scaled, tol) || (x.directOnly === true && same(x.v, f.raw, tol));
  if (pool.some(x => ofKind(x) && matches(x, 0.005))) return true;
  // A bare small count (6 routes) is no operand: times any money it "explains" most figures.
  const operands = pool.filter(x => !x.directOnly && !(x.kind === 'count' && x.v <= 12));
  for (const a of operands) for (const b of operands) {
    if (a === b) continue;
    if (results(a, b).some(r => ofKind(r) && same(r.v, f.scaled, 0.01))) return true;
  }
  return false;
}

const sentenceOf = (text: string, at: number) => Math.max(text.lastIndexOf('.', at), text.lastIndexOf('!', at), text.lastIndexOf('?', at), text.lastIndexOf('\n', at));

// A figure built on an unsupported one in the same sentence is unsupported too
// ("$10 more on roughly 3 million passengers is about $30M": $30M is $10 ×
// 3M, though a route's revenue in the case is also $30M).
function builtOn(f: Figure, bad: Figure[], sentence: Figure[]): boolean {
  const hit = (v: number) => [f.raw, f.scaled].some(t => same(v, t, 0.01));
  return bad.some(b => sentence.some(o => o !== b && o !== f && [b.scaled, b.raw].some(x => [o.scaled, o.raw].some(y => hit(x + y) || hit(x - y) || hit(x * y) || hit(x / y) || hit(y / x)))));
}

export function auditBetterFigures(rubric: RubricScores, caseData: Case): BetterFigure[] {
  const pool = caseFigureValues(caseData);
  const out: BetterFigure[] = [];
  for (const dimension of RUBRIC_DIMENSION_KEYS) {
    rubric[dimension].missedOpportunities.forEach((m, index) => {
      const text = normalizeNumberWords(m.betterResponse);
      const figs = figuresIn(m.betterResponse);
      const stated = figs.filter(f => !inHypothetical(text, f.start));
      const smallCount = (f: Figure) => !f.money && !f.percent && !f.scale && (f.raw <= 10 || (Number.isInteger(f.raw) && f.raw >= 1900 && f.raw <= 2100)); // a small count, a year
      const bad = stated.filter(f => !smallCount(f) && !derivable(f, pool));
      for (const f of stated) {
        if (smallCount(f)) continue;
        const sentence = stated.filter(o => sentenceOf(text, o.start) === sentenceOf(text, f.start));
        if (bad.includes(f) || builtOn(f, bad.filter(b => sentence.includes(b)), sentence)) out.push({ dimension, index, figure: f.text });
      }
    });
  }
  return out;
}
