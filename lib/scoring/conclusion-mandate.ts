// Post-wave item 4, narrowed (Lorenzo, 27 Oct): "name every open claim marked `changesConclusion`, at most 3 per
// report." The judge is told to name them (checker-record.ts, the MATH CHECKER section's mandate), and this pass
// makes it true whatever the judge wrote — the prompt alone cannot, because three later passes would undo it (§12 of
// the post-wave report):
//
//   1. the evidence-quote audit strips a needsWork item whose quotes don't appear in a candidate turn, and drops the
//      item when every quote it cited was fabricated. Resolution: this pass runs AFTER the audit, and the only quote
//      it ever writes is the claim's own span, checked here against the candidate turns with the audit's own
//      predicate — so the quote is one the audit would have kept, and when the span cannot be found the item is
//      written with no quote at all (an unquoted weakness is what the audit already allows, and the claim verifier
//      has run by then too). Nothing is loosened for anybody else.
//   2. the cross-dimension reconciliation merges same-concept items and can rewrite or drop one. Resolution: this
//      pass runs AFTER reconciliation, and it adds nothing when the report already names the claim — so a judge item
//      that survived reconciliation (even merged into another dimension) is left exactly as it is.
//   3. the stage caps mark a dimension `notAssessed` when it holds no quoted evidence, which would leave a mandated
//      item in a dimension the report prints as unrated. Resolution: this pass runs BEFORE the caps, so its quoted
//      item is the "real, quoted evidence from elsewhere" Rule 9 asks for and the dimension is caveated instead of
//      unassessed. A dimension the JUDGE itself marked notAssessed is not overridden: the item goes to the first
//      candidate dimension that was assessed, and only if there is none does it land on the target with the flag
//      cleared (the evidence exists, so "not assessed" would be the false statement).
import type { MandatedClaim } from './checker-record';
import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from './rubric';
import { quoteAppearsIn } from './evidence-audit';
import { numbersOf } from '@/lib/orchestrator/math-checker';

export type MandateAddition = { dimension: RubricDimensionKey; claim: string };

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$]+/g, ' ').replace(/\s+/g, ' ').trim();

// Does this weakness already name the claim? Either it holds the right figure (or the candidate's own wrong one), or
// it quotes the claim's words. A STRENGTH naming the figure is not the report naming the error, so only needsWork
// counts.
function namesClaim(item: { point: string; quotes: string[] }, m: MandatedClaim): boolean {
  // The figure has to be in the judge's OWN words. A quote is the candidate's words, and those always carry the wrong
  // figure (and often, as number words, the right one: "the four healthy routes" holds a 4) — so reading figures out
  // of quotes would count almost any item as naming almost any claim.
  const figures = [...numbersOf(m.candidateValue), ...(m.figure === null ? [] : numbersOf(m.figure))];
  if (figures.length > 0 && numbersOf(item.point).some(n => figures.some(f => near(n, f)))) return true;
  const span = norm(m.span);
  return span.length >= 25 && item.quotes.some(q => {
    const quote = norm(q);
    return quote.includes(span.slice(0, 40)) || span.includes(quote.slice(0, 40));
  });
}

// Where the item goes: the recommendation's own figure is the bottom line (synthesis); any other figure is the work
// behind it (quantitative). Judgment is the last resort, because a wrong figure that changes the conclusion is always
// also a judgment the report can speak to.
const dimensionsFor = (m: MandatedClaim): RubricDimensionKey[] =>
  (m.byCode ? ['synthesis', 'quantitative', 'judgment'] : ['quantitative', 'synthesis', 'judgment']);

function pointFor(m: MandatedClaim): string {
  const right = m.figure === null ? '' : `, and it is about ${m.figure}`;
  return m.byCode
    ? `The figure your recommendation rests on is wrong: you put it at ${m.candidateValue}${right}. Nothing in the interview raised it, so the bottom line you gave rests on it.`
    : `A wrong figure that changes the conclusion was never corrected in the interview: you put it at ${m.candidateValue}${right}.`;
}

export function applyConclusionMandate(
  rubric: RubricScores,
  claims: MandatedClaim[],
  candidateTurns: string[],
): { rubric: RubricScores; added: MandateAddition[] } {
  if (claims.length === 0) return { rubric, added: [] };
  const corpus = candidateTurns.join('\n');
  const out = structuredClone(rubric);
  const added: MandateAddition[] = [];
  for (const m of claims) {
    if (RUBRIC_DIMENSION_KEYS.some(k => out[k].needsWork.some(item => namesClaim(item, m)))) continue;
    const options = dimensionsFor(m);
    const key = options.find(k => !out[k].notAssessed) ?? options[0];
    if (out[key].notAssessed) delete out[key].notAssessed;
    out[key].needsWork.push({ point: pointFor(m), quotes: quoteAppearsIn(m.span, corpus) ? [m.span] : [] });
    added.push({ dimension: key, claim: m.id });
  }
  return { rubric: out, added };
}
