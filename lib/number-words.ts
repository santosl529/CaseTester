// Spoken numbers → digits (docs/interviewer-behavior.md Rules 2 and 13, v4.6).
// The stall ladder's progress signal and the math source spans only saw digit
// numerals. Yuki (batch 2, 41ece01e) wrote every figure in words — "ten and a
// half points", "twelve points" — so her analytical turns read as clarifying
// questions and fired a phantom rung. In M2 speech-to-text output is mostly
// number words, so this would hit every candidate. Text-preserving: only the
// number-word runs change, everything else is returned as written.

export const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
export const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
export const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
};

const WORD = [...Object.keys(ONES), ...Object.keys(TENS), ...Object.keys(SCALES)]
  .sort((a, b) => b.length - a.length)
  .join('|');
const DIGIT_WORD = Object.keys(ONES).filter(w => ONES[w] <= 9).join('|');
// A run starts on a ones/tens word: a bare "million" after digits ("$0.5
// million") is a unit, not a number.
const LEAD_WORD = [...Object.keys(ONES), ...Object.keys(TENS)].sort((a, b) => b.length - a.length).join('|');

// A run of number words (space- or hyphen-joined), an optional spoken decimal
// ("point seven"), and an optional "and (a) half".
const RUN = new RegExp(
  `\\b((?:${LEAD_WORD})(?:[\\s-]+(?:${WORD}))*)(\\s+point((?:\\s+(?:${DIGIT_WORD}))+)(?:\\s+(thousand|million|billion))?)?(\\s+and\\s+(?:a\\s+)?half)?\\b`,
  'gi',
);

// A trailing word that makes a lone "one" a quantity, not a pronoun.
const UNIT_AFTER = /^\s*(?:percent|%|points?|pp|pts|million|billion|thousand|dollars?)\b/i;

type Parsed = { value: number; scaleWord: string | null };

// Split a token run into the numbers it spells. "twenty five" is one number;
// "one two three" and "twenty twelve" are several.
function parseRun(tokens: string[]): Parsed[] {
  const out: Parsed[] = [];
  let total = 0;
  let current = 0;
  let last: 'none' | 'ones' | 'teen' | 'tens' | 'hundred' | 'scale' = 'none';
  let scaleWord: string | null = null;
  const flush = () => {
    if (last !== 'none') out.push({ value: total + current, scaleWord });
    total = 0; current = 0; last = 'none'; scaleWord = null;
  };
  for (const t of tokens) {
    if (ONES[t] !== undefined) {
      const v = ONES[t];
      const legal = last === 'none' || last === 'hundred' || last === 'scale' || (last === 'tens' && v <= 9);
      if (!legal) flush();
      current += v;
      last = v >= 10 ? 'teen' : 'ones';
      scaleWord = null;
    } else if (TENS[t] !== undefined) {
      const legal = last === 'none' || last === 'hundred' || last === 'scale';
      if (!legal) flush();
      current += TENS[t];
      last = 'tens';
      scaleWord = null;
    } else if (t === 'hundred') {
      if (last === 'hundred') flush();
      current = (current || 1) * 100;
      last = 'hundred';
      scaleWord = null;
    } else {
      total += (current || 1) * SCALES[t];
      current = 0;
      last = 'scale';
      scaleWord = t;
    }
  }
  flush();
  return out;
}

function format(p: Parsed): string {
  if (p.scaleWord && p.scaleWord !== 'hundred') {
    return `${p.value / SCALES[p.scaleWord]} ${p.scaleWord}`;
  }
  return String(p.value);
}

export function normalizeNumberWords(text: string): string {
  return text.replace(RUN, (match: string, run: string, pointPart: string | undefined, decimals: string | undefined, decimalScale: string | undefined, half: string | undefined, offset: number) => {
    const tokens = run.toLowerCase().split(/[\s-]+/).filter(Boolean);
    const parsed = parseRun(tokens);
    if (parsed.length === 0) return match;
    const after = text.slice(offset + match.length);
    // A lone "one" with nothing quantitative around it is a pronoun or an
    // enumerator ("One thing I notice", "One — the other inputs").
    if (tokens.length === 1 && tokens[0] === 'one' && !pointPart && !half && !UNIT_AFTER.test(after)) return match;

    const lastIdx = parsed.length - 1;
    const parts = parsed.map(format);
    const lastParsed = parsed[lastIdx];
    if (decimals && !lastParsed.scaleWord) {
      const digits = decimals.trim().toLowerCase().split(/\s+/).map(w => String(ONES[w])).join('');
      parts[lastIdx] = `${lastParsed.value}.${digits}${decimalScale ? ` ${decimalScale.toLowerCase()}` : ''}`;
    } else if (decimals) {
      parts[lastIdx] = `${format(lastParsed)}${pointPart}`;
    }
    if (half && !lastParsed.scaleWord && !decimals) {
      parts[lastIdx] = String(lastParsed.value + 0.5);
    } else if (half) {
      parts[lastIdx] = `${parts[lastIdx]}${half}`;
    }
    return parts.join(' ');
  });
}
