// Nested-percentage conversions, checked numerically (docs/interviewer-
// behavior.md Rules 2/14; round-3 fixes, 11 Oct 2026). A share OF a cost line
// converted into points OF revenue or margin must be multiplied by that cost
// line's own share of revenue: beans at 25% of COGS, with COGS at 42% of
// revenue, are 10.5 points of revenue, and a 40% bean rise adds 4.2 points —
// not 10.
//
// The earlier detector fired on keywords ("of COGS" + "points"/"of revenue")
// and the interviewer then asked "Points of what?" — in batch 18 it fired in
// 38 of 62 interviews, nearly always on correct work, and 9 candidates were
// doubted for math they had right. Now the claim itself is checked with the
// case figures the candidate already has:
//   - a result stated in points / percent OF REVENUE or OF MARGIN (a result
//     in points of COGS, or "COGS growth", is a different quantity, not an
//     error),
//   - next to a share of the base line ("25% of COGS") in the same sentence or
//     the one before, with any change stated there ("up 40%"),
//   - compared with the converted value (share × base × change) for every
//     base value the candidate has been given, and with the unconverted one
//     (share × change).
// Matches a converted value → verified correct. Matches only the unconverted
// value → a unit flag naming the claim, the quantity, its units, the base and
// its timeframe. Anything else → unverified, and unverified is never a reason
// to doubt the candidate (probe-guard.ts). The candidate's own assumed share
// works too ("beans at 60% of COGS"): the check needs the base, not the case's
// share.
//
// The base is the candidate's own (Lorenzo, 15 Oct; batch 27 Sofia t17 "COGS is
// 58, and if beans are 25% of COGS that's 25 points of revenue" was corrected
// to 10.5, the two-years-ago figure, though on her base it is 14.5): a base
// level they state for the line ("COGS is 58", "today's 58% COGS line",
// "0.25 × 58", "25% of 50", "a 42-point base") is the one the conversion is
// checked at; two years ago only when they state none. A figure right on their
// own base is no unit error — when the share is a figure of another year
// (Marisol t8: "25% of COGS … 0.25 × 58 = 14.5"), at most a question which
// year the share is from (a PeriodQuestion, never a flag).
import { normalizeNumberWords } from '@/lib/number-words';

export type ShareBase = {
  name: string;          // how the base line is spoken: "COGS"
  aliases: string[];     // other ways to say it: "cost of goods sold"
  item: string;          // the ledger item that gives its share of revenue (cogs_pct)
};

type BaseValue = { value: number; timeframe: 'current' | 'prior' };
// A base's period: the case's two levels, or a level only the candidate used (prof-001's 50, last year's).
export type BasePeriod = 'current' | 'prior' | 'stated';

export type UnitFlag = {
  kind: 'unit';
  span: string;            // the candidate's sentence
  stated: number;          // the figure they gave
  units: string;           // the units they gave it in ("points of revenue")
  quantity: string;        // what the figure is ("the 25% share of COGS, up 40%")
  base: string;            // "COGS at 42% of revenue (two years ago)"
  baseName: string;        // "COGS"
  baseValue: number;
  timeframe: BasePeriod;
  baseStated: boolean;     // the base is one the candidate stated (else the share's own year, else two years ago)
  // No base stated and no year for the share (the candidate's own share): both of the case's levels, for a correction that names each.
  otherBases?: { value: number; timeframe: 'current' | 'prior' }[];
  share: number;
  change?: number;         // the change applied to the share, if any
  form: 'share' | 'delta' | 'level';  // share as points; share × change; share × (1 + change)
  unconverted: number;     // share × change: the value without the conversion
  expected: number;        // the converted value at that base
};

export type UnitVerified = { span: string; stated: number; expected: number };

// A conversion right on the candidate's own base, with a share the case gives
// for another year (Lorenzo, 15 Oct): no error to flag — at most one question
// which year the share is from.
export type PeriodQuestion = { span: string; stated: number; share: number; sharePeriod: 'current' | 'prior'; baseName: string; baseValue: number };

