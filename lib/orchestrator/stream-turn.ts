// The Stream stage (specs 2026-10-05-streaming-turn §4.3 and 2026-10-06
// plan-owns-decisions §5). The model's declarations close first; its "say"
// sentences stream, each delivered only if no veto applies (vetoReason — the
// same function Settle uses to withhold); the first sentence a veto would
// withhold stops delivery and the rest is Settle's. When "say" closes, code's
// data line (releases, exhibit handover, refusals, deferrals, offers —
// turn-data.ts) is delivered. The question is never delivered here: Settle
// sends it with the tail. Nothing is delivered before the distress verdict
// (D1). Stream never books a reveal; Settle books what was delivered (D3).
import type { TurnEvent, TurnValidation } from '@/lib/agent/models/interface';
import { toRequests, type ModelTurn } from '@/lib/agent/models/turn-schema';
import { NEUTRAL_TURN } from '@/lib/agent/models/turn-events';
import type { ModelPlan } from './plan-turn';
import type { SegmentSink } from './turn-types';
import type { Phase } from './state-machine';
import type { VerifiedFigure } from './recompute';
import type { OpenRequestItem } from './assumption-guard';
import { isDistressVerdict, type DistressVerdict } from './distress';
import { stripFabricatedTurn, stripMetaLeak, rewriteSystemLanguage, stripCopiedCheckIn } from './audit';
import { enforceNumericProvenance, changeFigures } from './numeric-provenance';
import { withholdProbesOnVerified } from './probe-guard';
import { withholdAssumptionChallenges } from './assumption-guard';
import { suppliesRecommendation } from './synthesis-guard';
import { isClosingTurn } from './spoken-close';
import { hasCloseCue } from '@/lib/agent/prompts/scripts';
import { handoffSentences } from './data-ledger';
import { promisesExhibit } from './exhibits';
import { revealedValues } from './data-ledger';
import { turnData } from './turn-data';
import { renderDataLines } from './data-decisions';

export type GateContext = {
  allowedTexts: string[];
  verified: VerifiedFigure[];
  alreadyProbed: Set<string>;
  flaggedThisTurn: boolean;
  openItems: OpenRequestItem[];
  phase: Phase;
};

