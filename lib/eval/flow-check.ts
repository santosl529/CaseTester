// Flow faults (fact guards Phase 5, 12 Oct), deterministic, for scoring saved
// and replayed runs — the batch-20 grading's D7 and three whole-interview
// failures:
//   D7     a call for the conclusion (recommendation or lever choice) while the
//          brainstorm, the exhibit or the case's core analysis is still owed —
//          not in the last 90 s (the clock is out then); once per owed set
//   STAGE  a completed run that never had the exhibit, the brainstorm, a
//          recommendation (asked or given) or the risk question
//   CLOSE  a closing line from the model while the case goes on ("Thanks,
//          that closes the case. Before you go, …"); code's close before time
//          with no recommendation or the core analysis never attempted; any
//          turn after a close
//   LOOP   the same ask three interviewer turns running with nothing given in
//          between (R17: "what would you prioritize" → "which branch would you
//          start with" → "which one would you check first")
import type { CorpusRun, CorpusTurn } from './run-corpus';
import { asksForConclusion, asksBrainstorm, asksRiskQuestion, namesCandidateRecommendation, isClosingTurn, isReportAnswer } from '@/lib/orchestrator/spoken-close';
import { TOTAL_CASE_MS } from '@/lib/orchestrator/state-machine';
import { LOAD_SHED_REMAINING_MS } from '@/lib/orchestrator/pacing';
import { CLOSE_SCRIPTS_BY_REASON } from '@/lib/agent/prompts/scripts';
import { askIntents } from '@/lib/orchestrator/ask-intent';

export type FlowFlag = { rule: 'D7' | 'STAGE' | 'CLOSE' | 'LOOP'; t: number; sub: string; text: string };

type CaseLike = { exhibits: { id: string }[]; analysisCore?: { items: string[]; minItems?: number; ask?: string }; format?: string };

const questionOf = (t: CorpusTurn) => t.segments.filter(s => s.kind === 'question' || s.kind === 'scripted').map(s => s.text).join(' ')
  || t.segments.filter(s => s.kind !== 'data').map(s => s.text).join(' ');
const CODE_REC = new Set(['rec_ask', 'grace_ask', 'time_warning']);
const AFTER_REC = new Set(['rec_revision', 'rec_math_probe', 'close']);
const CLOSE_WORDS = /\bthat closes (?:the case|out|the recommendation)\b|\bwe'?ll (?:stop|leave it|wrap up) (?:there|here)\b/i;

// Stages as the batch-20 grading counts them — what was actually asked, not
// a move label (stricter than the live tracker, whose blind spots these are):
// "Of the risks you've named, which would most likely derail this plan?" is
// the risk question; "what does that imply for your recommendation" is not.
const BRAINSTORM_MOVE = /\b(?:what|how)\s+else\b|\bwhat\s+other\s+(?:ways|options|levers|ideas|things|moves|actions)\b/i;
const asksBrainstormStage = (t: CorpusTurn, q: string) => asksBrainstorm(q) || t.kind === 'stage_brainstorm' || (t.move === 'brainstorm' && BRAINSTORM_MOVE.test(q));
const asksRecStage = (t: CorpusTurn, q: string) => asksForConclusion(q) || CODE_REC.has(t.kind) || namesCandidateRecommendation(q);

