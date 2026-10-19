import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { z } from 'zod';
import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS } from './rubric';
import type { OnUsage } from '@/lib/llm-usage';
import type { MathStepResult } from './deterministic';
import { anthropicClient } from '@/lib/anthropic-client';
import type { Case } from '@/lib/cases/schema';
import { auditBetterFigures, type BetterFigure } from './better-audit';

// Second-pass claim verification (docs/interviewer-behavior.md §3): the
// deterministic evidence audit catches fabricated quotes, but not false
// claims ABOUT the transcript — above all omission claims ("the candidate
// never proposed hedging") that contain no quote to check. This pass gives a
// verifier one focused question per claim; claims the transcript contradicts
// are dropped. Scoped to the sections that hurt when wrong (needsWork,
// missedOpportunities, topFix) — false praise is handled by judge discipline.
// Lorenzo, 19 Oct (§15 m; R3: "facts only"): the "Better" answers and the
// strengths' facts are checked too (batch 32 Larkspur Tyler, Marcus).

export type Claim = {
  id: number;
  dimension: string; // rubric key, or 'topFix'
  section: 'needsWork' | 'missedOpportunities' | 'betterResponse' | 'wentWell' | 'topFix';
  index: number;
  text: string;
};

export type Verdict = { id: number; supported: boolean; reason: string };

const VerdictsSchema = z.object({
  verdicts: z.array(z.object({
    id: z.number(),
    supported: z.boolean(),
    reason: z.string(),
  })),
});

// Structured output, as for the judge (judge.ts JUDGE_OUTPUT_FORMAT): the API
// constrains the reply to this schema instead of a prompt-only JSON request.
export const VERIFIER_OUTPUT_FORMAT = betaZodOutputFormat(VerdictsSchema);

export function collectClaims(rubric: RubricScores): Claim[] {
  const claims: Claim[] = [];
  let id = 1;
  for (const key of RUBRIC_DIMENSION_KEYS) {
    rubric[key].wentWell.forEach((item, index) => {
      claims.push({ id: id++, dimension: key, section: 'wentWell', index, text: item.point });
    });
    rubric[key].needsWork.forEach((item, index) => {
      claims.push({ id: id++, dimension: key, section: 'needsWork', index, text: item.point });
    });
    rubric[key].missedOpportunities.forEach((item, index) => {
      claims.push({ id: id++, dimension: key, section: 'missedOpportunities', index, text: item.moment });
      if (item.betterResponse) claims.push({ id: id++, dimension: key, section: 'betterResponse', index, text: item.betterResponse });
    });
  }
  claims.push({ id: id++, dimension: 'topFix', section: 'topFix', index: 0, text: rubric.topFix });
  return claims;
}

// Drop unsupported claims. If topFix itself is unsupported, fall back to the
// first surviving needsWork point of the lowest-rated dimension; if nothing
// survives, keep the original (logged by the caller) rather than fabricate.
export function applyVerdicts(
  rubric: RubricScores,
  claims: Claim[],
  verdicts: Verdict[],
): { rubric: RubricScores; dropped: (Claim & { reason: string })[] } {
  const verdictById = new Map(verdicts.map(v => [v.id, v]));
  const dropped: (Claim & { reason: string })[] = [];
  const cleaned = structuredClone(rubric);

  const unsupported = (claim: Claim): boolean => {
    const verdict = verdictById.get(claim.id);
    if (verdict && !verdict.supported) {
      dropped.push({ ...claim, reason: verdict.reason });
      return true;
    }
    return false;
  };

  for (const key of RUBRIC_DIMENSION_KEYS) {
    const toDropWentWell = new Set(
      claims.filter(c => c.dimension === key && c.section === 'wentWell' && unsupported(c)).map(c => c.index),
    );
    cleaned[key].wentWell = cleaned[key].wentWell.filter((_, i) => !toDropWentWell.has(i));

    const toDropNeedsWork = new Set(
      claims.filter(c => c.dimension === key && c.section === 'needsWork' && unsupported(c)).map(c => c.index),
    );
    cleaned[key].needsWork = cleaned[key].needsWork.filter((_, i) => !toDropNeedsWork.has(i));

    const toDropMissed = new Set(
      claims.filter(c => c.dimension === key && c.section === 'missedOpportunities' && unsupported(c)).map(c => c.index),
    );
    cleaned[key].missedOpportunities = cleaned[key].missedOpportunities.filter((_, i) => !toDropMissed.has(i));

    // An unsupported Better answer is blanked and its moment stays (the
    // renderers print no "Better:" for ''); an unsupported strength goes.
    for (const c of claims.filter(c => c.dimension === key && c.section === 'betterResponse' && unsupported(c))) {
      const item = rubric[key].missedOpportunities[c.index];
      const kept = cleaned[key].missedOpportunities.find(m => m.moment === item.moment && m.betterResponse === item.betterResponse);
      if (kept) kept.betterResponse = '';
    }
  }

  const topFixClaim = claims.find(c => c.section === 'topFix');
  if (topFixClaim && unsupported(topFixClaim)) {
    const fallback = fallbackTopFix(cleaned);
    if (fallback) cleaned.topFix = fallback;
  }

  return { rubric: cleaned, dropped };
}

