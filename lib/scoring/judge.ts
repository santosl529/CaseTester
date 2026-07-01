import Anthropic from '@anthropic-ai/sdk';
import type { Case } from '@/lib/cases/schema';

export type Rating = 'needs_work' | 'meets_bar' | 'strong';

export type DimensionScore = {
  rating: Rating;
  evidence: string[];   // 1-2 direct quotes from candidate transcript
  guidance: string;
};

export type RubricScores = {
  structure:     DimensionScore;
  quantitative:  DimensionScore;
  judgment:      DimensionScore;
  communication: DimensionScore;
  synthesis:     DimensionScore;
  overallRating: Rating;
  topFix:        string;
};

type TranscriptTurn = { role: string; text: string; turnIndex: number };

export async function runJudge(
  transcript: TranscriptTurn[],
  caseData: Case,
  revealedItemIds: string[], // kept for future gate-check logic; not yet used in prompt
): Promise<RubricScores> {
  // revealedItemIds available for future use (e.g. penalise referencing un-revealed data)
  void revealedItemIds;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const transcriptText = transcript
    .map(t => `[${t.role.toUpperCase()} turn ${t.turnIndex}]: ${t.text}`)
    .join('\n\n');

  const rubricText = Object.entries(caseData.rubricAnchors)
    .map(([dim, anchors]) =>
      `${dim.toUpperCase()}:\n  needs_work: ${anchors.needs_work}\n  meets_bar: ${anchors.meets_bar}\n  strong: ${anchors.strong}`
    )
    .join('\n\n');

  const prompt = `You are an expert McKinsey case interview evaluator. Score the following candidate interview transcript on 5 dimensions.

CASE: ${caseData.title}
STRUCTURE KEY: ${caseData.structureKey}
RECOMMENDATION KEY: ${caseData.recommendationKey}

RUBRIC ANCHORS:
${rubricText}

TRANSCRIPT:
${transcriptText}

For each dimension, provide:
1. rating: exactly one of "needs_work", "meets_bar", or "strong"
2. evidence: 1-2 direct quotes from the CANDIDATE turns (not interviewer) that justify the rating
3. guidance: one specific, actionable improvement suggestion

Also provide:
- overallRating: the single overall rating ("needs_work", "meets_bar", or "strong")
- topFix: the single highest-leverage improvement the candidate should make

Respond with ONLY valid JSON matching this schema:
{
  "structure":     { "rating": "...", "evidence": ["..."], "guidance": "..." },
  "quantitative":  { "rating": "...", "evidence": ["..."], "guidance": "..." },
  "judgment":      { "rating": "...", "evidence": ["..."], "guidance": "..." },
  "communication": { "rating": "...", "evidence": ["..."], "guidance": "..." },
  "synthesis":     { "rating": "...", "evidence": ["..."], "guidance": "..." },
  "overallRating": "...",
  "topFix": "..."
}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (response.content[0] as { type: 'text'; text: string }).text;
  return JSON.parse(raw) as RubricScores;
}
