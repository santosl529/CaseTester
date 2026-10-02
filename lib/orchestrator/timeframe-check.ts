import { normalizeNumberWords } from '@/lib/number-words';

// Timeframe consistency (docs/interviewer-behavior.md Rule 6, v4.6). The
// provenance audit checks that a figure exists, not that two real figures
// belong together. Batch 2, Derek 4e9a3276 6:08: "If beans are a quarter of
// COGS, and COGS is 58% of revenue, what is the bean line as a percent of
// revenue?" — 25% is two years old, 58% is today's; the right pairing is
// 25% × 42%. LOG-ONLY until a batch measures the false-positive rate.

export type Period = 'current' | 'prior' | 'change' | 'both';

export type TimeframeItem = { id: string; timeframes?: Record<string, Period> };

export type TimeframeMismatch = {
  sentence: string;
  figures: { value: number; itemId: string; period: Period }[];
};

// Multiplicative or part-of-whole setups combine figures into one quantity.
// Changes across periods ("from 42% to 58%", "up from", "versus") are
// legitimate and excluded.
const ARITHMETIC_FRAME = /×|\btimes\b|\bmultipl\w*|\bif\b[^?]*\band\b[^?]*\bwhat\b|\bof\b[^.?!]*\bof\b/i;
const CHANGE_FRAME = /\bfrom\b[^.?!]*\bto\b|\bup from\b|\bdown from\b|\bversus\b|\bvs\.?\b|\bcompared\b|\bdifference\b|\bchange\b|\bgrew\b|\brose\b|\bfell\b/i;
const SPOKEN: [RegExp, number][] = [[/\ba quarter\b/gi, 25], [/\bhalf\b/gi, 50]];

function figuresIn(sentence: string): number[] {
  let text = normalizeNumberWords(sentence);
  for (const [re, v] of SPOKEN) text = text.replace(re, ` ${v} `);
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
}

export function checkTimeframes(spokenText: string, revealed: TimeframeItem[]): TimeframeMismatch[] {
  const index: { value: number; itemId: string; period: Period }[] = [];
  for (const item of revealed) {
    for (const [fig, period] of Object.entries(item.timeframes ?? {})) {
      index.push({ value: parseFloat(fig), itemId: item.id, period });
    }
  }
  if (index.length === 0) return [];

  const out: TimeframeMismatch[] = [];
  for (const sentence of spokenText.split(/(?<=[.!?])\s+/)) {
    if (!ARITHMETIC_FRAME.test(sentence) || CHANGE_FRAME.test(sentence)) continue;
    const figures = figuresIn(sentence)
      .map(v => index.find(e => Math.abs(e.value - v) < 1e-9))
      .filter((e): e is { value: number; itemId: string; period: Period } => e !== undefined);
    const periods = new Set(figures.map(f => f.period).filter(p => p === 'current' || p === 'prior'));
    if (periods.size > 1) out.push({ sentence: sentence.trim(), figures });
  }
  return out;
}
