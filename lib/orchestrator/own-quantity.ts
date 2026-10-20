// The candidate's own quantity before code says "not X" (Lorenzo, 17 Oct;
// session 9ccf0836 T24: "ten points of the thirty seven point five percent
// increasing COGS" — 25% × 40%, right on a COGS base — corrected as "about 4.2
// points [of revenue], not 10"; batch 30 Noor t16: her 38% was the price rise
// that takes COGS back to 42% of revenue, 58/42 − 1, corrected as the rise
// that recovers 16 points of margin). Code says "not X" only when the
// candidate used code's quantity or unit; otherwise one code-written
// conversion line, and the step closes. A figure wrong on the candidate's own
// stated quantity keeps the correction, worded on their quantity.
//
// What the candidate stated is read from the claim's sentence, the one before
// it, and their next two messages: the figure with a unit attached ("10
// points of … COGS", "6 points of revenue", "6 points"), a base named for
// their units ("in points of COGS, not in points of revenue"), or, for a
// price rise, a cost line taken back to a level ("COGS of 58 falls back
// toward 42").
import { normalizeNumberWords, articleFor } from '@/lib/number-words';
import { numbersOf, boundInput, quantityWords, type CheckerClaim, type VetContext } from './math-checker';

export type Reading = { quantity: string; value: number };
export type QuantityFrame =
  | { kind: 'own_right'; quantity: string; value: number }   // right on their own quantity: the conversion line, the step closes
  | { kind: 'code'; basis: string }                           // code's quantity or unit, said: today's correction
  | { kind: 'own_wrong'; quantity: string; value: number }    // wrong on their own stated quantity: corrected on it
  // No quantity stated (Lorenzo, 17 Oct, ruling b): right on a reading code
  // computes → the conversion line, the step closes; wrong on every reading →
  // code's figure without "not X", the step stays open.
  | { kind: 'unstated'; rightOn: Reading | null };

