import { normalizeNumberWords } from '@/lib/number-words';
import type { VerifiedFigure } from './recompute';

// Probing correct math (docs/interviewer-behavior.md Rule 2 v4.5). Before a
// turn is sent, withhold — the way the provenance audit withholds sentences —
//   - any doubt-probe sentence about a verified figure, always;
//   - any explain-probe sentence about a verified figure whose work was shown,
//     or that was already probed once.
// Batch 2: Ines ("25 × 42 = 10.5% of revenue") got "Points of what — you said
// beans were ten and a half percent of revenue; walk me through…" and
// apologized for correct math; Sam, Tobias and Maya got the same probe.

const DOUBT = /\b(points of what|are you sure|sure about|check (that|this|it)|is that right|double[- ]check|redo|once more|again)\b/i;
const EXPLAIN = /\b(walk me through|how did you (get|arrive|land)|take me through|explain how|show me how)\b/i;

export type WithheldProbe = {
  sentence: string;
  stepId: string;
  test: 'doubt_on_verified' | 'explain_work_shown' | 'explain_already_probed';
};

function sentencesOf(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

function numbersIn(text: string): number[] {
  return [...normalizeNumberWords(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m => parseFloat(m[0].replace(/,/g, '')));
}

// The sentence names the figure, or quotes every input of its step ("twenty-
// five percent of COGS, at COGS being forty-two percent… gives you what?").
function mentions(sentence: string, v: VerifiedFigure): boolean {
  const nums = numbersIn(sentence);
  const tol = Math.max(0.05, Math.abs(v.value) * 0.02);
  if (nums.some(n => Math.abs(n - v.value) <= tol)) return true;
  return v.operands.length >= 2 && v.operands.every(o => nums.some(n => Math.abs(n - o) < 1e-9 || Math.abs(n * 100 - o) < 1e-6));
}

export function withholdProbesOnVerified(
  spokenText: string,
  params: {
    verified: VerifiedFigure[];            // this candidate turn's verified figures, then the previous turn's
    alreadyProbed: Set<string>;             // step ids given an explain probe earlier in the session
    flaggedThisTurn: boolean;               // a recompute flag fired: an unattributed doubt may be about that
  },
): { text: string; withheld: WithheldProbe[]; explainProbed: string[] } {
  const { verified, alreadyProbed, flaggedThisTurn } = params;
  if (verified.length === 0) return { text: spokenText, withheld: [], explainProbed: [] };

  const withheld: WithheldProbe[] = [];
  const explainProbed: string[] = [];
  const kept = sentencesOf(spokenText).filter(sentence => {
    const doubt = DOUBT.test(sentence);
    // Process phrasing only: a question that builds on a verified figure
    // ("Given 10.5, what does a 40% bean rise do?") is the next task, not a probe.
    const explain = EXPLAIN.test(sentence);
    if (!doubt && !explain) return true;

    // Which verified figure is this sentence about? Named, or — for a bare
    // doubt like "Points of what?" — the figure just verified, when nothing
    // else was flagged this turn.
    const named = verified.find(v => mentions(sentence, v));
    const about = named ?? (doubt && !flaggedThisTurn && numbersIn(sentence).length === 0 ? verified[0] : undefined);
    if (!about) return true;

    if (doubt) {
      withheld.push({ sentence, stepId: about.stepId, test: 'doubt_on_verified' });
      return false;
    }
    if (about.workShown) {
      withheld.push({ sentence, stepId: about.stepId, test: 'explain_work_shown' });
      return false;
    }
    if (alreadyProbed.has(about.stepId) || explainProbed.includes(about.stepId)) {
      withheld.push({ sentence, stepId: about.stepId, test: 'explain_already_probed' });
      return false;
    }
    explainProbed.push(about.stepId);
    return true;
  });

  const text = kept.join(' ').trim();
  return { text: text || 'Go on.', withheld, explainProbed };
}
