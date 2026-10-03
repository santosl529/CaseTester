import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { RubricScores, FeedbackItem } from './judge';
import { RUBRIC_DIMENSION_KEYS, CANDIDATE_REFERENCE_RULE, type RubricDimensionKey } from './rubric';
import { fallbackTopFix } from './verifier';
import type { DataCoverage, RequestedNotInCase, RequestedUnanswered } from './data-coverage';
import type { OnUsage } from '@/lib/llm-usage';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';

// Dimension reconciliation (docs/interviewer-behavior.md Rule 3 v4.1;
// docs/scoring-qa.md §4) — the LAST report pass, after the verifier, because
// removing or rewriting a claim can create or resolve a collision. Three jobs:
//
// 1. Same concept as both strength and weakness within one dimension → merge
//    into one calibrated statement on the side the rating reflects. Run 4's
//    Business Judgment credited implicit elasticity targeting and faulted not
//    naming elasticity risk; a user reading that concludes the scorer is
//    confused.
// 2. Same concept as a weakness in 3+ dimensions → LOG only (the Jul 17 run
//    charged one misdiagnosis in four). Some repetition is legitimate.
// 3. Coverage-gap leaks (Rule 11): a fault resting on data the candidate asked
//    for and never got → dropped. Backstop for the judge's prompt-level
//    data-coverage instruction.
//
// "Same concept" and "rests on" are semantic, so one batched model call
// PROPOSES; code validates ids/sections/dimensions and applies. Fails open.

export const GAP_COVERAGE_CAVEAT =
  "Part of this dimension's evidence rested on data the candidate asked for but the interviewer never provided — that gap is attributed to session coverage, not counted against the candidate.";

const RECONCILE_MODEL_ID = SCORING_MODEL_ID;

export type ReconcileSection = 'wentWell' | 'needsWork' | 'missedOpportunities' | 'topFix';

export type ReconcileItem = {
  id: number;
  dimension: RubricDimensionKey | 'topFix';
  section: ReconcileSection;
  index: number;
  text: string;
};

// Item ids, tolerating a model that quotes them ("3").
const ItemId = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]);

const ReconcileSchema = z.object({
  merges: z.array(z.object({ wentWellId: ItemId, needsWorkId: ItemId, merged: z.string() })).default([]),
  gapLeaks: z.array(z.object({ id: ItemId, reason: z.string() })).default([]),
  crossDimension: z.array(z.object({ concept: z.string(), dimensions: z.array(z.string()) })).default([]),
});

export type ReconcileResult = z.infer<typeof ReconcileSchema>;

export type MergeLog = {
  dimension: RubricDimensionKey;
  wentWell: string;
  needsWork: string;
  merged: string;
  placedIn: 'wentWell' | 'needsWork';
};

export type ReconcileOutcome = {
  rubric: RubricScores;
  merges: MergeLog[];
  gapDrops: (ReconcileItem & { reason: string })[];
  crossDimension: { concept: string; dimensions: RubricDimensionKey[] }[];
};

export function collectReconcileItems(rubric: RubricScores): ReconcileItem[] {
  const items: ReconcileItem[] = [];
  let id = 1;
  for (const key of RUBRIC_DIMENSION_KEYS) {
    rubric[key].wentWell.forEach((w, index) => items.push({ id: id++, dimension: key, section: 'wentWell', index, text: w.point }));
    rubric[key].needsWork.forEach((n, index) => items.push({ id: id++, dimension: key, section: 'needsWork', index, text: n.point }));
    rubric[key].missedOpportunities.forEach((m, index) => items.push({
      id: id++, dimension: key, section: 'missedOpportunities', index,
      text: `${m.moment} — a better response: "${m.betterResponse}"`,
    }));
  }
  items.push({ id: id++, dimension: 'topFix', section: 'topFix', index: 0, text: rubric.topFix });
  return items;
}

const unique = (xs: string[]) => [...new Set(xs)];