// The corrections' agreement rule: 3% or 0.5.
const agrees = (x: number, y: number) => Math.abs(x - y) <= Math.max(0.5, 0.03 * Math.abs(y));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sentencesOf = (text: string) => normalizeNumberWords(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
const NOT_BEFORE = /\b(?:not|isn't|aren't|wasn't|never|rather than|instead of)\s+(?:in\s+|on\s+|as\s+)?(?:a\s+|the\s+)?$/i;

type Step = { id: string; quantity?: string; unit?: string | string[]; timeframe?: string; inputs?: string[] };
type Base = { name: string; names: string; prior?: number; current?: number };

// The share bases a step's inputs carry (prof-001's COGS), with their levels.
function basesOf(ctx: VetContext, step: Step | undefined): Base[] {
  return (ctx.caseData.shareBases ?? []).filter(b => step?.inputs?.includes(b.item)).map(b => {
    const tf = ctx.caseData.dataLedger.find(d => d.id === b.item)?.timeframes ?? {};
    const at = (p: string) => { const k = Object.entries(tf).find(([, x]) => x === p || x === 'both')?.[0]; return k === undefined ? undefined : Number(k); };
    return { name: b.name, names: [b.name, ...b.aliases].map(esc).join('|'), prior: at('prior'), current: at('current') };
  });
}
const firstUnit = (st: Step | undefined) => (Array.isArray(st?.unit) ? st?.unit[0] : st?.unit);
// A step measured in points (or a share) of revenue: its figure has another base to be read on.
const inRevenuePoints = (st: Step | undefined) => /\b(?:points|share|percent) of revenue\b/i.test(st?.quantity ?? '');

// Revenue (or margin) units right after a figure: code's unit on a revenue-points step.
// Points of revenue growth are another base (controller ruling, Task 27 re-review, 20 Oct).
const REVENUE_CHANGE = String.raw`(?!\s+(?:growth|increases?|changes?|rises?|jumps?|declines?|drops?|falls?)\b)`;
const REVENUE_UNITS = new RegExp(String.raw`^\s*(?:%|percent(?:age)?(?:\s+points?)?|points?|pp|pts)?\s*(?:of\s+(?:total\s+)?(?:revenue|sales)\b${REVENUE_CHANGE}|(?:of|off)\s+(?:the\s+)?margin\b)|^\s*(?:revenue|margin)\s+points?\b`, 'i');
// A unit right after a figure, and points in particular.
const UNIT_AT = /^\s*(?:-|\s)?(?:%|percent(?:age)?\b|points?\b|pp\b|pts\b)/i;
const POINTS_AT = /^\s*(?:-|\s)?(?:percentage\s+)?(?:points?|pp|pts)\b/i;
// Of N points ("5.8 points of the 16-point COGS increase", "of the COGS line's
// 16-point increase", "5.8 of the 16 points COGS went up", "of the 42 points of
// COGS"): N and what follows it, read against the base line's change and levels.
const nPointOf = (names: string) => new RegExp(`^\\s*(?:-|\\s)?(?:%|percent(?:age)?(?:\\s+points?)?|points?|pp|pts)?\\s*of\\s+(?:the\\s+|that\\s+|an?\\s+)?(?:(?:${names})(?:\\s+line)?['’]s\\s+)?(\\d+(?:\\.\\d+)?)[-\\s]?(?:percentage[-\\s])?points?\\b([\\s\\S]*)`, 'i');
// The base named by the figure's own phrase, by an allowlist (controller ruling,
// Task 27 review, 20 Oct): "of" (or "in … terms"), then only the words below, the
// base (longest alias first), at most one noun that is still the base's level,
// then the phrase's end. Anything else is no base established.
const BASE_BEFORE = `(?:(?:the|old|current|today['’]s|total|prior|our|its|two\\s+years\\s+ago['’]s)\\s+){0,3}`;
// No "share": "the COGS share" is COGS as a share of revenue, and points of it are revenue points (Task 27 re-review, 20 Oct).
const BASE_NOUN = '(?:\\s+(?:line|base|spend|costs|terms|bill))?';
const PHRASE_END = `(?=\\s*(?:[.;:!?)]|$)|\\s*[—–]|\\s+-\\s|,(?!\\s*(?:which|that)\\b))`;
const strictBaseOf = (names: string) => {
  const alt = names.split('|').sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`^\\s*(?:-|\\s)?(?:%|percent(?:age)?(?:\\s+points?)?|points?|pp|pts)?\\s*(?:of\\s+${BASE_BEFORE}(?:${alt})${BASE_NOUN}|in\\s+${BASE_BEFORE}(?:${alt})\\s+terms)${PHRASE_END}`, 'i');
};

// What follows each place their figure is said in the window: the unit and what it is "of".
// `sentence`: the rest of its sentence, the figure left out — up to the next capitalised
// sentence, so an STT run-on ("of cogs. like out of the 58") stays one sentence.
type Tail = { tail: string; before: string; sentence: string };
function tailsOf(window: string, figure: number): Tail[] {
  const out: Tail[] = [];
  const breaks = [...window.matchAll(/[.!?](?=\s+[A-Z])|\n/g)].map(b => b.index!);
  for (const m of window.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    if (Math.abs(parseFloat(m[0].replace(/,/g, '')) - figure) > 1e-9) continue;
    const at = m.index! + m[0].length;
    const from = Math.max(-1, ...breaks.filter(i => i < m.index!)) + 1;
    const to = Math.min(window.length, ...breaks.filter(i => i >= at));
    out.push({ tail: window.slice(at, at + 70), before: window.slice(Math.max(0, m.index! - 40), m.index!), sentence: `${window.slice(from, m.index!)} ${window.slice(at, to)}` });
  }
  return out;
}

// Their figure: the first in their value, less the input code computes from ("a 10% rise … 5 points" → 5).
export function theirFigure(c: CheckerClaim): number | undefined {
  const input = boundInput(c);
  return numbersOf(c.candidateValue).find(n => input === null || Math.abs(n - input) > 1e-9);
}

// Every reading of the claim's quantity code computes: code's own figure, and
// for a revenue-points step its share base's (prof-001's COGS: points of COGS
// growth on the step's base level, a share of the line's increase); for a
// price rise, a cost line back to its prior level (current share / prior − 1).
export function readingsOf(c: CheckerClaim & { correctionFigure?: string | null }, ctx: VetContext): Reading[] {
  const value = codeValueOf(c);
  if (value === null) return [];
  const out: Reading[] = [{ quantity: "code's quantity", value }];
  const q = c.codeQuantity;
  if (q.kind === 'step') {
    const st = ctx.caseData.mathSteps.find(s => s.id === q.stepId) as Step | undefined;
    if (inRevenuePoints(st)) for (const b of basesOf(ctx, st)) {
      const level = st?.timeframe === 'current' ? b.current : b.prior;
      if (level) out.push({ quantity: `points of ${b.name}`, value: value / level * 100 });
      if (b.current !== undefined && b.prior !== undefined && b.current !== b.prior) out.push({ quantity: `a share of the ${b.name} increase`, value: value / Math.abs(b.current - b.prior) * 100 });
    }
  }
  if (q.kind === 'needed_for_gain' || q.kind === 'needed_for_margin') {
    for (const l of costLines(ctx)) if (l.prior !== undefined && l.prior > 0 && l.prior !== l.current) out.push({ quantity: `${l.name} back to ${l.prior}% of revenue`, value: (l.current / l.prior - 1) * 100 });
  }
  return out;
}
// Whether a figure is right on one of those readings.
export const rightOnSome = (figure: number, readings: Reading[]) => readings.find(r => agrees(figure, r.value)) ?? null;

// How the candidate framed the claim's figure. `window`: the claim's sentence
// and the one before it, then their next two messages.
export function frameOfClaim(c: CheckerClaim & { correctionFigure?: string | null }, window: string, ctx: VetContext): QuantityFrame {
  const theirs = theirFigure(c);
  if (theirs === undefined) return { kind: 'unstated', rightOn: null };
  const unstated = (): QuantityFrame => ({ kind: 'unstated', rightOn: rightOnSome(theirs, readingsOf(c, ctx)) });
  const text = normalizeNumberWords(window);
  const tails = tailsOf(text, theirs);
  const q = c.codeQuantity;
  if (q.kind === 'step') {
    const st = ctx.caseData.mathSteps.find(s => s.id === q.stepId) as Step | undefined;
    const value = codeValueOf(c);
    const unit = firstUnit(st);
    // On a share-base step, points of the base line's change said with its size
    // in revenue points ("5.8 points of the 16-point COGS increase", N = 58 − 42
    // within rounding) are revenue points, and revenue points said with their
    // figure anywhere ("5.8 points of revenue") win over a COGS reading (Lorenzo,
    // 19 Oct, round 4 ruling 1; batch 33 Marisol 31e33506 t11/t13). "Of the
    // 37.5-point COGS increase" is no such change.
    const bases = inRevenuePoints(st) ? basesOf(ctx, st) : [];
    const changes = bases.flatMap(b => (b.current !== undefined && b.prior !== undefined && b.current !== b.prior ? [Math.abs(b.current - b.prior)] : []));
    // Of the base line's level in revenue points, named as the base's: "of the 42 points of COGS" (Task 27 review, 20 Oct).
    const levels = bases.flatMap(b => [b.current, b.prior].filter((x): x is number => x !== undefined));
    const allNames = bases.map(b => b.names).join('|');
    const nPoint = bases.length > 0 ? nPointOf(allNames) : null;
    const ofRevenueChange = (tail: string) => {
      const m = nPoint?.exec(tail);
      if (!m) return false;
      const n = parseFloat(m[1]);
      return changes.some(x => agrees(n, x)) || (levels.some(x => agrees(n, x)) && new RegExp(`^\\s*(?:of\\s+(?:the\\s+)?)?(?:${allNames})\\b`, 'i').test(m[2]));
    };
    // In points, or with no unit of its own ("5.8 of the 16 points"); a percent of it is a share.
    const revenuePart = (tail: string) => ofRevenueChange(tail) && (POINTS_AT.test(tail) || !UNIT_AT.test(tail));
    const revenueSaid = tails.some(t => !NOT_BEFORE.test(t.before) && (REVENUE_UNITS.test(t.tail) || revenuePart(t.tail)));
    if (inRevenuePoints(st) && value !== null && !revenueSaid) {
      for (const b of bases) {
        const level = st?.timeframe === 'current' ? b.current : b.prior;
        if (level === undefined || level === 0) continue;
        const onBase = value / level * 100;
        // Their figure with the base attached ("10 points of the 37.5 percent. increasing COGS"),
        // or their units named for the base anywhere ("I was saying in points of COGS").
        const namesBase = (tail: string) => new RegExp(`^\\s*(?:%|percent(?:age)?(?:\\s+points?)?|points?|pp|pts)?\\s*(?:of|in)\\s+(?:the\\s+)?(?:[^?!]{0,40}?\\s)?(?:${b.names})\\b`, 'i').test(tail)
          && !new RegExp(`^\\s*(?:%|percent(?:age)?(?:\\s+points?)?|points?|pp|pts)?\\s*of\\s+(?:total\\s+)?(?:revenue|sales)\\b`, 'i').test(tail);
        const attached = tails.some(t => namesBase(t.tail));
        const named = [...text.matchAll(new RegExp(`\\b(?:points?|percent|%)\\s+of\\s+(?:the\\s+)?(?:${b.names})\\b(?!\\s+(?:as|is|was|were)\\b)|\\bin\\s+(?:${b.names})\\s+terms\\b|\\bon\\s+an?\\s+(?:${b.names})\\s+base\\b`, 'gi'))]
          .some(m => !NOT_BEFORE.test(text.slice(Math.max(0, m.index! - 30), m.index!)));
        // "10% of the increase": the base line's growth (10 points of COGS growth) or a share of its increase (26%).
        const ofIncrease = tails.some(t => /^\s*(?:%|percent|points?)?\s*of\s+(?:the\s+|that\s+)?(?:increase|rise|growth|jump)\b/i.test(t.tail));
        const share = b.current !== undefined && b.prior !== undefined && b.current !== b.prior ? value / Math.abs(b.current - b.prior) * 100 : undefined;
        const quantity = `points of ${b.name}`;
        if ((attached || named || ofIncrease) && agrees(theirs, onBase)) return { kind: 'own_right', quantity, value: onBase };
        if (ofIncrease && share !== undefined && agrees(theirs, share)) return { kind: 'own_right', quantity: `a share of the ${b.name} increase`, value: share };
        // "In COGS terms … not X" only when every mention of their figure with a
        // unit names the base in its own phrase (Lorenzo, 19 Oct, round 4 ruling 1;
        // batch 33 Marisol 31e33506 t14). Otherwise neither base is established:
        // code's figure with no "not X" — the conversion when it is right on a
        // reading (controller ruling, Task 27 review, 19 Oct).
        // A mention whose sentence also carries the base line's change or level in
        // revenue points ("5.8 points of COGS, out of the 16-point increase", "of the
        // COGS line, up from 42") establishes no base (controller ruling, Task 27
        // re-review, 20 Oct).
        const strict = strictBaseOf(b.names);
        const onBaseOnly = (t: Tail) => strict.test(t.tail) && !numbersOf(t.sentence).some(n => [...changes, ...levels].some(x => agrees(n, x)));
        if (attached) return tails.some(onBaseOnly) && tails.filter(t => UNIT_AT.test(t.tail) && !NOT_BEFORE.test(t.before)).every(onBaseOnly)
          ? { kind: 'own_wrong', quantity, value: onBase }
          : unstated();
      }
    }
    // A bare "points" is code's unit only where the step has no other points
    // reading (Lorenzo, 17 Oct, ruling c): on a share-base step it is ambiguous — the 9ccf0836 shape.
    const basis = codeUnitSaid(tails, unit, st, { barePoints: !(inRevenuePoints(st) && basesOf(ctx, st).length > 0) });
    if (basis) return { kind: 'code', basis };
    if (tails.some(t => !NOT_BEFORE.test(t.before) && revenuePart(t.tail))) return { kind: 'code', basis: 'points of the N-point change (revenue points)' };
    return unstated();
  }
  if (q.kind === 'needed_for_gain' || q.kind === 'needed_for_margin') {
    // A price rise that takes a cost line back to a level: current share / target − 1.
    const lines = costLines(ctx);
    for (const l of lines) {
      const re = new RegExp(`\\b(?:${l.names})\\b[^.?!]{0,40}?\\b(?:(?:fall|falls|falling|go|goes|come|comes|get|gets|bring|brings)\\s+(?:back\\s+)?(?:down\\s+)?|back\\s+(?:down\\s+)?|return(?:s|ing)?\\s+)(?:to|toward|towards)\\s+(?:about\\s+|roughly\\s+|~)?(\\d+(?:\\.\\d+)?)`, 'gi');
      for (const m of text.matchAll(re)) {
        const target = parseFloat(m[1]);
        if (!(target > 0) || target === l.current) continue;
        const rise = (l.current / target - 1) * 100;
        const quantity = `${l.name} back to ${target}% of revenue`;
        return agrees(theirs, rise) ? { kind: 'own_right', quantity, value: rise } : { kind: 'own_wrong', quantity, value: rise };
      }
    }
  }
  if (q.kind !== 'none' && marginSaid(c, text, tails)) return { kind: 'code', basis: 'margin named' };
  if ((q.kind === 'new_margin' || q.kind === 'breakeven') && tails.some(t => /^\s*(?:%|percent\b)/i.test(t.tail))) return { kind: 'code', basis: 'percent' };
  // A margin gain has no other points reading: a bare "points" is its unit.
  if (q.kind === 'gain' && tails.some(t => /^\s*(?:-|\s)?(?:percentage\s+)?(?:points?|pp|pts)\b(?!\s+of\s+(?!(?:the\s+)?margin|(?:total\s+)?revenue))/i.test(t.tail))) return { kind: 'code', basis: 'bare points (a margin gain)' };
  return unstated();
}

// The step's unit, said with their figure: a bare unit, "of revenue", or the quantity's own noun.
// Returns what showed it (logged), or null.
function codeUnitSaid(tails: Tail[], unit: string | undefined, st: Step | undefined, opts: { barePoints: boolean }): string | null {
  const ofOther = (t: string) => /^\s*(?:%|percent(?:age)?(?:\s+points?)?|points?|pp|pts)?\s*(?:of|in)\s+(?!(?:the\s+)?(?:total\s+)?(?:revenue|sales|margin)\b)/i.test(t);
  const words = quantityWords(st?.quantity ?? '');
  for (const { tail, before } of tails) {
    if (NOT_BEFORE.test(before)) continue;
    if (REVENUE_UNITS.test(tail)) return 'revenue or margin units attached';
    if (ofOther(tail)) continue;
    if (unit === 'points' && opts.barePoints && /^\s*(?:-|\s)?(?:percentage\s+)?(?:points?|pp|pts)\b/i.test(tail)) return 'bare points';
    if (unit === 'percent' && /^\s*(?:%|percent\b)/i.test(tail)) return 'percent';
    if (unit === 'usd' && (/\$\s?$/.test(before) || /^\s*(?:m|mn|million|bn|billion|k|thousand|dollars?)\b/i.test(tail))) return 'money';
    const next = (tail.match(/^\s*([a-z]+)/i)?.[1] ?? '').toLowerCase().replace(/s$/, '');
    if (unit !== 'points' && unit !== 'percent' && unit !== 'usd' && next.length >= 3 && words.has(next)) return `the quantity's noun (${next})`;
  }
  return null;
}

// A margin quantity named: in the claim's sentence or right after the figure.
function marginSaid(c: CheckerClaim, text: string, tails: Tail[]): boolean {
  const span = normalizeNumberWords(c.span).toLowerCase().split(/\s*(?:\.\.\.|…)\s*/)[0].slice(0, 30);
  const sentence = sentencesOf(text).find(s => s.toLowerCase().includes(span)) ?? normalizeNumberWords(c.span);
  const m = /\bmargins?\b/i.exec(sentence);
  if (m && !NOT_BEFORE.test(sentence.slice(Math.max(0, m.index - 30), m.index))) return true;
  return tails.some(t => /^\s*(?:%|percent|points?)?\s*(?:of|off)\s+(?:the\s+)?margin\b|^\s*margin\b/i.test(t.tail));
}

// The pricing model's cost lines with today's level and their names (the share bases' too).
function costLines(ctx: VetContext): { name: string; names: string; current: number; prior?: number }[] {
  const ids = ctx.caseData.pricingModel?.costItems ?? [];
  return ids.flatMap(id => {
    const d = ctx.caseData.dataLedger.find(x => x.id === id);
    const k = Object.entries(d?.timeframes ?? {}).find(([, p]) => p === 'current' || p === 'both')?.[0];
    const pk = Object.entries(d?.timeframes ?? {}).find(([, p]) => p === 'prior' || p === 'both')?.[0];
    if (!d || k === undefined) return [];
    const base = (ctx.caseData.shareBases ?? []).find(b => b.item === id);
    const head = d.label.split(/\s+(?:as|\/|\()\s*/)[0].trim();
    const name = base?.name ?? (/^[A-Z]{2,}/.test(head) ? head : head.toLowerCase());
    const names = [name, ...(base?.aliases ?? [])].map(esc).join('|');
    return [{ name, names, current: Number(k), ...(pk !== undefined ? { prior: Number(pk) } : {}) }];
  });
}

// Code's own figure for the claim's quantity (the vetted correction's).
function codeValueOf(c: CheckerClaim & { correctionFigure?: string | null }): number | null {
  return c.correctionFigure ? Number(c.correctionFigure) : null;
}

const spoken = (x: number) => String(Math.abs(x) >= 1 ? Math.round(x * 10) / 10 : Number(x.toPrecision(2)));

// The line code says for a correction, by how the candidate framed it: today's
// correction, a conversion (no "not"), or the correction on their quantity.
// null: say nothing new (no line can be written).
export function framedCorrection(c: CheckerClaim & { correctionLine: string | null; correctionFigure: string | null }, frame: QuantityFrame, ctx: VetContext):
  { line: string; derived: string[]; converted: boolean; note: string } | null {
  if (!c.correctionLine || !c.correctionFigure) return null;
  const figure = c.correctionFigure;
  // Code's quantity said — or a line with no "not X" in it (a relative change stated as points): as written.
  const statement = c.correctionLine.replace(/,\s+not\s+[^,.]*?(?:\.\d+[^,.]*)?\.$/, '.');
  if (frame.kind === 'code') return { line: c.correctionLine, derived: [figure], converted: false, note: `code's quantity stated (${frame.basis})` };
  if (statement === c.correctionLine) return { line: c.correctionLine, derived: [figure], converted: false, note: 'no "not X" in the line' };
  const q = c.codeQuantity;
  const st = q.kind === 'step' ? ctx.caseData.mathSteps.find(s => s.id === q.stepId) as Step | undefined : undefined;
  // Wrong on every reading, no quantity stated: code's figure, no "not X", the step open.
  if (frame.kind === 'unstated' && !frame.rightOn) return { line: statement, derived: [figure], converted: false, note: 'no quantity stated, wrong on every reading: code\'s figure without "not X"' };
  if (frame.kind === 'own_right' || frame.kind === 'unstated') {
    const on = frame.kind === 'own_right' ? frame.quantity : frame.rightOn!.quantity;
    const note = frame.kind === 'own_right' ? `right on their own quantity (${on})` : `no quantity stated, right on ${on}`;
    if (st && inRevenuePoints(st) && /^points of |^a share of /.test(on)) {
      const unit = firstUnit(st) === 'percent' ? '%' : ' points';
      return { line: `In revenue terms, that's about ${figure}${unit}.`, derived: [figure], converted: true, note };
    }
    // The correction without its "not X": a statement of code's figure for code's quantity.
    return { line: statement, derived: [figure], converted: true, note };
  }
  // Wrong on their own quantity: corrected on it, naming it.
  const said = numbersOf(c.candidateValue)[0];
  if (said === undefined) return null;
  const x = spoken(frame.value);
  if (q.kind === 'step' && st?.quantity) {
    const name = st.quantity.replace(/\s*\([^)]*\)/g, '').replace(/,?\s*(?:in\s+)?(?:points|share|percent) of revenue\b/i, '').trim();
    const base = frame.quantity.replace(/^points of /, '');
    const unit = /%|percent/i.test(c.candidateValue) ? '%' : ' points';
    return { line: `In ${base} terms, ${name} is about ${x}${unit}, not ${spoken(said)}.`, derived: [x], converted: false, note: `wrong on their own quantity (${frame.quantity})` };
  }
  if (q.kind === 'needed_for_gain' || q.kind === 'needed_for_margin') {
    return { line: `Getting ${frame.quantity} takes about ${articleFor(x)} ${x}% price rise, not ${spoken(said)}%.`, derived: [x], converted: false, note: `wrong on their own quantity (${frame.quantity})` };
  }
  return { line: c.correctionLine, derived: [figure], converted: false, note: `wrong on their own quantity (${frame.quantity}); no wording on it` };
}

// The window a claim is read in: its sentence and the one before, then the next two messages.
export function claimWindow(span: string, message: string, later: string[]): string {
  const sentences = sentencesOf(message);
  // Each piece of the span ("… about 38% ... to recover the 16 points") finds its sentence; each brings the one before.
  const pieces = normalizeNumberWords(span).toLowerCase().split(/\s*(?:\.\.\.|…)\s*|(?<=[.!?])\s+/).map(x => x.trim().slice(0, 25)).filter(x => x.length >= 6);
  const hit = sentences.flatMap((x, i) => pieces.some(p => x.toLowerCase().includes(p)) ? [i - 1, i] : []).filter(i => i >= 0);
  const own = hit.length === 0 ? [normalizeNumberWords(span)] : [...new Set(hit)].sort((a, b) => a - b).map(i => sentences[i]);
  return [...own, ...later.slice(0, 2).map(normalizeNumberWords)].join(' ');
}