// The model's own words declining, deferring or announcing data — code
// speaks those lines; a model that writes them doubles or contradicts them
// (batch 9: Devon t14 "…is available, so I'll give you that").
const DATA_TALK = /\b(i don'?t have|that'?s not in the information|isn'?t something i have|i'?ll come back to|come back to (that|it)|(is|are) available|i'?ll (give|share|show) you|let me (give|share|show|pull))\b/i;

// Why a sentence of the model's own words must not be spoken, or null.
// `inQuestion`: the sentence is (part of) the question field — a question
// there is expected; in "say" it is not.
export function vetoReason(sentence: string, g: GateContext, opts: { inQuestion?: boolean } = {}): string | null {
  if (stripFabricatedTurn(sentence).fabricated !== null) return 'fabricated_turn';
  if (stripMetaLeak(sentence).strippedSentences.length > 0) return 'meta_leak';
  if (rewriteSystemLanguage(sentence).rewrites.length > 0) return 'system_language';
  if (stripCopiedCheckIn(sentence).stripped) return 'copied_check_in';
  if (enforceNumericProvenance(sentence, g.allowedTexts).blocked) return 'provenance';
  const probe = withholdProbesOnVerified(sentence, { verified: g.verified, alreadyProbed: g.alreadyProbed, flaggedThisTurn: g.flaggedThisTurn });
  if (probe.withheld.length > 0) return 'probe_guard';
  if (withholdAssumptionChallenges(sentence, g.openItems).withheld.length > 0) return 'assumption_guard';
  if (hasCloseCue(sentence) || isClosingTurn(sentence)) return 'close_cue';
  // Data lines come between "say" and the question, so only "say" can double
  // them; a probe question about data ("what would be available to test
  // that?") is the interviewer's job.
  if (!opts.inQuestion && (DATA_TALK.test(sentence) || handoffSentences(sentence).length > 0 || promisesExhibit(sentence))) return 'data_talk';
  if (['BRAINSTORM', 'RECOMMENDATION', 'WRAP'].includes(g.phase) && suppliesRecommendation(sentence)) return 'synthesis';
  if (!opts.inQuestion && sentence.trim().endsWith('?')) return 'question_in_say';
  return null;
}

// The gate context for this turn; `extraRevealed` adds values released this turn.
export function gateContext(plan: ModelPlan, extraRevealed: string[] = []): GateContext {
  const { ctx, state } = plan;
  const revealed = [...Object.values(revealedValues(state.ledger)), ...extraRevealed];
  return {
    allowedTexts: [
      state.caseData.prompt,
      ...state.turnRows.filter(t => t.role === 'candidate').map(t => t.text),
      ctx.candidateText,
      ...state.derivedValueTexts,
      ...revealed,
      ...changeFigures(revealed),
    ],
    verified: [...state.verifiedNow, ...state.verifiedPrev],
    alreadyProbed: state.explainProbedBefore,
    flaggedThisTurn: state.recomputeFlags.length > 0 || state.unitCheckHint !== undefined,
    openItems: state.openDataRequests.map(r => ({ ledgerItemId: r.ledgerItemId, label: r.label })),
    phase: ctx.currentPhase,
  };
}

// Timing, comparable with batches before streaming: modelDoneAt is when the
// model's last event arrived; distressWaitMs is how long the verdict
// outlasted the model (0 when it was in first).
type StreamTiming = { modelDoneAt: number; distressWaitMs: number };

export type StreamOutcome =
  | ({ kind: 'distress'; verdict: DistressVerdict } & StreamTiming)
  | ({
    kind: 'done';
    turn: ModelTurn;
    validation: TurnValidation | null;
    delivered: string[];              // spoken text delivered, in order
    deliveredRevealIds: string[];
    undeliveredRevealIds: string[];   // the sink rejected their segment (D3)
    firstSegmentMs: number | null;    // stream start → first delivered segment
    bufferSwitch: string | null;      // why delivery stopped, if it did
  } & StreamTiming);

type Pending = { kind: 'sentence'; text: string } | { kind: 'say_done' };

export async function streamTurnSegments(
  events: AsyncIterable<TurnEvent>,
  plan: ModelPlan,
  sink: SegmentSink,
  opts: { isDelivered: { value: boolean } },
): Promise<StreamOutcome> {
  const { state } = plan;
  const start = Date.now();
  let verdict: DistressVerdict | null | undefined; // undefined: not in yet
  let verdictAtMs: number | null = null;
  const verdictPromise = state.distress.then(v => { verdict = v; verdictAtMs = Date.now(); return v; });

  const g = gateContext(plan);
  let bufferSwitch: string | null = state.buffered ? `plan:${state.bufferReason ?? 'buffered'}` : null;
  let fields: Pick<ModelTurn, 'requests' | 'exhibit' | 'rescueItem'> = { requests: [], exhibit: null, rescueItem: null };
  let queue: Pending[] = [];
  const delivered: string[] = [];
  const deliveredRevealIds: string[] = [];
  const undeliveredRevealIds: string[] = [];
  const spokenKeys = new Set<string>();
  let firstSegmentMs: number | null = null;
  let turn: ModelTurn = NEUTRAL_TURN;
  let validation: TurnValidation | null = null;
  let modelDoneAt: number | null = null;

  const send = async (text: string, revealIds: string[], exhibitId?: string) => {
    try {
      await sink({ text, revealIds, exhibitId });
    } catch {
      undeliveredRevealIds.push(...revealIds);
      bufferSwitch ??= 'sink_rejected';
      return;
    }
    opts.isDelivered.value = true;
    firstSegmentMs ??= Date.now() - start;
    if (text) delivered.push(text);
    deliveredRevealIds.push(...revealIds);
  };

  const handle = async (p: Pending) => {
    if (bufferSwitch) return;
    if (p.kind === 'sentence') {
      const key = p.text.toLowerCase().replace(/\s+/g, ' ');
      if (spokenKeys.has(key)) { bufferSwitch = 'duplicate'; return; }
      spokenKeys.add(key);
      const reason = vetoReason(p.text, g);
      if (reason) { bufferSwitch = reason; return; }
      await send(p.text, []);
      return;
    }
    // "say" closed: code's data line.
    const d = turnData(plan, fields);
    const lines = renderDataLines(d, `${plan.ctx.sessionId}:${plan.ctx.nextTurnIndex}`);
    if (lines.length > 0 || d.exhibit) await send(lines.join(' '), d.releases.map(r => r.id), d.exhibit?.id);
  };
  const flushQueue = async () => {
    const q = queue;
    queue = [];
    for (const p of q) await handle(p);
  };

  for await (const e of events) {
    if (e.type === 'restart') {
      // A regeneration happens only while nothing was delivered: drop the draft.
      queue = [];
      spokenKeys.clear();
      fields = { requests: [], exhibit: null, rescueItem: null };
      continue;
    }
    if (e.type === 'done') { turn = e.turn; validation = e.validation; modelDoneAt = Date.now(); break; }
    let p: Pending | null = null;
    if (e.type === 'sentence') p = { kind: 'sentence', text: e.text };
    else if (e.key === 'requests') fields = { ...fields, requests: toRequests(e.value) };
    else if (e.key === 'exhibit') fields = { ...fields, exhibit: typeof e.value === 'string' ? e.value : null };
    else if (e.key === 'rescue_item') fields = { ...fields, rescueItem: typeof e.value === 'string' ? e.value : null };
    else if (e.key === 'say') p = { kind: 'say_done' };
    if (!p) continue;
    if (verdict === undefined) { queue.push(p); continue; } // D1: hold until the verdict
    if (isDistressVerdict(verdict)) continue;
    await flushQueue();
    await handle(p);
  }

  const doneAt = modelDoneAt ?? Date.now();
  const v = verdict === undefined ? await verdictPromise : verdict;
  const timing: StreamTiming = { modelDoneAt: doneAt, distressWaitMs: Math.max(0, (verdictAtMs ?? Date.now()) - doneAt) };
  if (isDistressVerdict(v)) return { kind: 'distress', verdict: v, ...timing };
  await flushQueue();
  return { kind: 'done', turn, validation, delivered, deliveredRevealIds, undeliveredRevealIds, firstSegmentMs, bufferSwitch, ...timing };
}
