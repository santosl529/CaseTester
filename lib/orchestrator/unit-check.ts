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
import { normalizeNumberWords } from '@/lib/number-words';

export type ShareBase = {
  name: string;          // how the base line is spoken: "COGS"
  aliases: string[];     // other ways to say it: "cost of goods sold"
  item: string;          // the ledger item that gives its share of revenue (cogs_pct)
};

type BaseValue = { value: number; timeframe: 'current' | 'prior' };

export type UnitFlag = {
  kind: 'unit';
  span: string;            // the candidate's sentence
  stated: number;          // the figure they gave
  units: string;           // the units they gave it in ("points of revenue")
  quantity: string;        // what the figure is ("the 25% share of COGS, up 40%")
  base: string;            // "COGS at 42% of revenue (two years ago)"
  baseValue: number;
  timeframe: 'current' | 'prior';
  unconverted: number;     // share × change: the value without the conversion
  expected: number;        // the converted value at that base
};

export type UnitVerified = { span: string; stated: number; expected: number };

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

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.35, Math.abs(b) * 0.04);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function checkNestedConversions(
  rawText: string,
  p: {
    bases: ShareBase[];
    items: { id: string; timeframes?: Record<string, string> }[];
    revealedIds: Iterable<string>;
  },
): { flags: UnitFlag[]; verified: UnitVerified[] } {
  const revealed = new Set(p.revealedIds);
  let text = normalizeNumberWords(rawText);
  for (const [re, v] of QUARTER_WORDS) text = text.replace(re, v);
  const sentences = sentencesOf(text);
  const flags: UnitFlag[] = [];
  const verified: UnitVerified[] = [];

  for (const base of p.bases) {
    // The candidate can only convert with a base they have been given.
    if (!revealed.has(base.item)) continue;
    const values = baseValues(p.items.find(i => i.id === base.item)?.timeframes);
    if (values.length === 0) continue;
    const names = [base.name, ...base.aliases].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
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
        const stated = parseFloat(m[1] ?? m[2]);
        const units = /margin/i.test(m[0]) ? 'points of margin' : 'points of revenue';
        const converted: { value: number; share: number; change?: number; base: BaseValue }[] = [];
        // share: the share restated as revenue points; delta: share × change; level: share × (1 + change).
        const unconverted: { value: number; share: number; change?: number; form: 'share' | 'delta' | 'level' }[] = [];
        for (const s of shares) {
          for (const b of values) {
            converted.push({ value: s * b.value / 100, share: s, base: b });
            for (const c of changes) {
              converted.push({ value: s * b.value / 100 * c / 100, share: s, change: c, base: b });
              converted.push({ value: s * b.value / 100 * (1 + c / 100), share: s, change: c, base: b });
            }
          }
          unconverted.push({ value: s, share: s, form: 'share' });
          for (const c of changes) {
            unconverted.push({ value: s * c / 100, share: s, change: c, form: 'delta' });
            unconverted.push({ value: s * (1 + c / 100), share: s, change: c, form: 'level' });
          }
        }
        const ok = converted.find(c => near(stated, c.value));
        if (ok) { verified.push({ span: sentence, stated, expected: round1(ok.value) }); continue; }
        const miss = unconverted.find(u => near(stated, u.value));
        if (!miss) continue;
        // The base: the value the candidate cited ("COGS is 58% of revenue"),
        // else the prior one (a cost line's mix is usually its old one), else current.
        const cited = values.find(v => new RegExp(`(?<![\\d.])${v.value}${PCT}`, 'i').test(window));
        const b = cited ?? values.find(v => v.timeframe === 'prior') ?? values[0];
        const atBase = miss.share * b.value / 100;
        const expected = round1(miss.form === 'share' ? atBase : miss.form === 'delta' ? atBase * miss.change! / 100 : atBase * (1 + miss.change! / 100));
        flags.push({
          kind: 'unit', span: sentence, stated, units,
          quantity: `the ${miss.share}% share of ${base.name}${miss.change !== undefined ? `, up ${miss.change}%` : ''}`,
          base: `${base.name} at ${b.value}% of revenue (${b.timeframe === 'prior' ? 'two years ago' : 'today'})`,
          baseValue: b.value, timeframe: b.timeframe, unconverted: round1(miss.value), expected,
        });
      }
    });
  }
  return { flags, verified };
}

// The interviewer-facing line for a unit flag: the claim and the case facts,
// so the probe is about what the candidate actually said. The model is told
// the figure only so it can tell the flag is real; it never says it.
export function formatUnitFlagLine(f: UnitFlag): string {
  return `- UNIT: the candidate said ${f.stated} ${f.units} in "${f.span}". ${f.quantity[0].toUpperCase()}${f.quantity.slice(1)} is ${f.unconverted} points of the cost line, not of revenue; with ${f.base} it is about ${f.expected} ${f.units}. Probe the units once — "Points of what?" — and let them convert; don't name the method or the figure.`;
}
