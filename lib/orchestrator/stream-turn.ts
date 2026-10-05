// The Stream stage (spec 2026-10-05-streaming-turn §4.3). Pass or buffer: a
// sentence is delivered only if every gate leaves it unchanged; the first one
// a gate would change (or a cue that a whole-turn replacement may follow)
// sends the rest of the turn to Settle, which runs today's full pipeline and
// delivers what follows the delivered prefix (settle-turn.ts). Nothing is
// delivered before the distress verdict (D1); a trailing question is held to
// the end of the stream (D4) so end-of-turn inserts can still go before it.
// Stream never books a reveal: it reads values from a copy of the ledger, and
// Settle books what was delivered (D3).
import type { Action } from './actions';
import type { TurnEvent } from '@/lib/agent/models/interface';
import type { ModelPlan } from './plan-turn';
import type { Segment, SegmentSink } from './turn-types';
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
import { hasCloseCue, alreadySignaledTimeOrRec } from '@/lib/agent/prompts/scripts';
import { canReveal, reveal, revealedValues, type DataLedger } from './data-ledger';

export type GateContext = {
  allowedTexts: string[];
  verified: VerifiedFigure[];
  alreadyProbed: Set<string>;
  flaggedThisTurn: boolean;
  openItems: OpenRequestItem[];
  phase: Phase;
};

export type GateVerdict = { pass: true } | { pass: false; reason: string };

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

// The post-turn guards, asked of one sentence: would any of them change it,
// or is it a cue that a whole-turn replacement may follow?
export function gateSentence(sentence: string, g: GateContext): GateVerdict {
  if (stripFabricatedTurn(sentence).fabricated !== null) return { pass: false, reason: 'fabricated_turn' };
  if (stripMetaLeak(sentence).strippedSentences.length > 0) return { pass: false, reason: 'meta_leak' };
  if (rewriteSystemLanguage(sentence).rewrites.length > 0) return { pass: false, reason: 'system_language' };
  if (stripCopiedCheckIn(sentence).stripped) return { pass: false, reason: 'copied_check_in' };
  if (enforceNumericProvenance(sentence, g.allowedTexts).blocked) return { pass: false, reason: 'provenance' };
  const probe = withholdProbesOnVerified(sentence, { verified: g.verified, alreadyProbed: g.alreadyProbed, flaggedThisTurn: g.flaggedThisTurn });
  if (probe.withheld.length > 0 || probe.explainProbed.length > 0 || !same(probe.text, sentence)) return { pass: false, reason: 'probe_guard' };
  if (withholdAssumptionChallenges(sentence, g.openItems).withheld.length > 0) return { pass: false, reason: 'assumption_guard' };
  if (hasCloseCue(sentence) || isClosingTurn(sentence)) return { pass: false, reason: 'close_cue' };
  if (alreadySignaledTimeOrRec(sentence)) return { pass: false, reason: 'time_or_rec_cue' };
  if (g.phase === 'BRAINSTORM' && suppliesRecommendation(sentence)) return { pass: false, reason: 'synthesis' };
  return { pass: true };
}

// Timing, comparable with batches before streaming: modelDoneAt is when the
// model's last event arrived; distressWaitMs is how long the verdict
// outlasted the model (0 when it was in first).
type StreamTiming = { modelDoneAt: number; distressWaitMs: number };

export type StreamOutcome =
  | ({ kind: 'distress'; verdict: DistressVerdict } & StreamTiming)
  | ({
    kind: 'done';
    actions: Action[];
    delivered: string[];              // spoken text delivered, in order (sentences and reveal wordings)
    deliveredRevealIds: string[];
    undeliveredRevealIds: string[];   // the sink rejected their segment (D3)
    firstSegmentMs: number | null;    // stream start → first delivered segment
    bufferSwitch: string | null;      // why delivery stopped, if it did
  } & StreamTiming);

type Pending =
  | { kind: 'sentence'; text: string }
  | { kind: 'reveal'; id: string; text: string }
  | { kind: 'exhibit'; id: string }
  | { kind: 'stop'; reason: string }; // nothing after this point is delivered

