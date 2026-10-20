// Each figure a candidate states, tied to the quantity phrase it modifies
// (Lorenzo, 20 Oct, E6: "Tie each figure to its quantity at the figure level";
// round-4 L7's residual). The stale reader used to read a figure as stated for
// a claim's quantity when any word of its sentence named that quantity: "$900
// of CAC saved on 600 customers" closed a $600 Starter LTV flag (batch 35
// Quillpath Marisol t31, a sentence that also says "Starter"), and "the
// upgrade stream 0.20 × $4,000" restated a 4× ratio (Tyler t29). Here a figure
// is bound to the noun phrase right after it ("600 customers", "$4.5 million
// of first-year profit", "$900 LTV"), else to the one right before it, read
// back over its arithmetic and linking words ("fixed costs $3.0 + $4.5 + $1.5
// = $9.0 million", "the margin gain is really 8.5", "LTV $50 / 0.074 ≈ $676").
// An input of arithmetic ("0.20 × $4,000", "× $10 =") is an operand, not a
// quantity stated. A figure whose phrase is "it"/"that"/"this" refers back
// ("The $225 million was built on … With the corrected funnel it should be
// 40,000 × $6,000 = $240 million"): `lead` holds what it can refer to.
import { normalizeNumberWords } from '@/lib/number-words';

export type BoundFigure = {
  value: number;
  phrase: string;      // the quantity phrase it modifies ('' when none); an operand's: the noun after it, else its own label ("Pro at $4,000 /")
  operand: boolean;    // an input of arithmetic, not a quantity stated
  pronoun: boolean;    // bound to "it"/"that"/"this"
  lead: string;        // for a pronoun: the sentence before and its own sentence up to the pronoun
  sentence: string;    // its sentence
};

const sentencesOf = (text: string) => normalizeNumberWords(text).split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);

