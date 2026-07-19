// Rule 6 deterministic backstop (docs/interviewer-behavior.md): "audit
// universally, block selectively." Every quantity expression in interviewer
// speech is checked against three valid provenances — revealed ledger values,
// candidate-attributed figures, and orchestrator-derived values (recompute
// output) — but the ACTION taken differs by how much fabrication risk the
// expression carries:
//   - carries units/currency/%/magnitude words, unmatched  -> block
//   - bare small integer or time reference, unmatched      -> log only
//   - irreducibly fuzzy magnitude language ("roughly half") -> log only, never block
// This is additive to auditTurn (audit.ts), which remains the simple
// binary FR-4 gate; this module adds word-number coverage, provenance
// tiering, and the fuzzy-language carve-out that a digits-only regex cannot.

export type ProvenanceAction = 'pass' | 'log' | 'block';

export type NumericFinding = {
  raw: string;
  normalizedValue: number | null;
  fuzzy: boolean;
  hasUnit: boolean;
  action: ProvenanceAction;
};

export type ProvenanceAuditResult = {
  passed: boolean; // no 'block' findings
  findings: NumericFinding[];
};

export type ProvenanceAuditOptions = {
  // Exempt turn types (docs/interviewer-behavior.md whitelist): deterministic
  // scripts get a provenance fast-path. Turn type is derived by the caller
  // from orchestrator state, never self-reported by the model.
  exempt?: boolean;
};

// ---- number-word grammar --------------------------------------------------

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
};
const ARTICLES = new Set(['a', 'an']);
// Doc: "roughly half," "doubled" — qualitative multiplier language is always
// log-only, never resolved into a blockable value.
const FUZZY_MULTIPLIERS = new Set(['double', 'doubled', 'triple', 'tripled', 'half', 'halved', 'quarter']);
const MAGNITUDE_WORD = /^(percent|points?|million|billion|thousand|dollars?)$/;

// Vague magnitude phrases with no precise numeric target — always log-only.
const FUZZY_PHRASE_PATTERNS = [
  /\b(mid|low|high)-?\s?(teens|twenties|thirties|forties|single digits|double digits|dozens?)\b/gi,
  /\b(roughly|about|around|approximately)\s+(half|a third|a quarter|a couple|a few)\b/gi,
];

type WordSpan = { start: number; end: number; value: number; hasScale: boolean };

function parseWordNumberSpans(tokens: string[]): WordSpan[] {
  const spans: WordSpan[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (ARTICLES.has(tok) && SCALES[tokens[i + 1]] !== undefined) {
      spans.push({ start: i, end: i + 1, value: SCALES[tokens[i + 1]], hasScale: true });
      i += 2;
      continue;
    }
    if (ONES[tok] === undefined && TENS[tok] === undefined) { i++; continue; }

    let j = i;
    let base = 0;
    if (TENS[tokens[j]] !== undefined) { base += TENS[tokens[j]]; j++; }
    if (ONES[tokens[j]] !== undefined) { base += ONES[tokens[j]]; j++; }
    let value = base;
    let hasScale = false;

    if (tokens[j] === 'hundred') {
      value *= 100; hasScale = true; j++;
      let trail = 0;
      if (TENS[tokens[j]] !== undefined) { trail += TENS[tokens[j]]; j++; }
      if (ONES[tokens[j]] !== undefined) { trail += ONES[tokens[j]]; j++; }
      value += trail;
      if (SCALES[tokens[j]] !== undefined && tokens[j] !== 'hundred') { value *= SCALES[tokens[j]]; j++; }
    } else if (SCALES[tokens[j]] !== undefined) {
      value *= SCALES[tokens[j]]; hasScale = true; j++;
    }

    if (tokens[j] === 'point') {
      let frac = '';
      let k = j + 1;
      while (k < tokens.length && ONES[tokens[k]] !== undefined && ONES[tokens[k]] <= 9) {
        frac += String(ONES[tokens[k]]);
        k++;
      }
      if (frac.length > 0) { value = parseFloat(`${value}.${frac}`); j = k; }
    }

    spans.push({ start: i, end: j - 1, value, hasScale });
    i = j;
  }
  return spans;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// ---- digit extraction (mirrors audit.ts's extractNumbers) -----------------

function extractDigitFindings(text: string): { raw: string; value: number; hasUnit: boolean }[] {
  const results: { raw: string; value: number; hasUnit: boolean }[] = [];
  const regex = /\d[\d,]*(?:\.\d+)?(?!\.\s)/g;
  for (const m of text.matchAll(regex)) {
    const raw = m[0];
    const value = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(value)) continue;
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 3), idx);
    const after = text.slice(idx + raw.length, idx + raw.length + 14).trim().split(/\s+/)[0] ?? '';
    const hasUnit = /\$\s*$/.test(before) || /^%/.test(after) || MAGNITUDE_WORD.test(after.replace(/[^a-z]/gi, ''));
    results.push({ raw, value, hasUnit });
  }
  return results;
}

// ---- allowed-value collection ----------------------------------------------

function collectAllowedValues(sources: string[]): Set<number> {
  const values = new Set<number>();
  for (const src of sources) {
    for (const d of extractDigitFindings(src)) values.add(d.value);
    for (const w of parseWordNumberSpans(tokenize(src))) values.add(w.value);
  }
  return values;
}

function valueMatches(value: number, allowed: Set<number>): boolean {
  const tolerance = Math.max(0.01, Math.abs(value) * 0.001);
  for (const a of allowed) {
    if (Math.abs(a - value) <= tolerance) return true;
  }
  return false;
}

// ---- main audit -------------------------------------------------------------

export function auditNumericProvenance(
  spokenText: string,
  allowedSources: string[],
  opts: ProvenanceAuditOptions = {},
): ProvenanceAuditResult {
  const findings: NumericFinding[] = [];
  const allowedValues = collectAllowedValues(allowedSources);

  // Fuzzy magnitude phrases: always log, never block.
  for (const pattern of FUZZY_PHRASE_PATTERNS) {
    for (const m of spokenText.matchAll(pattern)) {
      findings.push({ raw: m[0], normalizedValue: null, fuzzy: true, hasUnit: true, action: 'log' });
    }
  }

  // Digit findings.
  for (const d of extractDigitFindings(spokenText)) {
    const matched = valueMatches(d.value, allowedValues);
    const action: ProvenanceAction = matched ? 'pass' : opts.exempt ? 'pass' : d.hasUnit ? 'block' : 'log';
    findings.push({ raw: d.raw, normalizedValue: d.value, fuzzy: false, hasUnit: d.hasUnit, action });
  }

  // Word-number findings (fuzzy multipliers first, then compound spans).
  const tokens = tokenize(spokenText);
  for (let i = 0; i < tokens.length; i++) {
    if (FUZZY_MULTIPLIERS.has(tokens[i])) {
      findings.push({ raw: tokens[i], normalizedValue: null, fuzzy: true, hasUnit: true, action: 'log' });
    }
  }
  for (const span of parseWordNumberSpans(tokens)) {
    const raw = tokens.slice(span.start, span.end + 1).join(' ');
    const nextTok = tokens[span.end + 1];
    const hasUnit = span.hasScale || nextTok === 'percent';
    const matched = valueMatches(span.value, allowedValues);
    const action: ProvenanceAction = matched ? 'pass' : opts.exempt ? 'pass' : hasUnit ? 'block' : 'log';
    findings.push({ raw, normalizedValue: span.value, fuzzy: false, hasUnit, action });
  }

  return { passed: findings.every(f => f.action !== 'block'), findings };
}