export async function streamTurnSegments(
  events: AsyncIterable<TurnEvent>,
  plan: ModelPlan,
  sink: SegmentSink,
  opts: { isDelivered: { value: boolean } },
): Promise<StreamOutcome> {
  const { ctx, state } = plan;
  const start = Date.now();
  let verdict: DistressVerdict | null | undefined; // undefined: not in yet
  let verdictAtMs: number | null = null;
  const verdictPromise = state.distress.then(v => { verdict = v; verdictAtMs = Date.now(); return v; });

  const ledger: DataLedger = { items: state.ledger.items, revealed: new Set(state.ledger.revealed) };
  const base: GateContext = {
    allowedTexts: [
      state.caseData.prompt,
      ...state.turnRows.filter(t => t.role === 'candidate').map(t => t.text),
      ctx.candidateText,
      ...state.derivedValueTexts,
    ],
    verified: [...state.verifiedNow, ...state.verifiedPrev],
    alreadyProbed: state.explainProbedBefore,
    flaggedThisTurn: state.recomputeFlags.length > 0 || state.unitCheckHint !== undefined,
    openItems: state.openDataRequests.map(r => ({ ledgerItemId: r.ledgerItemId, label: r.label })),
    phase: ctx.currentPhase,
  };

  let bufferSwitch: string | null = state.buffered ? `plan:${state.bufferReason ?? 'late'}` : null;
  let queue: Pending[] = [];          // waiting for the distress verdict (D1)
  let heldQuestions: string[] = [];   // trailing questions (D4) — Settle sends them with the tail
  const delivered: string[] = [];
  const deliveredRevealIds: string[] = [];
  const undeliveredRevealIds: string[] = [];
  let firstSegmentMs: number | null = null;
  let actions: Action[] = [];
  let modelDoneAt: number | null = null;
  const spokenKeys = new Set<string>();

  const send = async (seg: Segment) => {
    try {
      await sink(seg);
    } catch {
      undeliveredRevealIds.push(...seg.revealIds);
      bufferSwitch ??= 'sink_rejected';
      return;
    }
    opts.isDelivered.value = true;
    firstSegmentMs ??= Date.now() - start;
    if (seg.text) delivered.push(seg.text);
    deliveredRevealIds.push(...seg.revealIds);
  };
  const releaseQuestions = async () => {
    const qs = heldQuestions;
    heldQuestions = [];
    for (const q of qs) await send({ text: q, revealIds: [] });
  };
  const handle = async (p: Pending) => {
    if (bufferSwitch) return;
    if (p.kind === 'stop') { bufferSwitch = p.reason; return; }
    if (p.kind === 'sentence') {
      // normalizeActions drops a repeated line; a repeat must not be spoken twice.
      const key = p.text.toLowerCase().replace(/\s+/g, ' ');
      if (spokenKeys.has(key)) { bufferSwitch = 'duplicate'; return; }
      spokenKeys.add(key);
      const revealed = Object.values(revealedValues(ledger));
      const v = gateSentence(p.text, { ...base, allowedTexts: [...base.allowedTexts, ...revealed, ...changeFigures(revealed)] });
      if (!v.pass) { bufferSwitch = v.reason; return; }
      if (p.text.trim().endsWith('?')) { heldQuestions.push(p.text); return; }
      await releaseQuestions();
      await send({ text: p.text, revealIds: [] });
    } else if (p.kind === 'reveal') {
      await releaseQuestions();
      await send({ text: p.text, revealIds: [p.id] });
    } else {
      await send({ text: '', revealIds: [], exhibitId: p.id });
    }
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
      heldQuestions = [];
      spokenKeys.clear();
      ledger.revealed = new Set(state.ledger.revealed);
      continue;
    }
    if (e.type === 'done') { actions = e.actions; modelDoneAt = Date.now(); break; }
    let p: Pending | null = null;
    if (e.type === 'stop') {
      p = { kind: 'stop', reason: e.reason };
    } else if (e.type === 'sentence') {
      p = { kind: 'sentence', text: e.text };
    } else if (e.action.type === 'reveal_data') {
      // The approved wording, read from the copy; Settle books the real ledger.
      if (canReveal(ledger, e.action.itemId)) p = { kind: 'reveal', id: e.action.itemId, text: reveal(ledger, e.action.itemId) };
    } else if (e.action.type === 'show_exhibit') {
      p = { kind: 'exhibit', id: e.action.exhibitId };
    } else if (e.action.type === 'end_case') {
      p = { kind: 'stop', reason: 'end_case' };
    }
    if (!p) continue;
    if (verdict === undefined) { queue.push(p); continue; }
    if (isDistressVerdict(verdict)) continue;
    await flushQueue();
    await handle(p);
  }

  const doneAt = modelDoneAt ?? Date.now();
  const v = verdict === undefined ? await verdictPromise : verdict;
  const timing: StreamTiming = { modelDoneAt: doneAt, distressWaitMs: Math.max(0, (verdictAtMs ?? Date.now()) - doneAt) };
  if (isDistressVerdict(v)) return { kind: 'distress', verdict: v, ...timing };
  await flushQueue();
  return { kind: 'done', actions, delivered, deliveredRevealIds, undeliveredRevealIds, firstSegmentMs, bufferSwitch, ...timing };
}
