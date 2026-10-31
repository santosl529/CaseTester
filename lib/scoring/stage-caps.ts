// Stage evidence in scoring (docs/interviewer-behavior.md Rule 9, v4.10;
// round-3 fix 10). Batch 18: the exhibit was never shown in 8 interviews, yet
// all 8 were rated on Data & Exhibit from numbers read aloud; one report said
// the brainstorm was never asked and rated Creativity "strong" anyway.
//
// The judge is told what actually happened, stage by stage, from the
// session's own record (lib/orchestrator/stage-evidence.ts) — not from move
// labels, and "exhibit shown" is never "exhibit interpreted". Then, in code:
//   - a dimension whose stage was administered (delivered, whatever the
//     candidate did with it — answered, declined, unable) is rated as judged:
//     not doing it when asked is performance (Rule 13);
//   - a dimension whose stage never happened is rated only on real evidence
//     elsewhere — quoted, surviving the audits — including spontaneous work
//     (a brainstorm the candidate offered unasked); with no such evidence it
//     is "not assessed", never an invented rating and never an automatic
//     "meets bar";
//   - a partial interview (the candidate ended it, Rule 18A) has no overall
//     rating.
import type { RubricScores } from './judge';
import type { RubricDimensionKey } from './rubric';
import { RUBRIC_DIMENSION_LABELS } from './rubric';
import { INITIAL_STAGES, STAGES, updateStages, type StageEntry, type StageKey, type StageRecord } from '@/lib/orchestrator/stage-evidence';
import { brainstormRequired, type CaseBrainstorm } from '@/lib/orchestrator/brainstorm';
import { evaluateStall, INITIAL_STALL_STATE } from '@/lib/orchestrator/stall';
import { candidateFiguresOf } from '@/lib/orchestrator/math-talk';
import { INITIAL_PRESSURE_TEST, type PressureTestState } from '@/lib/orchestrator/pressure-test';
import type { Phase } from '@/lib/orchestrator/state-machine';

// The stage each dimension is primarily scored at (rubric stages). Judgment,
// communication and pushback are read across the whole interview.
export const DIMENSION_STAGE: Partial<Record<RubricDimensionKey, StageKey>> = {
  structure: 'structure',
  quantitative: 'analysis',
  dataExhibit: 'exhibit',
  creativity: 'brainstorm',
  synthesis: 'recommendation',
};

const STAGE_LABEL: Record<StageKey, string> = {
  structure: 'Structure (the opening question)', pressure_test: 'Pressure test on the structure', analysis: 'Analysis (case data released and worked)',
  exhibit: 'Exhibit', brainstorm: 'Brainstorm', recommendation: 'Recommendation', risk: 'Risk to the recommendation',
};

export function administered(e: StageEntry | undefined): boolean {
  return Boolean(e && ((e.delivered && e.outcome !== 'time_up') || e.spontaneous));
}

function describe(e: StageEntry): string {
  if (!e.delivered) return e.spontaneous ? 'not asked, but the candidate did it unprompted' : e.outcome === 'time_up' ? 'never reached — time ran out' : 'never administered';
  const at = e.deliveredAt !== undefined ? ` at turn ${e.deliveredAt}` : '';
  const by = e.codeAsked ? ' (asked by the system)' : '';
  switch (e.outcome) {
    case 'answered': return e.withRecommendation ? `asked${at} within the recommendation question; the candidate named a risk` : `administered${at}${by}; the candidate engaged with it`;
    case 'declined': return `administered${at}${by}; the candidate declined it`;
    case 'unable': return e.noneNamed ? `asked${at} within the recommendation question; the candidate's answer named no risk` : `administered${at}${by}; the candidate could not do it`;
    case 'waived': return `administered${at}; closed by the system's bound without an answer (waived — not answered, not a weakness by itself)`;
    case 'time_up': return `administered${at}; time ran out before an answer`;
    default: return `administered${at}${by}; no reply to it yet when the interview ended`;
  }
}