// Replacement when topFix itself is removed (here, or by the reconciliation
// pass): the first surviving needsWork point of the lowest-rated dimension.
// Undefined if nothing survives — callers keep the original rather than
// fabricate one.
export function fallbackTopFix(rubric: RubricScores): string | undefined {
  const ratingOrder = { needs_work: 0, meets_bar: 1, strong: 2 } as const;
  return RUBRIC_DIMENSION_KEYS
    .map(key => rubric[key])
    .sort((a, b) => ratingOrder[a.rating] - ratingOrder[b.rating])
    .flatMap(d => d.needsWork)[0]?.point;
}

type TranscriptTurn = { role: string; text: string; turnIndex: number };

// Error-claim verifier (docs/interviewer-behavior.md Rule 3, v4.3) runs in the
// same call: the checks above never test a claim that the candidate MADE AN
// ERROR — the quotes exist and it isn't an omission — which let Sam's correct
// 200 × $2.4M = $480M become her Top Improvement. The verifier gets the
// span-checked math results as facts and the interviewer-error marks.
export function buildVerifierFacts(mathResults: MathStepResult[] = [], marksSection = ''): string {
  const correct = mathResults.filter(r => r.errorClass === 'non_issue' && r.span);
  const mathLines = correct.map(r => `- "${r.span}" — the candidate's ${r.candidateValue} is CORRECT (checked in code against ${r.description.split(' = ')[0]}).`);
  return [
    mathLines.length ? `FIGURES VERIFIED CORRECT IN CODE:\n${mathLines.join('\n')}` : '',
    marksSection,
  ].filter(Boolean).join('\n\n');
}