export function checkFlowRun(run: CorpusRun, c: CaseLike): FlowFlag[] {
  const flags: FlowFlag[] = [];
  const turns = run.turns.filter(t => !t.seeded);
  const core = c.analysisCore?.items ?? [];
  const minCore = c.analysisCore?.minItems ?? core.length;
  const hasExhibit = c.exhibits.length > 0;
  const interviewerLed = (c.format ?? 'interviewer_led') === 'interviewer_led';
  let exhibitShown = false, brainstormAsked = false, riskAsked = false, recAsked = false;
  let closedAt: number | null = null, lastOwed = '', steered = false;
  let streak: { tag: string; n: number }[] = [];
  for (const t of turns) {
    const q = questionOf(t);
    const out = new Set([...t.revealedBefore, ...t.releasedNow]);
    const coreAttempted = core.filter(id => out.has(id)).length >= minCore;
    // A close's wording carries its reason: time up, or a recommendation asked twice and not given.
    const closeReason = (Object.keys(CLOSE_SCRIPTS_BY_REASON) as (keyof typeof CLOSE_SCRIPTS_BY_REASON)[])
      .find(k => (CLOSE_SCRIPTS_BY_REASON[k] as readonly string[]).some(line => q.includes(line)));
    const timeUp = (t.elapsedMs !== undefined && t.elapsedMs >= TOTAL_CASE_MS) || closeReason === 'time_up';
    const late = t.elapsedMs !== undefined && TOTAL_CASE_MS - t.elapsedMs < LOAD_SHED_REMAINING_MS;
    exhibitShown ||= t.shownBefore.length > 0 || t.exhibitNow !== null;
    if (closedAt !== null) { flags.push({ rule: 'CLOSE', t: t.t, sub: 'continues_after_close', text: q.slice(0, 200) }); closedAt = null; }
    // D7: a call for the conclusion with a stage or the core analysis owed.
    if ((asksForConclusion(q) || CODE_REC.has(t.kind)) && interviewerLed && !late && !AFTER_REC.has(t.kind)) {
      const owed = [
        ...(!brainstormAsked ? ['brainstorm'] : []),
        ...(hasExhibit && !exhibitShown ? ['exhibit'] : []),
        // Once code has asked back to the analysis, moving on is the rule.
        ...(!coreAttempted && !steered ? ['analysis'] : []),
      ].join('+');
      if (owed && owed !== lastOwed) flags.push({ rule: 'D7', t: t.t, sub: owed, text: q.slice(0, 200) });
      lastOwed = owed;
    }
    // CLOSE: closing words from the model on a turn that isn't the close; code's close too early.
    // Not the one-line answer to a question about assessment (Rule 16).
    const modelText = t.segments.filter(s => s.author === 'model').map(s => s.text).join(' ')
      .split(/(?<=[.!?])\s+/).filter(x => !isReportAnswer(x)).join(' ');
    if (t.kind !== 'close' && (CLOSE_WORDS.test(modelText) || (modelText && isClosingTurn(modelText)))) {
      flags.push({ rule: 'CLOSE', t: t.t, sub: 'model_close_line', text: modelText.slice(0, 200) });
    }
    steered ||= t.kind === 'stage_analysis' || (c.analysisCore?.ask !== undefined && q.includes(c.analysisCore.ask));
    brainstormAsked ||= asksBrainstormStage(t, q);
    recAsked ||= asksRecStage(t, q);
    riskAsked ||= asksRiskQuestion(q, recAsked);
    if (t.kind === 'close') {
      closedAt = t.t;
      const why = timeUp ? '' : !recAsked && closeReason !== 'unresolved' ? 'no_recommendation' : !coreAttempted ? 'core_analysis_owed' : '';
      if (why) flags.push({ rule: 'CLOSE', t: t.t, sub: why, text: q.slice(0, 200) });
    }
    // LOOP: a third ask of the same intent in a row with nothing given.
    const given = t.releasedNow.length > 0 || t.exhibitNow !== null;
    const tags = askIntents(q);
    streak = given ? [] : tags.map(tag => ({ tag, n: (streak.find(s => s.tag === tag)?.n ?? 0) + 1 }));
    const looped = streak.find(s => s.n === 3);
    if (looped) flags.push({ rule: 'LOOP', t: t.t, sub: looped.tag, text: q.slice(0, 200) });
  }
  if (run.status === 'completed' && interviewerLed && turns.length > 0) {
    const missing = [
      ...(hasExhibit && !exhibitShown ? ['exhibit'] : []),
      ...(!brainstormAsked ? ['brainstorm'] : []),
      ...(!recAsked ? ['recommendation'] : []),
      ...(!riskAsked ? ['risk'] : []),
    ];
    if (missing.length > 0) flags.push({ rule: 'STAGE', t: turns.at(-1)!.t, sub: missing.join('+'), text: '' });
  }
  return flags;
}