export function applyReconciliation(
  rubric: RubricScores,
  items: ReconcileItem[],
  result: ReconcileResult,
): ReconcileOutcome {
  const byId = new Map(items.map(i => [i.id, i]));
  const used = new Set<number>();
  const plans = Object.fromEntries(RUBRIC_DIMENSION_KEYS.map(k => [k, {
    dropWentWell: new Set<number>(),
    dropNeedsWork: new Set<number>(),
    dropMissed: new Set<number>(),
    replaceWentWell: new Map<number, FeedbackItem>(),
    replaceNeedsWork: new Map<number, FeedbackItem>(),
    gapHit: false,
  }])) as Record<RubricDimensionKey, {
    dropWentWell: Set<number>; dropNeedsWork: Set<number>; dropMissed: Set<number>;
    replaceWentWell: Map<number, FeedbackItem>; replaceNeedsWork: Map<number, FeedbackItem>; gapHit: boolean;
  }>;

  // Gap drops first: data integrity (Rule 11) outranks report coherence, so an
  // item that is a gap leak is removed, never merged.
  const gapDrops: ReconcileOutcome['gapDrops'] = [];
  let dropTopFix = false;
  for (const leak of result.gapLeaks) {
    const item = byId.get(leak.id);
    if (!item || used.has(item.id) || item.section === 'wentWell') continue;
    used.add(item.id);
    gapDrops.push({ ...item, reason: leak.reason });
    if (item.section === 'topFix') {
      dropTopFix = true;
      continue;
    }
    const plan = plans[item.dimension as RubricDimensionKey];
    (item.section === 'needsWork' ? plan.dropNeedsWork : plan.dropMissed).add(item.index);
    plan.gapHit = true;
  }

  const merges: MergeLog[] = [];
  for (const m of result.merges) {
    const ww = byId.get(m.wentWellId);
    const nw = byId.get(m.needsWorkId);
    const merged = m.merged.trim();
    if (!ww || !nw || !merged) continue;
    if (ww.section !== 'wentWell' || nw.section !== 'needsWork' || ww.dimension !== nw.dimension) continue;
    if (used.has(ww.id) || used.has(nw.id)) continue;
    used.add(ww.id);
    used.add(nw.id);

    const key = ww.dimension as RubricDimensionKey;
    const wwItem = rubric[key].wentWell[ww.index];
    const nwItem = rubric[key].needsWork[nw.index];
    const plan = plans[key];
    // Merged statements keep the union of both items' quotes — already
    // verified by the evidence audit, so no new unaudited evidence appears.
    if (rubric[key].rating === 'strong') {
      plan.replaceWentWell.set(ww.index, { point: merged, quotes: unique([...wwItem.quotes, ...nwItem.quotes]) });
      plan.dropNeedsWork.add(nw.index);
      merges.push({ dimension: key, wentWell: ww.text, needsWork: nw.text, merged, placedIn: 'wentWell' });
    } else {
      plan.replaceNeedsWork.set(nw.index, { point: merged, quotes: unique([...nwItem.quotes, ...wwItem.quotes]) });
      plan.dropWentWell.add(ww.index);
      merges.push({ dimension: key, wentWell: ww.text, needsWork: nw.text, merged, placedIn: 'needsWork' });
    }
  }

  const cleaned = structuredClone(rubric);
  for (const key of RUBRIC_DIMENSION_KEYS) {
    const plan = plans[key];
    cleaned[key].wentWell = rubric[key].wentWell.flatMap((w, i) =>
      plan.dropWentWell.has(i) ? [] : [plan.replaceWentWell.get(i) ?? w]);
    cleaned[key].needsWork = rubric[key].needsWork.flatMap((n, i) =>
      plan.dropNeedsWork.has(i) ? [] : [plan.replaceNeedsWork.get(i) ?? n]);
    cleaned[key].missedOpportunities = rubric[key].missedOpportunities.filter((_, i) => !plan.dropMissed.has(i));
    if (plan.gapHit && !cleaned[key].coverageCaveat) cleaned[key].coverageCaveat = GAP_COVERAGE_CAVEAT;
  }
  if (dropTopFix) {
    const fallback = fallbackTopFix(cleaned);
    if (fallback) cleaned.topFix = fallback;
  }

  const validKeys = new Set<string>(RUBRIC_DIMENSION_KEYS);
  const crossDimension = result.crossDimension.flatMap(c => {
    const dimensions = unique(c.dimensions.filter(d => validKeys.has(d))) as RubricDimensionKey[];
    return c.concept.trim() && dimensions.length >= 3 ? [{ concept: c.concept.trim(), dimensions }] : [];
  });

  return { rubric: cleaned, merges, gapDrops, crossDimension };
}

