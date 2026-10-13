import { normalizeNumberWords } from '@/lib/number-words';
import type { VerifiedFigure } from './recompute';
import { classifyMathTalk } from './math-talk';

// Challenges to the candidate's math, decided by what code verified
// (docs/interviewer-behavior.md Rule 2; round-3 fixes, 11 Oct 2026). Before a
// turn is sent, a sentence that doubts the candidate's math (math-talk.ts) is
// spoken only when a check flagged the figure as wrong this turn:
//   - verified correct (a math step, stated arithmetic, a unit conversion) →
//     withheld, always ("doubt_on_verified"; batch 2: Ines apologised for
//     correct math);
//   - flagged incorrect → allowed (Rule 14: one probe, then the correction);
//   - unverified → withheld ("unsupported_challenge"): no flag is not proof the
//     candidate is right, and it is not grounds to doubt them either (batch 18:
//     "is that the right base?" on correct work in 5 interviews). A doubt that
//     names no figure is allowed only when a flag fired this turn.
// A neutral request for the working ("How did you get there?") stays allowed:
// once per figure, and never on verified work that was shown.

export type WithheldProbe = {
  sentence: string;
  stepId?: string;      // the verified figure's step, when about one
  figure?: number;      // the candidate figure it was about, when named
  test: 'doubt_on_verified' | 'unsupported_challenge' | 'explain_work_shown' | 'explain_already_probed' | 'closed_to_report';
};

export type ChallengeContext = {
  verified: VerifiedFigure[];        // this candidate turn's verified figures, then the previous turn's
  flagged?: number[];                // figures a check flagged as wrong this turn
  closed?: number[];                 // figures of a flag past Rule 14 (corrected, or left for the report): never asked about again
  flaggedThisTurn: boolean;          // any flag fired this turn: an unattributed doubt may be about it
  candidateFigures?: number[];       // the figures the candidate derived (math-talk.ts candidateFiguresOf)
  alreadyProbed: Set<string>;        // step ids / "fig:<n>" keys given an explain probe earlier
};

function sentencesOf(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

function numbersIn(text: string): number[] {
  return [...normalizeNumberWords(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
}

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.02);

// The sentence names the figure, or quotes every input of its step ("twenty-
// five percent of COGS, at COGS being forty-two percent… gives you what?").
function mentions(sentence: string, v: VerifiedFigure): boolean {
  const nums = numbersIn(sentence);
  if (nums.some(n => same(n, v.value))) return true;
  return v.operands.length >= 2 && v.operands.every(o => nums.some(n => Math.abs(n - o) < 1e-9 || Math.abs(n * 100 - o) < 1e-6));
}

// The decision for one sentence: null = may be spoken.
export function challengeVerdict(sentence: string, ctx: ChallengeContext, probedNow: Set<string> = new Set(), previous?: string): WithheldProbe | { explainKey: string } | null {
  const { verified, flaggedThisTurn, alreadyProbed } = ctx;
  const flagged = ctx.flagged ?? [];
  const candidateFigures = [...(ctx.candidateFigures ?? []), ...verified.map(v => v.value)];
  const talk = classifyMathTalk(sentence, [...candidateFigures, ...(ctx.closed ?? [])], previous);
  // A flag past Rule 14: the case moved on (Lorenzo, 13 Oct; Jordan 099f33e9).
  const closedFig = talk.figures.find(f => (ctx.closed ?? []).some(x => same(f, x)));
  if (closedFig !== undefined) return { sentence, figure: closedFig, test: 'closed_to_report' };
  if (talk.kind === 'none') return null;
  const named = verified.find(v => mentions(sentence, v));

  if (talk.kind === 'doubt') {
    if (talk.figures.some(f => flagged.some(x => same(f, x)))) return null;
    if (named) return { sentence, stepId: named.stepId, figure: named.value, test: 'doubt_on_verified' };
    const unflagged = talk.figures[0];
    if (unflagged !== undefined) return { sentence, figure: unflagged, test: 'unsupported_challenge' };
    if (flaggedThisTurn) return null;
    if (verified.length > 0) return { sentence, stepId: verified[0].stepId, figure: verified[0].value, test: 'doubt_on_verified' };
    return { sentence, test: 'unsupported_challenge' };
  }

  // explain
  if (named) {
    if (named.workShown) return { sentence, stepId: named.stepId, figure: named.value, test: 'explain_work_shown' };
    if (alreadyProbed.has(named.stepId) || probedNow.has(named.stepId)) return { sentence, stepId: named.stepId, figure: named.value, test: 'explain_already_probed' };
    return { explainKey: named.stepId };
  }
  const fig = talk.figures.find(f => !flagged.some(x => same(f, x)));
  if (fig === undefined) return null;   // unattributed, or about a flagged figure (Rule 14's probe)
  const key = `fig:${fig}`;
  if (alreadyProbed.has(key) || probedNow.has(key)) return { sentence, figure: fig, test: 'explain_already_probed' };
  return { explainKey: key };
}

export function withholdMathChallenges(
  spokenText: string,
  ctx: ChallengeContext,
): { text: string; withheld: WithheldProbe[]; explainProbed: string[] } {
  const withheld: WithheldProbe[] = [];
  const explainProbed: string[] = [];
  const all = sentencesOf(spokenText);
  const kept = all.filter((sentence, i) => {
    const v = challengeVerdict(sentence, ctx, new Set(explainProbed), all[i - 1]);
    if (v === null) return true;
    if ('explainKey' in v) { explainProbed.push(v.explainKey); return true; }
    withheld.push(v);
    return false;
  });
  const text = kept.join(' ').trim();
  return { text: text || 'Go on.', withheld, explainProbed };
}

// The pre-v3 name, kept for the replay scripts.
export const withholdProbesOnVerified = withholdMathChallenges;