const QUARTER_WORDS: [RegExp, string][] = [
  [/\bthree[- ]quarters\b/gi, '75%'], [/\ba quarter\b/gi, '25%'], [/\bhalf\b/gi, '50%'], [/\ba third\b/gi, '33.3%'],
];

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const PCT = String.raw`\s*(?:%|percent\b)`;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

function baseValues(timeframes: Record<string, string> | undefined): BaseValue[] {
  return Object.entries(timeframes ?? {}).flatMap(([v, tf]): BaseValue[] => {
    const value = parseFloat(v);
    if (Number.isNaN(value)) return [];
    if (tf === 'current' || tf === 'prior') return [{ value, timeframe: tf }];
    if (tf === 'both') return [{ value, timeframe: 'current' }, { value, timeframe: 'prior' }];
    return [];
  });
}

// The candidate assumes the share still holds: not a mismatch, an assumption.
const ASSUMED = /\b(?:if|assum\w*|suppose|say|still|presumably|hypothetically)\b/i;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.35, Math.abs(b) * 0.04);
const round1 = (n: number) => Math.round(n * 10) / 10;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The base level the candidate states for the line in this text, if any:
// "COGS is 58", "the current COGS of 58", "COGS at 42% of revenue", "today's
// 58% COGS line", "a 42-point base", "0.25 × 58", "25% of 50".
export function statedBaseOf(text: string, names: string, shares: number[], changes: number[]): number | undefined {
  const fracs = (s: number) => {
    const f = String(Math.round(s * 1000) / 100000).replace(/^0/, '');
    return [`0${f}`, f, `${s}\\s*(?:%|percent)`].map(x => x.replace('.', '\\.')).join('|');
  };
  const found: number[] = [];
  for (const s of shares) {
    const re = new RegExp(`(?:${fracs(s)})\\s*(?:×|x|\\*|times|of)\\s*(?:about\\s+|roughly\\s+|~)?${NUM}(?!\\s*(?:%|percent)?\\s*of\\s+(?:the\\s+)?(?:${names}))|${NUM}\\s*(?:%|percent)?\\s*(?:×|\\*|times)\\s*(?:${fracs(s)})`, 'gi');
    for (const m of text.matchAll(re)) found.push(parseFloat(m[1] ?? m[2]));
  }
  const level = new RegExp([
    `\\b(?:${names})\\s+(?:is|was|of|at|=|sits at|stands at|stood at|now at|is now|is today|today is)\\s+(?:now\\s+|today\\s+|about\\s+|roughly\\s+|around\\s+|~\\s*)?${NUM}(?!\\s*(?:%|percent)?\\s*(?:of\\s+(?:the\\s+)?(?:${names})|increase|growth|rise|higher|jump))`,
    `(?:today'?s|current|last year'?s|prior|the|a|an)\\s+${NUM}\\s*(?:%|percent|-?\\s*points?)?\\s+(?:${names})(?:\\s+(?:line|base|figure|level))?\\b(?!\\s+(?:growth|increase|rise|inflation))`,
    `\\bbase\\s+(?:of|at)\\s+${NUM}|${NUM}\\s*(?:%|percent|-?\\s*points?)?\\s+base\\b`,
  ].join('|'), 'gi');
  for (const m of text.matchAll(level)) found.push(parseFloat(m[1] ?? m[2] ?? m[3] ?? m[4]));
  // A fraction is a percent ("0.58 × 0.25"); a share or a stated change is never the base ("0.40 × 25% = 10": 0.40 is the 40% rise).
  return found.map(n => (n < 1 ? n * 100 : n)).find(n => n > 0 && n <= 100 && !shares.some(s => near(n, s)) && !changes.some(c => near(n, c)));
}