// On this multi-task prompt the model reasons in prose first and puts the JSON
// in a fenced block at the end (found by replaying live runs 58cb8061 and
// db41a01e with raw logging) — so a whole-string parse failed every time and
// reconciliation silently never ran. Take the last fenced block, else the
// outermost {...} span.
function extractJson(raw: string): string | null {
  const fences = [...raw.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  if (fences.length > 0) return fences[fences.length - 1][1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start !== -1 && end > start ? raw.slice(start, end + 1) : null;
}

export function parseReconcileResponse(raw: string): ReconcileResult | null {
  const jsonText = extractJson(raw);
  if (!jsonText) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const parsed = ReconcileSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

// `notInCase` exists to stop over-dropping: run 4's report faulted a "waste
// narrative" whose disambiguating data (an itemized COGS breakdown) the case
// doesn't have and the interviewer properly refused — a fair critique that sat
// in the same quote as the genuinely withheld price question. Listing refused
// requests explicitly as NOT gaps, plus the "would it still stand with the
// data?" test, keeps the gap check from swallowing fair critiques.
export function buildReconcilePrompt(
  items: ReconcileItem[],
  gaps: RequestedUnanswered[],
  notInCase: RequestedNotInCase[] = [],
): string {
  const itemsText = items.map(i => `${i.id}. [${i.dimension}/${i.section}] ${i.text}`).join('\n');
  const notGaps = notInCase.length > 0
    ? `
NOT GAPS — the candidate also asked for the following, but this data does not exist in the case, so its absence is fair; critiques resting on it must NOT be listed:
${notInCase.map(n => `- "${n.what}"`).join('\n')}`
    : '';
  const gapTask = gaps.length > 0
    ? `

TASK 3 — COVERAGE-GAP LEAKS. The candidate asked for the data below, it exists in the case, and the interviewer never provided it (REQUESTED BUT NEVER PROVIDED):
${gaps.map(g => `- ${g.label} — the candidate asked about "${g.what}"`).join('\n')}${notGaps}
List every needsWork, missedOpportunities, or topFix item that faults the candidate for an assumption or conclusion that rests on the REQUESTED BUT NEVER PROVIDED data, or for not reaching an insight that required it. The test for each item: would the critique still stand if the candidate HAD received that data? If it would still stand, it is not a leak — do not list it, even when the quoted text also mentions the missing data. Never list wentWell items.`
    : '';

  return `You are reconciling a case-interview feedback report so it doesn't contradict itself. Items are numbered; each is tagged [dimension/section].

TASK 1 — SAME CONCEPT ON BOTH SIDES. Within a single dimension, find a wentWell item and a needsWork item that are about the same concept (e.g. "recognized elasticity implicitly by targeting premium items" vs. "did not name elasticity / volume loss as the risk"). For each pair, write ONE calibrated sentence that keeps what is true in both ("recognized elasticity implicitly in targeting premium SKUs, but never named volume loss as the risk"). Only pair items that are genuinely the same concept — different aspects of a dimension are not a collision. Use each item at most once. The merged sentence is shown to the candidate: ${CANDIDATE_REFERENCE_RULE}

TASK 2 — CROSS-DIMENSION REPETITION. Find any single concept that appears as a weakness (needsWork or missedOpportunities) in 3 or more different dimensions. Report the concept and the dimension keys. This is for logging; do not change anything for it.${gapTask}

REPORT ITEMS:
${itemsText}

Respond with ONLY valid JSON:
{"merges":[{"wentWellId":N,"needsWorkId":N,"merged":"..."}],"gapLeaks":[{"id":N,"reason":"..."}],"crossDimension":[{"concept":"...","dimensions":["key",...]}]}
Use empty arrays when there is nothing to report.`;
}

export async function runReconciliation(
  rubric: RubricScores,
  dataCoverage: DataCoverage, // lib/scoring/data-coverage.ts — gaps to check, refused requests as counter-examples
  onUsage?: OnUsage, // lib/llm-usage.ts — token reporting for $/case (PRD §13)
): Promise<ReconcileOutcome> {
  const unchanged: ReconcileOutcome = { rubric, merges: [], gapDrops: [], crossDimension: [] };
  const gaps = dataCoverage.requestedUnanswered;

  // Skip the call when no job could possibly find anything.
  const anyBothSides = RUBRIC_DIMENSION_KEYS.some(k => rubric[k].wentWell.length > 0 && rubric[k].needsWork.length > 0);
  const weaknessDims = RUBRIC_DIMENSION_KEYS
    .filter(k => rubric[k].needsWork.length > 0 || rubric[k].missedOpportunities.length > 0).length;
  if (!anyBothSides && weaknessDims < 3 && gaps.length === 0) return unchanged;

  const items = collectReconcileItems(rubric);
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Opus 5.5: thinking always on (adaptive); effort set explicitly.
    const response = await client.beta.messages.create({
      model: RECONCILE_MODEL_ID,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      messages: [{ role: 'user', content: buildReconcilePrompt(items, gaps, dataCoverage.requestedNotInCase) }],
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    });
    onUsage?.({
      component: 'reconcile',
      model: RECONCILE_MODEL_ID,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
    const result = text ? parseReconcileResponse(text.text) : null;
    if (!result) {
      // Log what actually came back: two live runs (58cb8061, db41a01e) failed
      // here with no raw output, which left the cause undiagnosable.
      console.error('[reconcile] invalid response, skipping reconciliation. stop_reason:', response.stop_reason,
        'raw:', (text?.text ?? JSON.stringify(response.content)).slice(0, 2000));
      return unchanged;
    }
    return applyReconciliation(rubric, items, result);
  } catch (err) {
    // A coherence pass must never block the report.
    console.error('[reconcile] failed, skipping reconciliation:', err instanceof Error ? err.message : err);
    return unchanged;
  }
}