// The stages a case has no module for: the brainstorm when brainstorm.required is false.
export function stagesNotInCase(c: CaseBrainstorm): StageKey[] {
  return brainstormRequired(c) ? [] : ['brainstorm'];
}

// `notInCase`: stages the case has no module for (brainstorm.required false,
// Quillpath) — "not part of this case", not "never administered" (Lorenzo, 13 Oct).
export function formatStageRecordSection(rec: StageRecord, partial: { exitTurn?: number } | null, opts: { notInCase?: StageKey[] } = {}): string {
  const notInCase = new Set(opts.notInCase ?? []);
  const outOfCase = (k: StageKey) => notInCase.has(k) && !administered(rec[k]);
  const lines = STAGES.map(k => `- ${STAGE_LABEL[k]}: ${outOfCase(k) ? 'not part of this case' : describe(rec[k] ?? { delivered: false })}`);
  const dims = (pick: (k: StageKey) => boolean) => Object.entries(DIMENSION_STAGE).filter(([, k]) => pick(k!)).map(([d]) => RUBRIC_DIMENSION_LABELS[d as RubricDimensionKey]);
  const notReached = dims(k => !administered(rec[k]) && !outOfCase(k));
  const notPart = dims(outOfCase);
  const parts = [`STAGE RECORD (from the session's own log — what was actually put to the candidate, not what the interviewer intended):
${lines.join('\n')}
How to score from it: an exhibit shown is not an exhibit interpreted — rate Data & Exhibit Interpretation on what the candidate actually did with the data. A dimension whose stage was never administered may be rated only on real, quoted evidence from elsewhere in the interview (work the candidate did unprompted counts); with none, set notAssessed with a coverageCaveat saying the stage never happened — do not guess a rating. A stage that was administered and that the candidate declined or could not do is performance, not a coverage gap.${notReached.length ? `\nDimensions whose stage never happened: ${notReached.join(', ')}.` : ''}${notPart.length ? `\nDimensions whose stage is not part of this case: ${notPart.join(', ')} — rate only on real, quoted evidence from elsewhere; with none, set notAssessed.` : ''}`];
  // `recLastQuestion` (29 Oct): the risk was asked inside the recommendation question, and the next turn is the close.
  if (rec.risk?.withRecommendation) {
    parts.push(`The recommendation was the interview's last question: it asked for the recommendation, the main risks and next steps together, and nothing after it was put to the candidate — no challenge to the recommendation, no separate risk question, no follow-up. Something the interview never tested is not assessed, never a weakness: do not fault the candidate for not defending the recommendation under pushback or for anything after it, and mark a strong-checklist element with no such moment "no_occasion". Risks and next steps named in answer to that question answer what was asked — not a failure to raise them unprompted. Rate Handling Pushback only on challenges earlier in the interview; with none, set notAssessed with a coverageCaveat saying the interview never challenged the candidate's answers.`);
  }
  if (partial) {
    parts.push(`PARTIAL INTERVIEW: the candidate chose to end the interview${partial.exitTurn !== undefined ? ` at turn ${partial.exitTurn}` : ''}. Score only what happened before it. Dimensions whose stage was not reached are notAssessed unless there is real evidence elsewhere. Never mention, rate or penalize the decision to stop, or anything said about stopping; the topFix is about the work they did. The overall rating will not be shown.`);
  }
  return parts.join('\n\n');
}

const quoted = (items: { quotes: string[] }[]) => items.some(i => i.quotes.some(q => q.trim().length > 0));

