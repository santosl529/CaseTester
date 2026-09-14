import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS } from './rubric';
import type { OnUsage } from '@/lib/llm-usage';

// Second-pass claim verification (docs/interviewer-behavior.md §3): the
// deterministic evidence audit catches fabricated quotes, but not false
// claims ABOUT the transcript — above all omission claims ("the candidate
// never proposed hedging") that contain no quote to check. This pass gives a
// verifier one focused question per claim; claims the transcript contradicts
// are dropped. Scoped to the sections that hurt when wrong (needsWork,
// missedOpportunities, topFix) — false praise is handled by judge discipline.

export type Claim = {
  id: number;
  dimension: string; // rubric key, or 'topFix'
  section: 'needsWork' | 'missedOpportunities' | 'topFix';
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

export function collectClaims(rubric: RubricScores): Claim[] {
  const claims: Claim[] = [];
  let id = 1;
  for (const key of RUBRIC_DIMENSION_KEYS) {
    rubric[key].needsWork.forEach((item, index) => {
      claims.push({ id: id++, dimension: key, section: 'needsWork', index, text: item.point });
    });
    rubric[key].missedOpportunities.forEach((item, index) => {
      claims.push({ id: id++, dimension: key, section: 'missedOpportunities', index, text: item.moment });
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
    const toDropNeedsWork = new Set(
      claims.filter(c => c.dimension === key && c.section === 'needsWork' && unsupported(c)).map(c => c.index),
    );
    cleaned[key].needsWork = cleaned[key].needsWork.filter((_, i) => !toDropNeedsWork.has(i));

    const toDropMissed = new Set(
      claims.filter(c => c.dimension === key && c.section === 'missedOpportunities' && unsupported(c)).map(c => c.index),
    );
    cleaned[key].missedOpportunities = cleaned[key].missedOpportunities.filter((_, i) => !toDropMissed.has(i));
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

export async function runClaimVerifier(
  rubric: RubricScores,
  transcript: TranscriptTurn[],
  onUsage?: OnUsage, // lib/llm-usage.ts — token reporting for $/case (PRD §13)
): Promise<{ rubric: RubricScores; dropped: (Claim & { reason: string })[] }> {
  const claims = collectClaims(rubric);
  if (claims.length === 0) return { rubric, dropped: [] };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const transcriptText = transcript
    .map(t => `[${t.role.toUpperCase()} turn ${t.turnIndex}]: ${t.text}`)
    .join('\n\n');

  const claimsText = claims.map(c => `${c.id}. [${c.dimension}/${c.section}] ${c.text}`).join('\n');

  const prompt = `You are verifying claims an evaluator made about a case-interview candidate, against the actual transcript. For each numbered claim, decide whether the transcript supports it.

Mark a claim UNSUPPORTED only when the transcript factually contradicts it — above all:
- omission claims ("the candidate never mentioned / failed to propose X") when the candidate actually said X anywhere in the transcript;
- mischaracterizations of what the candidate said or asked;
- descriptions of moments that did not happen.
Lean SUPPORTED on matters of judgment or severity — you are checking facts, not re-grading the interview.

TRANSCRIPT:
${transcriptText}

CLAIMS:
${claimsText}

Respond with ONLY valid JSON:
{ "verdicts": [{ "id": 1, "supported": true, "reason": "..." }, ...] }
Include a verdict for every claim.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  onUsage?.({
    component: 'verifier',
    model: 'claude-opus-4-8',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  const raw = (response.content[0] as { type: 'text'; text: string }).text;
  const jsonText = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  try {
    const { verdicts } = VerdictsSchema.parse(JSON.parse(jsonText));
    return applyVerdicts(rubric, claims, verdicts);
  } catch (err) {
    // A broken verifier response must not block the report — ship unverified
    // rather than fail scoring; the caller logs this.
    console.error('[verifier] invalid response, skipping verification:', err instanceof Error ? err.message : err);
    return { rubric, dropped: [] };
  }
}
