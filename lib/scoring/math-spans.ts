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

export type MathUnit = 'percent' | 'points' | 'usd' | 'count' | 'ratio';

export type SpanStep = {
  id: string;
  description: string;
  cues?: string[];
  notCues?: string[]; // a sentence naming one of these is about another quantity ("overhead … worth maybe $10M")
  flagNotCues?: string[]; // …and one naming these is no mismatch for this step (a correct figure there still verifies)
  unit?: MathUnit | MathUnit[]; // several: the step is stated either way ("10.5% of revenue" / "10.5 points")
  // Money's scale (Lorenzo, 13 Oct; Larkspur: "$24M of lost contribution" bound
  // to the per-flight $4,200): a per-unit step takes no figure stated in $M,
  // a $M step no plain dollar figure. Absent: any scale.
  scale?: 'unit' | 'million';
};

// range: the number is one end of a range ("10–12%", "7 to 8 points") — a
// range is not the quantity's value.
export type SpanMatch = { value: number; span: string; range?: boolean };

const CUE_WINDOW_WORDS = 5;

// Clause boundaries: sentence ends, newlines, semicolons, dashes, commas, and
// the conjunctions that join two separate claims ("revenue grew 15% but margin
// fell 18 points"). Arithmetic operators are NOT boundaries.
const CLAUSE_SPLIT = /[.!?;\n]+(?=\s|$)|\s[—–]\s|,\s|\s(?:but|so|and|while|whereas|although|though|because)\s/i;

const SENTENCE_SPLIT = /[.!?;\n]+(?=\s|$)/;
const CONTINUES = /^(?:plus|less|minus|[×*÷/+−-]|x\s)/i;

// A quantity with its unit context: optional $, the number, then a unit.
const QUANTITY = /(\$\s?)?(\d[\d,]*(?:\.\d+)?)(\s*%|[\s-]*(?:percent(?:age points?)?|points?|pp|pts|ppts?)\b|\s*(?:m|mm|mn|million|k|thousand|b|bn|billion)\b)?/gi;

function scaleOf(suffix: string | undefined): 'unit' | 'thousand' | 'million' | 'billion' {
  const s = (suffix ?? '').trim().toLowerCase();
  return /^(m|mm|mn|million)$/.test(s) ? 'million' : /^(k|thousand)$/.test(s) ? 'thousand' : /^(b|bn|billion)$/.test(s) ? 'billion' : 'unit';
}

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

// A cue of six letters or more is a stem ("contribut", "diagnos"); a shorter
// one is a word, with its inflections only — "rest" is not "restore" (batch
// 21, Fiona t16: "10–12% on menu prices to restore margin" verified as the
// other inputs' 11.8 points), "net" is not "network".
function cueCharIndexes(clause: string, cue: string): { start: number; end: number }[] {
  const body = cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = cue.length < 6 && /[a-z]$/i.test(cue) ? '(?:s|es|ed|d|ing)?(?![a-z])' : '';
  const re = new RegExp(`\\b${body}${tail}`, 'gi');
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
  // A mismatch (clause scope) also stays out of the flag-only exclusions.
  const notCues = [...(step.notCues ?? []), ...(scope === 'clause' ? step.flagNotCues ?? [] : [])].map(c => c.toLowerCase());
  const matches: SpanMatch[] = [];
  // A sentence that continues the last one ("Half of $2,000 is $1,000 … Plus
  // … = $2.8M operating profit" — Jasmine b14baac7) shares its not-cues.
  const sentences = text.split(SENTENCE_SPLIT);
  const excluded: boolean[] = [];
  sentences.forEach((sentence, i) => {
    excluded[i] = notCues.some(c => cueCharIndexes(sentence, c).length > 0) || (i > 0 && excluded[i - 1] && CONTINUES.test(sentence.trim()));
  });
  const pieces = sentences
    .filter((_, i) => !excluded[i])
    .flatMap(sentence => scope === 'clause' ? sentence.split(CLAUSE_SPLIT) : [sentence]);
  for (const raw of pieces) {
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
      // A count (passengers, patients, bags) is never money or a percent ("$5
      // more per passenger", "75% load factor" — Larkspur); "6 million bags" is one.
      if (units?.includes('count')) {
        if (m[1] || unit === 'percent' || unit === 'points') continue;
      } else if (units?.includes('ratio') && !units.some(u => u !== 'ratio')) {
        // "3.3x", "2 times" or a bare ratio — never money or a percent ("$750" is a price).
        if (m[1] || unit !== undefined) continue;
      } else if (units && (unit === undefined || !units.includes(unit))) continue;
      if (step.scale && unit === 'usd' && scaleOf(m[3]) !== step.scale) continue;
      const start = m.index ?? 0;
      // A number glued to letters is a name, not a figure ("FY2023").
      if (start > 0 && /[a-z]/i.test(clause[start - 1])) continue;
      const end = start + m[0].length;
      // Cue words themselves don't count toward the distance.
      const near = scope === 'sentence'
        || cueAt.some(c => (c.end <= start ? wordsBetween(clause, c.end, start) : wordsBetween(clause, end, c.start)) <= CUE_WINDOW_WORDS);
      if (near) matches.push({ value, span: clause, ...(isRangeEnd(clause, start, end) ? { range: true } : {}) });
    }
  }
  return matches;
}

// One end of a range: "10–12%", "10-12", "7 to 8 points" — not a change
// ("from 24% to 6%", "takes 31.5 to 43.3 points", "10.5 points to 14.7"), and
// not spaced subtraction ("58 - 43.3").
const CHANGE_LEAD = /\b(?:from|takes?|took|taking|goes|went|going|rises?|rose|rising|grows?|grew|growing|moves?|moved|falls?|fell|falling|drops?|dropped|climbs?|climbed|jumps?|jumped|increases?|increased|decreases?|decreased|declines?|declined|lifts?|lifted|brings?|brought|pushes|pushed)\b(?:\s+\S+){0,3}\s*$/i;
function isRangeEnd(clause: string, start: number, end: number): boolean {
  const before = clause.slice(Math.max(0, start - 60), start);
  const after = clause.slice(end, end + 40);
  if (/\d%?(?:[–-]|\s?–\s?)$/.test(before)) return true;
  if (/^(?:[–-]|\s?–\s?)\$?\d/.test(after)) return true;
  // "X to Y": the second end, or the first when it carries no unit of its own.
  const lead = /(\$?\d[\d,]*(?:\.\d+)?)(\s*%|\s+(?:percent|points?))?\s+to\s+$/i.exec(before);
  if (lead && !lead[2] && !CHANGE_LEAD.test(before.slice(0, lead.index))) return true;
  if (/^\s+to\s+\$?\d/i.test(after) && clause.slice(start, end).match(/^\$?\d[\d,]*(?:\.\d+)?$/) && !CHANGE_LEAD.test(clause.slice(0, start))) return true;
  return false;
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