export function checkNestedConversions(
  rawText: string,
  p: {
    bases: ShareBase[];
    items: { id: string; value?: string; timeframes?: Record<string, string> }[];
    revealedIds: Iterable<string>;
  },
): { flags: UnitFlag[]; verified: UnitVerified[]; periodQuestions: PeriodQuestion[] } {
  const revealed = new Set(p.revealedIds);
  let text = normalizeNumberWords(rawText);
  for (const [re, v] of QUARTER_WORDS) text = text.replace(re, v);
  const sentences = sentencesOf(text);
  const flags: UnitFlag[] = [];
  const verified: UnitVerified[] = [];
  const periodQuestions: PeriodQuestion[] = [];

  for (const base of p.bases) {
    // The candidate can only convert with a base they have been given.
    if (!revealed.has(base.item)) continue;
    const values = baseValues(p.items.find(i => i.id === base.item)?.timeframes);
    if (values.length === 0) continue;
    const names = [base.name, ...base.aliases].map(esc).join('|');
    // The period of a share the case states of this base ("Coffee beans were
    // 25% of COGS two years ago"), or of its complement ("the other 75%"): a
    // share converts only at the base of its own period. Marisol t8 (batch
    // 21): "25% of COGS, so against the current 58, that's 14.5 points" mixes
    // the old mix with today's COGS and was verified correct.
    const sharePeriod = (share: number): 'current' | 'prior' | undefined => {
      for (const item of p.items.filter(i => revealed.has(i.id) && i.value)) {
        for (const [fig, tf] of Object.entries(item.timeframes ?? {})) {
          if (tf !== 'current' && tf !== 'prior') continue;
          const f = parseFloat(fig);
          const statesShare = new RegExp(`(?<![\\d.])${fig.replace('.', '\\.')}\\s*(?:%|percent)\\s+of\\s+(?:the\\s+|total\\s+)?(?:${names})\\b`, 'i').test(item.value!);
          if (statesShare && (Math.abs(f - share) < 1e-9 || Math.abs(100 - f - share) < 1e-9)) return tf;
        }
      }
      return undefined;
    };
    // "25% of COGS" — not "10% of COGS growth", which is itself a result.
    const SHARE = new RegExp(`${NUM}${PCT}\\s+of\\s+(?:total\\s+|the\\s+|our\\s+|their\\s+)?(?:${names})\\b(?!\\s+(?:growth|increase|change|inflation|rise))`, 'gi');
    const CHANGE = new RegExp(String.raw`(?:\b(?:up|rose|risen|rising|increased|increasing|grew|grown|jumped|climbed|inflated|spiked)\s+(?:by\s+)?(?:about\s+|roughly\s+|~)?${NUM}${PCT}|${NUM}${PCT}\s+(?:rise|increase|jump|inflation|spike|hike|higher)\b|\+\s?${NUM}${PCT})`, 'gi');
    // A result in revenue or margin units: "4.2 points of revenue", "10% of
    // revenue", "10 margin points", "10 points off the margin". A margin LEVEL
    // ("a 6% margin") is not one.
    const RESULT = new RegExp(String.raw`${NUM}\s*(?:%|percent\b|percentage points?\b|points?\b|pp\b|pts\b)\s+(?:of\s+(?:total\s+)?(?:revenue|sales)\b|(?:of|off)\s+(?:the\s+)?margin\b)|${NUM}\s+(?:margin|revenue)\s+points?\b`, 'gi');

    // A result in the base line's own units ("10 points of COGS growth", "a
    // 28% increase in COGS"): a different quantity from points of revenue —
    // verified when it is share × change, never flagged.
    const BASE_RESULT = new RegExp(String.raw`${NUM}\s*(?:%|percent\b|points?\b)\s+(?:of\s+)?(?:the\s+)?(?:${names})\s+(?:growth|increase|rise|inflation)\b|${NUM}\s*(?:%|percent\b|points?\b)\s+(?:growth|increase|rise|inflation)\s+in\s+(?:the\s+)?(?:${names})\b`, 'gi');

    sentences.forEach((sentence, i) => {
      const window = [sentences[i - 1] ?? '', sentence].join(' ');
      const shares = [...window.matchAll(SHARE)].map(m => parseFloat(m[1]));
      if (shares.length === 0) return;
      const changes = [...window.matchAll(CHANGE)].map(m => parseFloat(m[1] ?? m[2] ?? m[3]));
      for (const m of sentence.matchAll(BASE_RESULT)) {
        const stated = parseFloat(m[1] ?? m[2]);
        const hit = shares.flatMap(sh => changes.map(c => sh * c / 100)).find(v => near(stated, v));
        if (hit !== undefined) verified.push({ span: sentence, stated, expected: round1(hit) });
      }
      for (const m of sentence.matchAll(RESULT)) {
        // Denied or quoted, not claimed: "that's 10% of COGS, not 10 points of
        // revenue", 'call the answer "10 percentage points of revenue" — but…'.
        if (/(?:\b(?:not|isn't|aren't|wasn't|never)\s+(?:about\s+|roughly\s+|~\s*)?|["“])$/i.test(sentence.slice(0, m.index))) continue;
        const stated = parseFloat(m[1] ?? m[2]);
        const units = /margin/i.test(m[0]) ? 'points of margin' : 'points of revenue';
        // The candidate's own base for the line: this sentence's, else the one before.
        const own = statedBaseOf(sentence, names, shares, changes) ?? statedBaseOf(sentences[i - 1] ?? '', names, shares, changes);
        const forms = (s: number, b: number) => [
          { value: s * b / 100, form: 'share' as const, change: undefined as number | undefined },
          ...changes.flatMap(c => [{ value: s * b / 100 * c / 100, form: 'delta' as const, change: c }, { value: s * b / 100 * (1 + c / 100), form: 'level' as const, change: c }]),
        ];
        // Right on their own base: verified — or, with a share of another year, the period question.
        if (own !== undefined) {
          const right = shares.flatMap(s => forms(s, own).map(f => ({ ...f, share: s }))).find(f => near(stated, f.value));
          if (right) {
            const sp = sharePeriod(right.share);
            const samePeriod = sp === undefined || values.some(v => v.timeframe === sp && near(v.value, own));
            if (samePeriod || ASSUMED.test(window)) verified.push({ span: sentence, stated, expected: round1(right.value) });
            else periodQuestions.push({ span: sentence, stated, share: right.share, sharePeriod: sp, baseName: base.name, baseValue: own });
            continue;
          }
        }
        // Right at a base the case gives, in the share's own year.
        const converted = shares.flatMap(s => {
          const period = sharePeriod(s);
          return values.filter(v => period === undefined || v.timeframe === period).flatMap(b => forms(s, b.value));
        });
        const ok = converted.find(c => near(stated, c.value));
        if (ok) { verified.push({ span: sentence, stated, expected: round1(ok.value) }); continue; }
        // The unit slip: the share (or share × change) said as points of revenue.
        const unconverted = shares.flatMap(s => [
          { value: s, share: s, change: undefined as number | undefined, form: 'share' as const },
          ...changes.flatMap(c => [{ value: s * c / 100, share: s, change: c, form: 'delta' as const }, { value: s * (1 + c / 100), share: s, change: c, form: 'level' as const }]),
        ]);
        const miss = unconverted.find(u => near(stated, u.value));
        if (!miss) continue;
        // The base: the candidate's own; else the share's own year; else the prior one (a cost line's mix is usually its old one).
        const known = own !== undefined ? values.find(v => near(v.value, own)) : undefined;
        const sp = sharePeriod(miss.share);
        const b: { value: number; timeframe: BasePeriod } = own !== undefined ? { value: own, timeframe: known?.timeframe ?? 'stated' }
          : values.find(v => v.timeframe === sp) ?? values.find(v => v.timeframe === 'prior') ?? values[0];
        const otherBases = own === undefined && sp === undefined && values.length > 1 ? values : undefined;
        const atBase = miss.share * b.value / 100;
        const expected = round1(miss.form === 'share' ? atBase : miss.form === 'delta' ? atBase * miss.change! / 100 : atBase * (1 + miss.change! / 100));
        flags.push({
          kind: 'unit', span: sentence, stated, units,
          quantity: `the ${miss.share}% share of ${base.name}${miss.change !== undefined ? `, up ${miss.change}%` : ''}`,
          base: `${base.name} at ${b.value}% of revenue (${b.timeframe === 'prior' ? 'two years ago' : b.timeframe === 'current' ? 'today' : 'the base you used'})`,
          baseName: base.name, baseValue: b.value, timeframe: b.timeframe, baseStated: own !== undefined,
          share: miss.share, ...(miss.change !== undefined ? { change: miss.change } : {}), form: miss.form, ...(otherBases ? { otherBases } : {}),
          unconverted: round1(miss.value), expected,
        });
      }
    });
  }
  return { flags, verified, periodQuestions };
}

// The interviewer-facing line for a unit flag: the claim and the case facts,
// so the probe is about what the candidate actually said. The model is told
// the figure only so it can tell the flag is real; it never says it.
export function formatUnitFlagLine(f: UnitFlag): string {
  return `- UNIT: the candidate said ${f.stated} ${f.units} in "${f.span}". ${f.quantity[0].toUpperCase()}${f.quantity.slice(1)} is ${f.unconverted} points of the cost line, not of revenue; with ${f.base} it is about ${f.expected} ${f.units}. Probe the units once, naming their figure — "You put ${f.quantity} at ${f.stated} points — points of what?" — and let them convert; don't name the method or the right figure.`;
}

// Code's correction of a unit slip (Lorenzo, 15 Oct): the quantity, the base
// and its period, on the candidate's own base — never a bare "closer to X".
// "Two years ago, 25% of the 42-point COGS line was about 10.5 points of
// revenue, not 25." / "Today, 25% of the 58-point COGS line is about 14.5
// points of revenue, not 25."
export function unitCorrectionLine(f: UnitFlag): string {
  const r = (n: number) => String(Math.round(n * 10) / 10);
  const at = (b: number) => { const x = f.share * b / 100; return f.form === 'share' ? x : f.form === 'delta' ? x * f.change! / 100 : x * (1 + f.change! / 100); };
  // Neither a base they stated nor a year for the share: each of the case's levels, named.
  if (f.otherBases && f.otherBases.length > 1) {
    const [p, c] = [f.otherBases.find(b => b.timeframe === 'prior'), f.otherBases.find(b => b.timeframe === 'current')];
    if (p && c) {
      const what = `${f.share}% of ${f.baseName}${f.form === 'share' ? '' : `, up ${f.change}%,`}`;
      const verb = f.form === 'delta' ? 'adds' : 'is';
      return `${what[0].toUpperCase()}${what.slice(1)} ${verb} about ${r(at(p.value))} ${f.units} on two years ago's ${r(p.value)}-point ${f.baseName} line, or about ${r(at(c.value))} on today's ${r(c.value)} — not ${r(f.stated)}.`;
    }
  }
  const lead = f.timeframe === 'prior' ? `Two years ago, ${f.share}% of the ${r(f.baseValue)}-point ${f.baseName} line was`
    : f.timeframe === 'current' ? `Today, ${f.share}% of the ${r(f.baseValue)}-point ${f.baseName} line is`
      : `On the ${r(f.baseValue)}-point ${f.baseName} line you used, ${f.share}% is`;
  const atBase = f.share * f.baseValue / 100;
  if (f.form === 'share') return `${lead} about ${r(atBase)} ${f.units}, not ${r(f.stated)}.`;
  const tail = f.form === 'delta' ? `that adds about ${r(f.expected)} ${f.units}` : `that's about ${r(f.expected)} ${f.units}`;
  return `${lead} ${r(atBase)} ${f.units}; up ${f.change}%, ${tail}, not ${r(f.stated)}.`;
}

// The question for a share applied to another year's base (Lorenzo, 15 Oct):
// their arithmetic is right on their base, so no doubt and no figure — at most
// one question which year the share is from.
export function formatPeriodQuestionLine(q: PeriodQuestion): string {
  return `- PERIOD (no error to flag): the candidate applied the ${q.share}% share of ${q.baseName} — the case gives it for ${q.sharePeriod === 'prior' ? 'two years ago' : 'today'} — to ${q.baseName} at ${q.baseValue} in "${q.span}". Their arithmetic on that base is right: don't doubt it, correct it or name a figure. If it fits the turn, ask once, as a question: "Which year is that ${q.share}% share of ${q.baseName} from?"`;
}