export function applyStageCaps(
  rubric: RubricScores,
  rec: StageRecord,
  opts: { partial: boolean; notInCase?: StageKey[] },
): { rubric: RubricScores; notAssessed: RubricDimensionKey[]; caveated: RubricDimensionKey[] } {
  const out = structuredClone(rubric);
  const notAssessed: RubricDimensionKey[] = [];
  const caveated: RubricDimensionKey[] = [];
  for (const [key, stage] of Object.entries(DIMENSION_STAGE) as [RubricDimensionKey, StageKey][]) {
    const dim = out[key];
    if (dim.notAssessed || administered(rec[stage])) continue;
    const label = STAGE_LABEL[stage].toLowerCase();
    const notInCase = opts.notInCase?.includes(stage) ?? false;
    if (!quoted(dim.wentWell) && !quoted(dim.needsWork)) {
      dim.notAssessed = true;
      dim.coverageCaveat ||= notInCase ? `This case has no ${label} stage, so this wasn't assessed.`
        : opts.partial
        ? `The interview ended before the ${label} stage, so this wasn't assessed.`
        : `The ${label} stage never happened in this interview, so this wasn't assessed.`;
      notAssessed.push(key);
    } else if (!dim.coverageCaveat) {
      dim.coverageCaveat = notInCase ? `This case has no ${label} stage; this rating rests on what you did elsewhere.`
        : `The ${label} stage never happened in this interview; this rating rests on what you did elsewhere.`;
      caveated.push(key);
    }
  }
  // Handling Pushback is read across the interview, so it gets no stage caveat; but an interview that never challenged
  // the candidate — no pressure test, no quoted moment either way — did not test it (report tone, Lorenzo, 31 Oct:
  // "not assessed, never a weakness"): its unquoted faults and missed moments go with the rating.
  const pushback = out.pushback;
  if (!pushback.notAssessed && !administered(rec.pressure_test) && !quoted(pushback.wentWell) && !quoted(pushback.needsWork)) {
    pushback.notAssessed = true;
    pushback.needsWork = [];
    pushback.missedOpportunities = [];
    pushback.coverageCaveat ||= 'The interview never challenged your answers, so this wasn\'t assessed.';
    notAssessed.push('pushback');
  }
  if (opts.partial) out.overallRating = null;
  return { rubric: out, notAssessed, caveated };
}

// A stage record rebuilt from a transcript, for sessions recorded before the
// record existed (re-grading batch 18). Same rules as the live update.
export function reconstructStages(p: {
  turns: { role: string; text: string; turnIndex: number; timestampMs: number }[];
  exhibitShownAtMs: number[];
  revealedAtMs: number[];
  pressureTest: Partial<PressureTestState> | undefined;
  caseTexts: string[];
  phaseAt?: (turnIndex: number) => Phase;
}): StageRecord {
  let rec: StageRecord = structuredClone(INITIAL_STAGES);
  let stall = INITIAL_STALL_STATE;
  const pt = { ...INITIAL_PRESSURE_TEST, ...p.pressureTest } as PressureTestState;
  const turns = [...p.turns].sort((a, b) => a.turnIndex - b.turnIndex);
  let lastMs = turns[0]?.timestampMs ?? 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role !== 'interviewer' || t.turnIndex === 0) { if (t.role === 'interviewer') lastMs = t.timestampMs; continue; }
    const cand = turns.slice(0, i).reverse().find(x => x.role === 'candidate');
    if (!cand) { lastMs = t.timestampMs; continue; }
    stall = evaluateStall(cand.text, p.phaseAt?.(cand.turnIndex) ?? 'RECOMMENDATION', stall).state;
    const inTurn = (ms: number) => ms > lastMs && ms <= t.timestampMs + 1;
    rec = updateStages(rec, {
      turnIndex: t.turnIndex, candidateText: cand.text, question: t.text,
      exhibitShown: p.exhibitShownAtMs.some(inTurn), released: p.revealedAtMs.some(inTurn),
      recAsked: false, recommendationDelivered: stall.recommendationDelivered,
      // The probe's outcome as it ended; its turn as logged.
      pressureTest: (pt.askedAt ?? Infinity) <= t.turnIndex ? pt : { ...INITIAL_PRESSURE_TEST, structureGiven: pt.structureGiven && (pt.askedAt ?? 0) <= t.turnIndex },
      candidateFigures: candidateFiguresOf(turns.slice(0, i).filter(x => x.role === 'candidate').map(x => x.text), p.caseTexts).length,
    });
    lastMs = t.timestampMs;
  }
  return rec;
}
