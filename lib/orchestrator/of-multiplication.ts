// "of" as multiplication (Phase 1, switch `ofAsMultiplication`; follow-up 3 of
// the 27 Oct speech-normalization report, §5 item 3, on Lorenzo's ruling of 27
// Oct).
//
// `of` ends the expression in `arithmetic-check.ts` by design: "25% of COGS" is
// not an operation, and that rule is what stops the reader turning a share of a
// thing into arithmetic. But the most frequent unread shape in the 131 recorded
// voice turns is the one where it *is* an operation and both sides are figures —
// "ten percent of forty two is four point two points of revenue", "one fourth
// of forty two, which is around ten". Five true spoken claims in the
// recordings, every one correct, none of them reachable without this.
//
// So the narrow form, and only the narrow form: `of` is read as × between **a
// share and a figure**. A share is a percent ("ten percent", "25%") or a
// fraction word ("one fourth", "a quarter", "two thirds"); the right side must
// be a figure that follows immediately, with no article and no noun in between.
// That is the one position where `of` cannot be the preposition the old rule
// protects — "of COGS", "of revenue", "of the 42 points", "of three factors"
// are all left exactly as written.
//
// Unlike `speechNormalization` this is not a speech transform and it does fire
// on written text: "40% of 25% is 10 points" is the same sentence typed. Lorenzo
// dropped the typed-identity requirement for it on 27 Oct, on the condition
// that typed output may only **gain verified-correct claims or lose false
// flags** — 0 new flags, 0 new corrections, and every changed turn read. Its
// own switch, so that condition is evaluated on its own evidence and the
// `speechNormalization` identity gate keeps meaning what it says.

// A share: a percent figure, or one of the fraction words a candidate says.
// Written as the value it is, so the reader needs no new lexeme.
const FRACTIONS: Record<string, string> = {
  half: '0.5', 'one half': '0.5', 'a half': '0.5',
  third: '0.333', 'one third': '0.333', 'a third': '0.333', 'two thirds': '0.667',
  quarter: '0.25', 'one quarter': '0.25', 'a quarter': '0.25', 'three quarters': '0.75',
  fourth: '0.25', 'one fourth': '0.25', 'a fourth': '0.25', 'three fourths': '0.75',
};
const FRACTION_WORDS = Object.keys(FRACTIONS).filter(k => k.includes(' ')).sort((a, b) => b.length - a.length).join('|');
const PERCENT = String.raw`\d[\d,]*(?:\.\d+)?\s*(?:%|percent(?![a-z]))`;
// The right side: a figure, immediately — a scale or unit word may follow it,
// but nothing may come between it and the "of".
const UNIT = String.raw`%|percent|points?|pts|pp|dollars?|cents?|k|m|mm|mn|bn?|million|billion|thousand`;
const FIGURE = String.raw`\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:${UNIT})(?![a-z']))?`;

const SHARE_OF_FIGURE = new RegExp(
  String.raw`(?<![a-z'])(${PERCENT}|${FRACTION_WORDS})\s+of\s+(?=${FIGURE})`,
  'gi',
);

export function ofAsMultiplication(text: string): string {
  return text.replace(SHARE_OF_FIGURE, (_m, share: string) => {
    const frac = FRACTIONS[share.toLowerCase().replace(/\s+/g, ' ')];
    return `${frac ?? share} × `;
  });
}
