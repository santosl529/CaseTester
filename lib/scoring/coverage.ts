import Anthropic from '@anthropic-ai/sdk';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS, type RubricDimensionKey } from './rubric';
import type { OnUsage } from '@/lib/llm-usage';

// Live coverage tracker (a SEPARATE, cheaper agent from the end-of-case judge).
// It answers one question each turn: how much EVIDENCE do we have to score each
// rubric dimension yet — NOT how well the candidate did. This lets the
// interviewer steer toward undertested areas and prevents it from ending the
// case before every dimension has been probed. Runs in the background (the turn
// route's after()), so it never adds latency and lags by ~a turn.
//
// CRITICAL: coverage is EVIDENCE-SUFFICIENCY, not quality. A dimension the
// candidate clearly FAILED is still fully covered (we tested it, they did
// poorly) — otherwise a weak candidate could never satisfy the end gate and the
// case would trap them re-failing their weakest area forever.

export const COVERAGE_THRESHOLD = 60;          // per-dimension evidence needed to allow ending
export const COVERAGE_MIN_GUARD_MS = 60_000;   // never end this early even if coverage claims complete
export const COVERAGE_TIME_FLOOR_FRACTION = 0.8; // fallback floor when no coverage signal is available

const COVERAGE_MODEL_ID = 'claude-haiku-4-5-20251001';

export type CoverageScores = Partial<Record<RubricDimensionKey, number>>;

export function isCoverageComplete(coverage: CoverageScores, threshold = COVERAGE_THRESHOLD): boolean {
  return RUBRIC_DIMENSION_KEYS.every(k => (coverage[k] ?? 0) >= threshold);
}

// Can the interviewer end the case now?
// - Hard time-up always ends (a genuinely-untestable dimension must never trap the session).
// - With a coverage signal: end only once every dimension has enough evidence AND we're past
//   a small minimum guard (so a hallucinated "all covered" can't end the case absurdly early).
// - Without a coverage signal (agent failed/pending): degrade gracefully to an 80% time floor.
export function canEndCase(params: {
  coverage: CoverageScores | null;
  elapsedMs: number;
  totalMs: number;
  timeUp: boolean;
}): boolean {
  if (params.timeUp) return true;
  if (params.coverage && Object.keys(params.coverage).length > 0) {
    return isCoverageComplete(params.coverage) && params.elapsedMs >= COVERAGE_MIN_GUARD_MS;
  }
  return params.elapsedMs >= params.totalMs * COVERAGE_TIME_FLOOR_FRACTION;
}

// Interviewer-facing steer: the undertested dimensions to push toward, and
// whether the case may wrap yet. One line — the prompt is already large.
export function formatCoverageSteer(coverage: CoverageScores | null, threshold = COVERAGE_THRESHOLD): string {
  if (!coverage || Object.keys(coverage).length === 0) return '';
  const under = RUBRIC_DIMENSION_KEYS.filter(k => (coverage[k] ?? 0) < threshold);
  if (under.length === 0) {
    return 'COVERAGE: every rubric area has now been tested. Once the recommendation is in, probe its biggest risk once (move "risk"); the system closes the case.';
  }
  const list = under.map(k => `${RUBRIC_DIMENSION_LABELS[k]} (${coverage[k] ?? 0}/100)`).join(', ');
  return `COVERAGE — these areas are still undertested; steer the conversation toward them when the candidate's thread allows: ${list}.`;
}

// Parse a Haiku coverage response into scores, clamped to 0-100. Null on garbage.
export function parseCoverageResponse(raw: string): CoverageScores | null {
  const jsonText = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (obj == null || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  const scores: CoverageScores = {};
  for (const k of RUBRIC_DIMENSION_KEYS) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      scores[k] = Math.max(0, Math.min(100, Math.round(v)));
    }
  }
  return Object.keys(scores).length > 0 ? scores : null;
}

type TranscriptTurn = { role: string; text: string };

export async function assessCoverage(
  transcript: TranscriptTurn[],
  onUsage?: OnUsage, // lib/llm-usage.ts — token reporting for $/case (PRD §13)
): Promise<CoverageScores | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const transcriptText = transcript
    .map(t => `[${t.role.toUpperCase()}]: ${t.text}`)
    .join('\n\n');

  const prompt = `You are tracking, live during a case interview, how much EVIDENCE exists to score the candidate on each of 8 dimensions — NOT how well they did.

A dimension is "covered" once there is enough evidence to assign a rating, even a poor one. A candidate who clearly FAILED a dimension still counts as fully covered (score it high). 0 = not tested or observed at all; 100 = thoroughly observed (whether the candidate did well OR poorly). Do NOT reward or penalize quality — only measure whether the dimension has been put to the test.

DIMENSIONS:
- structure: problem structuring / framework
- quantitative: live math, calculation, quantitative rigor
- dataExhibit: reading/interpreting an exhibit or data
- judgment: business judgment, commercial sense, risk awareness
- creativity: brainstorming breadth
- synthesis: final recommendation / synthesis
- communication: delivery, signposting, top-down clarity
- pushback: handling challenges, composure, case leadership

TRANSCRIPT SO FAR:
${transcriptText}

Respond with ONLY this JSON (each value 0-100):
{"structure":N,"quantitative":N,"dataExhibit":N,"judgment":N,"creativity":N,"synthesis":N,"communication":N,"pushback":N}`;

  try {
    const response = await client.messages.create({
      model: COVERAGE_MODEL_ID,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    onUsage?.({
      component: 'coverage',
      model: COVERAGE_MODEL_ID,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    const raw = (response.content[0] as { type: 'text'; text: string }).text;
    return parseCoverageResponse(raw);
  } catch (err) {
    console.error('[coverage] assess failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