export function buildVerifierPrompt(
  claims: Claim[],
  transcriptText: string,
  mathResults: MathStepResult[] = [],
  marksSection = '',
  betterFigures: BetterFigure[] = [],
): string {
  const claimsText = claims.map(c => `${c.id}. [${c.dimension}/${c.section}] ${c.text}`).join('\n');
  // The audit's figures (better-audit.ts), per claim: the verifier recomputes them.
  const unfound = claims
    .filter(c => c.section === 'betterResponse')
    .flatMap(c => {
      const figs = betterFigures.filter(f => f.dimension === c.dimension && f.index === c.index).map(f => f.figure);
      return figs.length ? [`- claim ${c.id}: ${figs.join(', ')}`] : [];
    });
  const hints = unfound.length ? `FIGURES NOT FOUND IN THE CASE DATA (the case's figures, the math answers, and one operation of two of them; check these first):\n${unfound.join('\n')}` : '';
  return `You are verifying claims an evaluator made about a case-interview candidate, against the actual transcript. For each numbered claim, decide whether the transcript supports it.

Mark a claim UNSUPPORTED only when the transcript factually contradicts it — above all:
- omission claims ("the candidate never mentioned / failed to propose X") when the candidate actually said X anywhere in the transcript;
- mischaracterizations of what the candidate said or asked;
- descriptions of moments that did not happen;
- ERROR claims ("miscalculated X", "arithmetic error", "wrong figure for Y", "tighten your math on Z") when the candidate's figure was actually right: recompute it from the numbers in the transcript, and treat anything listed under FIGURES VERIFIED CORRECT IN CODE as correct;
- claims that rest on a candidate turn listed under INTERVIEWER ERRORS AND EXCLUSIONS, or that cite an interviewer error as the candidate's mistake.
Lean SUPPORTED on matters of judgment or severity — you are checking facts, not re-grading the interview.

Two kinds of claim are checked on facts alone:
- [betterResponse] claims are the words a great candidate would have said. Mark one UNSUPPORTED when it states a figure or fact that the case data or the transcript contradicts (recompute it from the numbers in the transcript), or a figure listed under FIGURES NOT FOUND IN THE CASE DATA that cannot be derived from the transcript's figures. A hypothetical or estimate stated as such ("if we assume 5%", "say 100,000 passengers", "roughly") is fine.
- [wentWell] claims are strengths. Judge only the facts a point states (a figure, a turn reference, what the candidate said or did), and mark it UNSUPPORTED only when the transcript contradicts one of them. Adjectives and judgments ("proactively", "clearly", "strong") are not checked.

${buildVerifierFacts(mathResults, marksSection)}${hints ? `\n\n${hints}` : ''}

TRANSCRIPT:
${transcriptText}

CLAIMS:
${claimsText}

Respond with ONLY valid JSON:
{ "verdicts": [{ "id": 1, "supported": true, "reason": "..." }, ...] }
Include a verdict for every claim.`;
}

const VERIFIER_MAX_TOKENS = 32000;

export async function runClaimVerifier(
  rubric: RubricScores,
  transcript: TranscriptTurn[],
  onUsage?: OnUsage, // lib/llm-usage.ts — token reporting for $/case (PRD §13)
  context: { mathResults?: MathStepResult[]; marksSection?: string; caseData?: Case } = {},
): Promise<{ rubric: RubricScores; dropped: (Claim & { reason: string })[] }> {
  const claims = collectClaims(rubric);
  if (claims.length === 0) return { rubric, dropped: [] };

  const client = anthropicClient();

  const transcriptText = transcript
    .map(t => `[${t.role.toUpperCase()} turn ${t.turnIndex}]: ${t.text}`)
    .join('\n\n');

  // The audit is a hint list: a throw on odd case data must not block the report.
  let betterFigures: BetterFigure[] = [];
  try {
    if (context.caseData) betterFigures = auditBetterFigures(rubric, context.caseData);
  } catch (err) {
    console.error('[verifier] Better-figure audit failed, no hints:', err instanceof Error ? err.message : err);
  }
  const prompt = buildVerifierPrompt(claims, transcriptText, context.mathResults, context.marksSection, betterFigures);

  // A broken verifier response must not block the report — ship unverified
  // rather than fail scoring; the caller logs this.
  let verdicts: Verdict[];
  try {
    // Opus 5.5: thinking always on (adaptive); effort set explicitly (the
    // model's default is medium); thinking counts against max_tokens.
    // Streamed like the judge, so a raised max_tokens can never trip the
    // SDK's non-streaming guard. The judge's cap on the same model (engine-asks
    // final review, 19 Oct): every strength and Better answer is a claim now, and
    // a response cut at the cap has no parsed output — all verification skipped.
    const response = await client.beta.messages.stream({
      model: SCORING_MODEL_ID,
      max_tokens: VERIFIER_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: VERIFIER_OUTPUT_FORMAT, effort: 'high' },
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    }).finalMessage();
    onUsage?.({
      component: 'verifier',
      model: SCORING_MODEL_ID,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    console.log('[verifier] response', { stopReason: response.stop_reason, outputTokens: response.usage.output_tokens, maxTokens: VERIFIER_MAX_TOKENS, claims: claims.length });
    if (!response.parsed_output) throw new Error(`no structured output (stop_reason: ${response.stop_reason})`);
    verdicts = response.parsed_output.verdicts;
  } catch (err) {
    console.error('[verifier] invalid response, skipping verification:', err instanceof Error ? err.message : err);
    return { rubric, dropped: [] };
  }
  return applyVerdicts(rubric, claims, verdicts);
}