// The unit and scale said right after a figure: never the quantity.
const UNIT = /^(?:\s*(?:%|percent(?:age)?(?:\s+points?)?\b|-?points?\b|pp\b|pts\b|ppts?\b|k\b|m\b|mm\b|mn\b|bn\b|million\b|billion\b|thousand\b|(?:x|times)\b(?!\s*[-−]?\$?\d)))*/i;
// A rate after the unit ("135 a month", "$2,000 per flight").
const RATE = /^\s+(?:a|an|per|each)\s+(?!of\b)[a-z][a-z-]*\b/i;
// Arithmetic right after the figure, or right before it ("=" and "≈" give a result, not an input).
const OP_AFTER = /^\s*(?:[×*/÷+−^]|-\s|x\s*[-−]?\$?\d|times\s+[-−]?\$?\d|plus\b|minus\b|less\b|divided\s+by\b)/i;
const OP_BEFORE = /(?:[×*/÷+−^]|\s-\s*|\bx|\btimes|\bplus|\bminus|\bless|\bdivided\s+by)\s*\(?\s*$/i;
const FIGURE = /(\$\s?)?(\d+(?:,\d{3})*(?:\.\d+)?)/g;

// Words that end a phrase, or — read before any — mean there is none.
const STOP = new Set(`the a an and or but so if when while because since as which who whom whose where what than with for from on in into onto against
versus vs plus minus less times each every both either not no nor yet i we you they he she our my your their his its there here how why once after before until unless though
although whereas then too also overall apiece instead rather while`.split(/\s+/));
// Linking words between a phrase and its figure ("is about", "came to", "grew"): passed over before the phrase, ending it after.
const LINK = new Set(`is are was were be been being am would will should could can might may must does did do comes come came coming to at about
roughly around approximately approx nearly almost only just really closer close exactly precisely call called gives give giving gave equals equal
equaling makes make made making of up down by now still already grew grow grows rose rise rises risen fell fall falls fallen add adds added adding goes
go went gone going gets get got getting takes take took taken taking holds hold held sits sit sat lands land landed works work worked out totals totaled
totalled nets netted leaves leave left brings bring brought puts put reaches reach reached hits hit clears clear cleared stays stay stayed drops drop dropped
climbs climb climbed jumps jumped within under over above below more less me us them him her nearer near some maybe perhaps probably likely say said
says think thought means mean meant shows show showed gave rising falling growing increasing declining dropping climbing`.split(/\s+/));
// Words inside a phrase ("contribution per flight", "share of revenue", "margin from COGS").
const JOIN = new Set(['of', 'per', 'from']);
const PRONOUN = new Set(['it', "it's", 'that', "that's", 'this']);
// Scale and unit words in an arithmetic chain read backwards ("8.6 million × $1.50 = $12.9 million").
const UNIT_WORDS = new Set(['million', 'billion', 'thousand', 'm', 'mm', 'mn', 'bn', 'k', 'points', 'point', 'percent', 'percentage', 'pp', 'pts', 'x', 'times', 'plus', 'minus', 'less']);
const WORD = /^[a-z][a-z'’]*(?:-[a-z0-9]+)*$/i;
const lower = (t: string) => t.toLowerCase().replace(/’/g, "'");

// The phrase after the figure: "of"/"in" and its noun, or a noun right after.
function phraseAfter(rest: string): string {
  let s = rest;
  const of = /^\s+(?:of|in)\s+/i.exec(s);
  if (of) s = s.slice(of[0].length).replace(/^(?:(?:the|a|an|our|its|their|this|that|these|those|his|her|my|your)\s+|\$?\d[\d,.]*(?:%|-[a-z]+)?\s+)*/i, '');
  else if (!/^\s+[a-z]/i.test(s)) return '';
  const words: string[] = [];
  for (const t of s.trim().split(/\s+/)) {
    const w = t.replace(/[,;:.!?)"”]+$/, '');
    const l = lower(w);
    if (!WORD.test(w)) break;
    if (words.length > 0 && JOIN.has(l)) { words.push(w); if (w !== t) break; continue; }
    if (STOP.has(l) || LINK.has(l) || (words.length === 0 && (/ed$/.test(l) || JOIN.has(l)))) break;
    words.push(w);
    if (w !== t || words.length >= 5) break;   // punctuation ends it
  }
  while (words.length > 0 && JOIN.has(lower(words[words.length - 1]))) words.pop();
  return words.join(' ');
}

// An operand's own label ("Pro at $4,000 / $1,200 = 3.3x", b35q Marisol 21:3): at most
// three words, joined to it by "at" or a colon. A chain's name right before its first
// operand ("fixed costs $3.0 + …", "LTV $50 / 0.074") names the result, not the operand.
function labelOf(before: string): string {
  const toks = [...before.matchAll(/\$?\d+(?:,\d{3})*(?:\.\d+)?%?|[a-z][a-z'’]*(?:-[a-z0-9]+)*|\S/gi)].map(m => m[0]);
  let i = toks.length - 1;
  if (i < 0 || !(lower(toks[i]) === 'at' || toks[i] === ':')) return '';
  i--;
  const words: string[] = [];
  for (; i >= 0 && words.length < 3; i--) {
    const l = lower(toks[i]);
    if (!WORD.test(toks[i]) || STOP.has(l) || LINK.has(l) || UNIT_WORDS.has(l)) break;
    words.unshift(toks[i]);
  }
  return words.join(' ');
}

// The phrase before the figure, read back over arithmetic, units and linking words.
function phraseBefore(before: string): { phrase: string; pronoun: boolean; lead: string } {
  const toks = [...before.matchAll(/\$?\d+(?:,\d{3})*(?:\.\d+)?%?|[a-z][a-z'’]*(?:-[a-z0-9]+)*|[×*/÷+=≈~−^()]|[,;:—–!?"“”]|-/gi)];
  const words: string[] = [];
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i][0];
    const l = lower(t);
    const isFig = (k: number) => k >= 0 && /^\$?\d/.test(toks[k]?.[0] ?? '');
    const isOp = (k: number) => /^[×*/÷+=≈~−^-]$/.test(toks[k]?.[0] ?? '') || /^(?:plus|minus|times|less)$/i.test(toks[k]?.[0] ?? '');
    // A figure, over its scale word ("$400M net sales": "$400", "M").
    const figAt = (k: number) => { let j = k; while (j >= 0 && UNIT_WORDS.has(lower(toks[j][0]))) j--; return isFig(j); };
    // An operand's own noun in the chain, of up to three words — after it ("8,000 flights ×
    // 60 passengers × $10", "$400M net sales × 30%") or before it ("COGS 16 points plus
    // overhead 2 points equals 18") — is part of the chain.
    if (words.length === 0 && WORD.test(t) && !UNIT_WORDS.has(l)) {
      let k = i;
      while (k - 1 >= 0 && i - (k - 1) < 3 && WORD.test(toks[k - 1][0]) && !UNIT_WORDS.has(lower(toks[k - 1][0])) && !STOP.has(lower(toks[k - 1][0])) && !LINK.has(lower(toks[k - 1][0]))) k--;
      const run = (from: number) => (figAt(from - 1) && isOp(i + 1)) || (isOp(from - 1) && isFig(i + 1));
      const at = [i, ...Array.from({ length: i - k }, (_, d) => i - d - 1)].find(run);
      if (at !== undefined) { i = at; continue; }
    }
    const chain = isFig(i) || /^[×*/÷+=≈~−^()-]$/.test(t) || UNIT_WORDS.has(l);
    if (chain || t === ':') { if (words.length > 0) break; continue; }   // a label's colon: "Total increase: 4.2 plus 11.8 is 16.0"
    if (!WORD.test(t)) break;
    if (words.length === 0 && PRONOUN.has(l)) return { phrase: '', pronoun: true, lead: before.slice(0, toks[i].index) };
    if (words.length > 0 && JOIN.has(l)) { words.unshift(t); continue; }
    if (STOP.has(l)) break;
    if (LINK.has(l)) { if (words.length > 0) break; continue; }
    words.unshift(t);
    if (words.length >= 5) break;
  }
  while (words.length > 0 && JOIN.has(lower(words[0]))) words.shift();
  return { phrase: words.join(' '), pronoun: false, lead: '' };
}

export function boundFigures(text: string): BoundFigure[] {
  const sentences = sentencesOf(text);
  return sentences.flatMap((sentence, i) => [...sentence.matchAll(FIGURE)].flatMap((m): BoundFigure[] => {
    const start = m.index ?? 0;
    // A figure glued to letters is a name ("FY2023"), not a figure.
    if (start > 0 && /[a-z]/i.test(sentence[start - 1])) return [];
    const value = parseFloat(m[2].replace(/,/g, ''));
    const before = sentence.slice(0, start);
    let rest = sentence.slice(start + m[0].length);
    rest = rest.slice(UNIT.exec(rest)?.[0].length ?? 0);
    rest = rest.slice(RATE.exec(rest)?.[0].length ?? 0);
    const operand = OP_AFTER.test(rest) || OP_BEFORE.test(before);
    const after = phraseAfter(rest);
    if (after || operand) return [{ value, phrase: after || (operand ? labelOf(before) : ''), operand, pronoun: false, lead: '', sentence } satisfies BoundFigure];
    const b = phraseBefore(before);
    return [{ value, phrase: b.phrase, operand, pronoun: b.pronoun, lead: b.pronoun ? `${sentences[i - 1] ?? ''} ${b.lead}` : '', sentence } satisfies BoundFigure];
  }));
}
