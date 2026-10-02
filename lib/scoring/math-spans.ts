// Source spans for deterministic math checks (docs/interviewer-behavior.md
// Rules 2 and 3, v4.3). Both the live recompute hint and the scoring-side
// checkMathSteps used to treat ANY number in the candidate's text as an
// attempt at a math step. In the 27–28 Sep persona runs that produced all
// three false live corrections (Sam's "revenue grew 15%" read as the $76.8M
// COGS impact) and a false revenue-per-store error in most reports (a 1.4
// multiplier, a "$2.50 drink"). A number now counts toward a step only when:
//   - it sits in the same clause as one of the step's cue phrases, within a
//     few words of it (the clause is ABOUT that metric), and
//   - its unit, when stated, is the step's unit (a margin LEVEL is a percent;
//     "margin fell 18 points" is a change, not a level).
// Each match keeps the clause it came from, so a flag or a report claim can
// quote what the candidate actually said.

import { normalizeNumberWords } from '@/lib/number-words';

export type MathUnit = 'percent' | 'points' | 'usd';

export type SpanStep = {
  id: string;
  description: string;
  cues?: string[];
  unit?: MathUnit | MathUnit[]; // several: the step is stated either way ("10.5% of revenue" / "10.5 points")
};

export type SpanMatch = { value: number; span: string };

const CUE_WINDOW_WORDS = 5;

// Clause boundaries: sentence ends, newlines, semicolons, dashes, commas, and
// the conjunctions that join two separate claims ("revenue grew 15% but margin
// fell 18 points"). Arithmetic operators are NOT boundaries.
const CLAUSE_SPLIT = /[.!?;\n]+(?=\s|$)|\s[—–]\s|,\s|\s(?:but|so|and|while|whereas|although|though|because)\s/i;

const SENTENCE_SPLIT = /[.!?;\n]+(?=\s|$)/;

// A quantity with its unit context: optional $, the number, then a unit.
const QUANTITY = /(\$\s?)?(\d[\d,]*(?:\.\d+)?)(\s*%|[\s-]*(?:percent(?:age points?)?|points?|pp|pts|ppts?)\b|\s*(?:m|mm|mn|million|k|thousand|b|bn|billion)\b)?/gi;

function unitOf(dollar: string | undefined, suffix: string | undefined): MathUnit | undefined {
  const s = (suffix ?? '').replace(/^[\s-]+/, '').trim().toLowerCase();
  if (s === '%' || s === 'percent') return 'percent';
  if (/^(percentage points?|points?|pp|pts|ppts?)$/.test(s)) return 'points';
  if (dollar || /^(m|mm|mn|million|k|thousand|b|bn|billion)$/.test(s)) return 'usd';
  return undefined;
}

// Explicit cues, or — for steps authored without them — the description's
// words (test fixtures and legacy callers). Case files must author cues: the
// schema requires them, because long descriptions make loose cues.
function cuesFor(step: SpanStep): string[] {
  if (step.cues && step.cues.length > 0) return step.cues.map(c => c.toLowerCase());
  return step.description.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4);
}

// Distance is counted in WORDS between cue and number — operators and other
// numbers in a derivation chain ("COGS increase = 278.4 - 175.3 = $103.1M")
// don't push the result out of range.
function wordsBetween(clause: string, a: number, b: number): number {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return clause.slice(lo, hi).split(/\s+/).filter(t => /[a-z]/i.test(t)).length;
}

function cueCharIndexes(clause: string, cue: string): { start: number; end: number }[] {
  const re = new RegExp(`\\b${cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
  return [...clause.matchAll(re)].map(m => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

// v4.6: spoken numbers count ("ten and a half points" → 10.5). Spans quote the
// normalized clause.
//
// scope 'sentence' (verification only, Rule 2 v4.6): the cue may sit anywhere
// in the sentence — "beans were 25% of 42, about 10.5 points of revenue" puts
// the cue and the figure in different clauses. Safe only for confirming a
// correct figure; a mismatch flag must stay clause-scoped (v4.3).
export function findStepSpans(rawText: string, step: SpanStep, scope: 'clause' | 'sentence' = 'clause'): SpanMatch[] {
  const text = normalizeNumberWords(rawText);
  const cues = cuesFor(step);
  const units = step.unit === undefined ? undefined : Array.isArray(step.unit) ? step.unit : [step.unit];
  const matches: SpanMatch[] = [];
  for (const raw of text.split(scope === 'clause' ? CLAUSE_SPLIT : SENTENCE_SPLIT)) {
    const clause = raw.trim();
    if (!clause) continue;
    const cueAt = cues.flatMap(c => cueCharIndexes(clause, c));
    if (cueAt.length === 0) continue;
    for (const m of clause.matchAll(QUANTITY)) {
      const value = parseFloat(m[2].replace(/,/g, ''));
      if (isNaN(value)) continue;
      const unit = unitOf(m[1], m[3]);
      // A step with a unit only accepts numbers that state that unit: free
      // text is full of bare ratios and hypotheticals ("1 minus 0.94"), and a
      // unitless number is too weak a signal to attribute to a metric.
      if (units && (unit === undefined || !units.includes(unit))) continue;
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // Cue words themselves don't count toward the distance.
      const near = scope === 'sentence'
        || cueAt.some(c => (c.end <= start ? wordsBetween(clause, c.end, start) : wordsBetween(clause, end, c.start)) <= CUE_WINDOW_WORDS);
      if (near) matches.push({ value, span: clause });
    }
  }
  return matches;
}

// Global one-to-one assignment across steps (each stated number counts for at
// most one step, its best fit), ranked by relative error — so "margin returns
// to 24%" is the prior-margin step's correct answer, not a wrong answer to the
// current-margin step.
export function assignSpans<S extends SpanStep & { answer: number }>(
  text: string,
  steps: S[],
): Map<string, SpanMatch & { stepId: string }> {
  type Pair = { stepId: string; key: string; match: SpanMatch; relError: number };
  const pairs: Pair[] = [];
  for (const step of steps) {
    for (const match of findStepSpans(text, step)) {
      const relError = step.answer === 0 ? Math.abs(match.value) : Math.abs(match.value - step.answer) / Math.abs(step.answer);
      pairs.push({ stepId: step.id, key: `${match.span}|${match.value}`, match, relError });
    }
  }
  pairs.sort((a, b) => a.relError - b.relError);
  const claimedSteps = new Set<string>();
  const claimedNumbers = new Set<string>();
  const out = new Map<string, SpanMatch & { stepId: string }>();
  for (const p of pairs) {
    if (claimedSteps.has(p.stepId) || claimedNumbers.has(p.key)) continue;
    claimedSteps.add(p.stepId);
    claimedNumbers.add(p.key);
    out.set(p.stepId, { ...p.match, stepId: p.stepId });
  }
  return out;
}

// A step is checkable only once every ledger input it depends on has been
// revealed (Rule 2's "derivable from revealed values"). A step with no inputs
// listed rests on the case prompt alone.
export function inputsRevealed(step: { inputs?: string[] }, revealedIds: Iterable<string> | undefined): boolean {
  if (!step.inputs || step.inputs.length === 0) return true;
  if (revealedIds === undefined) return true;
  const revealed = new Set(revealedIds);
  return step.inputs.every(id => revealed.has(id));
}
