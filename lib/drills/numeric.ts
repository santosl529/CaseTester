// Numeric entry for drills (docs/prd-drills.md "Numeric parsing and tolerance"
// and the QN-3 trap diagnosis). One parser for every numeric input, so "2.5M",
// "$2.5m", "2,500,000" and "2.5 million" all score the same. Separate from
// lib/number-words.ts, which turns spoken number words into digits for the
// interviewer; drills accept typed numbers only.
//
// Client-safe: no answer data lives here, so the item screen can use
// parseNumericInput to show "Enter a number" before submitting.

export type ParsedNumber =
  | { ok: true; value: number; percent: boolean }
  | { ok: false };

const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mm: 1e6, mn: 1e6, million: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9,
};

const NUMBER_RE =
  /^([-−])?\s*\$?\s*([-−])?\s*(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(k|thousand|mm|mn|m|million|bn|b|billion)?\s*(%|percent)?$/i;

// Commas only as thousands separators: "2,500,000" yes; "2,5" or "25,00" no,
// since a misplaced comma is more likely a European decimal than a typo.
const GROUPED_RE = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

export function parseNumericInput(raw: string): ParsedNumber {
  const match = NUMBER_RE.exec(raw.trim());
  if (!match) return { ok: false };
  const [, signBefore, signAfter, digits, scaleWord, percentSign] = match;
  if (signBefore && signAfter) return { ok: false };
  if (scaleWord && percentSign) return { ok: false };
  if (digits.includes(',') && !GROUPED_RE.test(digits)) return { ok: false };

  let value = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(value)) return { ok: false };
  if (scaleWord) value *= SCALE[scaleWord.toLowerCase()];
  if (signBefore || signAfter) value = -value;
  return { ok: true, value, percent: Boolean(percentSign) };
}

export type ToleranceType = 'absolute' | 'relative';

// How an item reads percent answers. The key stores percent answers in percent
// units (25 means 25%).
//   none:               not a percent answer; "25%" means 0.25.
//   percent:            "25" and "25%" both mean 25%; "0.25" means 0.25%.
//   percent_or_decimal: as `percent`, and a bare "0.25" also counts as 25%.
export type PercentFormat = 'none' | 'percent' | 'percent_or_decimal';

export interface NumericKey {
  answer: number;
  tolerance_type: ToleranceType;
  tolerance_value: number;
  percent_format: PercentFormat;
  trap_values: { value: number; tag: string }[];
}

// PRD default: exact for integers, ±1% relative otherwise.
export function defaultTolerance(answer: number): Pick<NumericKey, 'tolerance_type' | 'tolerance_value'> {
  return Number.isInteger(answer)
    ? { tolerance_type: 'absolute', tolerance_value: 0 }
    : { tolerance_type: 'relative', tolerance_value: 0.01 };
}

// Floating-point slack so "exact" survives 0.1 + 0.2.
const EPSILON = 1e-9;

export function withinTolerance(
  value: number,
  target: number,
  tolerance: Pick<NumericKey, 'tolerance_type' | 'tolerance_value'>,
): boolean {
  const allowed = tolerance.tolerance_type === 'absolute'
    ? tolerance.tolerance_value
    : Math.abs(target) * tolerance.tolerance_value;
  return Math.abs(value - target) <= allowed + EPSILON * Math.max(1, Math.abs(target));
}

// The readings of a parsed answer the item allows, most literal first.
export function candidateValues(parsed: Extract<ParsedNumber, { ok: true }>, format: PercentFormat): number[] {
  if (format === 'none') return [parsed.percent ? parsed.value / 100 : parsed.value];
  if (parsed.percent || format === 'percent') return [parsed.value];
  return [parsed.value, parsed.value * 100];
}

export type NumericVerdict =
  | { correct: true; value: number }
  | { correct: false; value: number; tag: string };

// The ways a student rounds a figure they computed: to 0–2 decimals, or to
// 2–3 significant figures. 16.6667 → 17, 16.7, 16.67.
export function roundedForms(x: number): number[] {
  const forms = new Set<number>([x]);
  for (const d of [0, 1, 2]) forms.add(Number(x.toFixed(d)));
  if (x !== 0) for (const s of [2, 3]) forms.add(Number(x.toPrecision(s)));
  return [...forms];
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

// A reading hits a trap when it's within the item's tolerance of the trap, or
// is the trap rounded the way students round. Matching on rounded forms, not
// a percentage band, keeps near neighbors apart: compound growth to 121 and
// simple growth to 120 are 0.8% apart but never share a rounded form the
// student would type for the other.
export function matchesTrap(value: number, trap: number, key: Pick<NumericKey, 'tolerance_type' | 'tolerance_value'>): boolean {
  return withinTolerance(value, trap, key) || roundedForms(trap).some(r => sameNumber(r, value));
}

const ZEROS_POWERS = [-9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// QN-3 diagnosis order (PRD, fixed 2026-10-05): a named trap first (wrong
// base, percent vs points, simple growth, neighbor cell...), then a ×10^k
// match (zeros error), then M.arithmetic_error however far off. The first
// match wins, checked across every reading the item allows.
export function scoreNumeric(parsed: Extract<ParsedNumber, { ok: true }>, key: NumericKey): NumericVerdict {
  const readings = candidateValues(parsed, key.percent_format);
  for (const value of readings) {
    if (withinTolerance(value, key.answer, key)) return { correct: true, value };
  }
  for (const value of readings) {
    const trap = key.trap_values.find(t => matchesTrap(value, t.value, key));
    if (trap) return { correct: false, value, tag: trap.tag };
  }
  if (key.answer !== 0) {
    // The item's tolerance as a share of the answer, so it scales with 10^k.
    const relative = key.tolerance_type === 'relative'
      ? key.tolerance_value
      : key.tolerance_value / Math.abs(key.answer);
    const shifted = { tolerance_type: 'relative' as const, tolerance_value: Math.max(relative, 1e-6) };
    for (const value of readings) {
      if (ZEROS_POWERS.some(k => withinTolerance(value, key.answer * 10 ** k, shifted))) {
        return { correct: false, value, tag: 'M.zeros_error' };
      }
    }
  }
  return { correct: false, value: readings[0], tag: 'M.arithmetic_error' };
}
