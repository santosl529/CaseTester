// lib/eval/scorecard.ts
// One row per interview (spec 2026-10-09 §2.3). "auto" columns only: faults
// from the pre-screen and the human review are joined later (faults.jsonl).
import type { TurnRecord } from '@/lib/orchestrator/turn-record';
import type { TurnFileHeader, TurnFileEnd } from './turn-file';
import { stageAdministration } from '@/lib/orchestrator/spoken-close';
import { isBareAcknowledgment } from '@/lib/orchestrator/stream-turn';
import { costOf, isPriced } from '@/lib/llm-pricing';

export const DIMENSIONS = ['structure', 'quantitative', 'dataExhibit', 'judgment', 'creativity', 'communication', 'synthesis', 'pushback'] as const;
export type Dimension = typeof DIMENSIONS[number];

export type RunRecord = {
  session: { id: string; status: string };
  turns: { turnIndex: number; role: string; text: string }[];
  score: Record<string, unknown> | null;
  events: { category: string; subtype: string; turnIndex: number | null; payloadJsonb: Record<string, unknown> }[];
  analytics: { eventType: string; payloadJsonb: Record<string, unknown> }[];
};

export type CodeFlag = {
  turnIndex: number | null;
  kind: 'question_withheld' | 'guard_double_miss' | 'model_unusable' | 'prefix_mismatch' | 'loop' | 'stage_skipped' | 'technical_failure' | 'slow_turn';
  detail: string;
};

export type ScorecardRow = {
  runId: string; personaId: number | null; personaName: string | null; runNumber: number | null; version: string | null; wave: string | null;
  completion: 'ended' | 'abandoned' | 'terminated' | 'not_completed' | 'technical_failure';
  stuck: boolean | null;
  modelTurns: number;
  stages: ReturnType<typeof stageAdministration>;
  stagesSource: 'end_gate' | 'transcript';
  loops: { maxSameQuestion: number; longestNoProgress: number | null };
  codeFlags: CodeFlag[];
  effort: { repeatedAsks: number };
  opportunities: { explicitAsks: number; ledgerItemsRequested: number; mathChecks: number; exhibitsShown: number; stallRungs: number; recAsks: number };
  performance: { firstRelevantMedianMs: number | null; firstRelevantP90Ms: number | null; regenerations: number | null; vetoTurns: number; slowTurns: number | null; unpricedUsageCalls: number; appCostUsd: number; simulatorCostUsd: number | null };
  scoring: string | null;
  ratings: Record<Dimension, string | null>;
  // The per-run scoring-QA counters (scoring_qa analytics event): verifier drops, evidence strips, reconcile merges, …
  scoringQa: Record<string, number> | null;
};

export const SLOW_TURN_MS = 5000;
const MIN_LOOP_TOKENS = 6;
const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const words = (q: string) => new Set(q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean));
const jaccard = (a: Set<string>, b: Set<string>) => { const inter = [...a].filter(x => b.has(x)).length; return inter / (a.size + b.size - inter || 1); };
const questionOf = (line: string) => line.split(/(?<=[.!?])\s+/).filter(s => s.trim().endsWith('?')).join(' ') || line;

export function maxSameQuestion(questions: string[]): number {
  // Very short questions ("What does that tell you?") are generic follow-ups, not loops.
  const sets = questions.filter(q => (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).length >= MIN_LOOP_TOKENS).map(words);
  return sets.reduce((best, s) => Math.max(best, sets.filter(t => jaccard(s, t) >= 0.8).length), 0);
}

export function firstRelevantMs(t: TurnRecord): number | null {
  const hit = t.delivered.find(s => (s.kind === 'say' && !isBareAcknowledgment(s.text)) || s.kind === 'data' || s.kind === 'tail' || s.kind === 'scripted');
  return hit ? hit.atMs : null;
}

function longestNoProgress(turns: TurnRecord[]): number {
  let run = 0, best = 0;
  for (const t of turns) {
    const progress = t.phaseAfter !== t.stateBefore.phase || t.delivered.some(s => s.revealIds.length > 0 || s.exhibitId);
    run = progress ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

export function scorecardRow(p: { runId: string; run: RunRecord; turnFile: { header: TurnFileHeader; turns: TurnRecord[]; end: TurnFileEnd | null } | null }): ScorecardRow {
  const { run, turnFile } = p;
  const records = turnFile?.turns ?? null;
  const interviewerTexts = run.turns.filter(t => t.role === 'interviewer').map(t => t.text);
  const lastGate = [...run.events].reverse().find(e => e.category === 'check' && e.subtype === 'end_gate');
  const recReceived = Boolean((lastGate?.payloadJsonb?.detail as { recommendationReceived?: boolean } | undefined)?.recommendationReceived);
  const gd = lastGate?.payloadJsonb?.detail as Record<string, unknown> | undefined;
  const fromGate = gd && typeof gd.brainstormAsked === 'boolean' && typeof gd.riskAsked === 'boolean' && typeof gd.recommendationAsked === 'boolean' && typeof gd.recommendationAskCount === 'number';
  const stages = fromGate
    ? { ...stageAdministration(interviewerTexts, Boolean(gd.recommendationReceived)), brainstormAsked: gd.brainstormAsked as boolean, riskAsked: gd.riskAsked as boolean, recommendationAsked: gd.recommendationAsked as boolean, recommendationAskCount: gd.recommendationAskCount as number }
    : stageAdministration(interviewerTexts, recReceived);
  const stagesSource: ScorecardRow['stagesSource'] = fromGate ? 'end_gate' : 'transcript';
  const flags: CodeFlag[] = [];

  const status = run.session.status;
  let completion: ScorecardRow['completion'] =
    status === 'completed' ? 'ended' : status === 'abandoned' ? 'abandoned' : status === 'terminated' ? 'terminated' : 'not_completed';
  if (turnFile && turnFile.end === null) {
    completion = 'technical_failure';
    flags.push({ turnIndex: null, kind: 'technical_failure', detail: 'turn file has no end line — the run died' });
  }

  const questions = (records ? records.map(r => r.savedLine) : interviewerTexts.slice(1)).map(questionOf);
  const maxSame = maxSameQuestion(questions);
  if (maxSame >= 3) flags.push({ turnIndex: null, kind: 'loop', detail: `same question asked ${maxSame} times` });
  const noProgress = records ? longestNoProgress(records) : null;
  if (completion === 'ended' && (!stages.brainstormAsked || !stages.recommendationAsked)) {
    flags.push({ turnIndex: null, kind: 'stage_skipped', detail: `brainstorm asked: ${stages.brainstormAsked}, recommendation asked: ${stages.recommendationAsked}` });
  }

  for (const r of records ?? []) {
    const acted = (name: string) => r.checks.find(c => c.check === name && c.decision === 'act');
    const vetoes = acted('vetoes');
    const withheld = (vetoes?.detail as { withheld?: { field: string }[] } | undefined)?.withheld ?? [];
    if (withheld.some(w => w.field === 'question') && /Go on\.$/.test(r.savedLine)) flags.push({ turnIndex: r.turnIndex, kind: 'question_withheld', detail: 'whole question withheld — fallback "Go on."' });
    if (acted('request_guard') && (r.parsedTurn?.requests.length ?? 0) === 0) flags.push({ turnIndex: r.turnIndex, kind: 'guard_double_miss', detail: 'explicit ask; no request declared after the guard rewrite' });
    if (r.validation && (r.validation.unparsed || r.validation.emptyTurn || r.validation.refused)) flags.push({ turnIndex: r.turnIndex, kind: 'model_unusable', detail: JSON.stringify(r.validation) });
    if (acted('stream_prefix_mismatch')) flags.push({ turnIndex: r.turnIndex, kind: 'prefix_mismatch', detail: 'composed turn differed from delivered speech' });
    const rel = firstRelevantMs(r);
    if (rel !== null && rel > SLOW_TURN_MS) flags.push({ turnIndex: r.turnIndex, kind: 'slow_turn', detail: `${rel} ms to first relevant speech` });
  }

  const dr = run.events.filter(e => e.category === 'data_request' && e.payloadJsonb.explicit === true);
  const askTurns = new Map<string, Set<number>>();
  for (const e of dr) {
    if (e.payloadJsonb.revealedByNow) continue;
    for (const id of (e.payloadJsonb.ledgerItemIds as string[] | undefined) ?? []) {
      const s = askTurns.get(id) ?? new Set<number>(); if (e.turnIndex !== null) s.add(e.turnIndex); askTurns.set(id, s);
    }
  }
  const actedCheck = (sub: string) => run.events.filter(e => e.category === 'check' && e.subtype === sub && e.payloadJsonb.decision === 'act');
  const mathTurns = new Set([...actedCheck('recompute'), ...actedCheck('verified_figures')].map(e => e.turnIndex));
  const usage = run.analytics.filter(a => a.eventType === 'llm_usage');
  const unpricedUsageCalls = usage.filter(a => !isPriced(String(a.payloadJsonb.model ?? ''))).length;
  const appCostUsd = usage.filter(a => isPriced(String(a.payloadJsonb.model ?? '')))
    .reduce((s, a) => s + costOf({ model: String(a.payloadJsonb.model), inputTokens: Number(a.payloadJsonb.inputTokens ?? 0), outputTokens: Number(a.payloadJsonb.outputTokens ?? 0), cacheReadTokens: Number(a.payloadJsonb.cacheReadTokens ?? 0), cacheWriteTokens: Number(a.payloadJsonb.cacheWriteTokens ?? 0) }), 0);
  const rel = (records ?? []).map(firstRelevantMs).filter((x): x is number => x !== null);
  const ratings = Object.fromEntries(DIMENSIONS.map(d => [d, (run.score?.[`${d}Rating`] as string | null | undefined) ?? null])) as Record<Dimension, string | null>;
  const scoringComplete = run.analytics.find(a => a.eventType === 'scoring_complete');

  return {
    runId: p.runId,
    personaId: turnFile?.header.persona?.id ?? null, personaName: turnFile?.header.persona?.name ?? null,
    runNumber: turnFile?.header.runNumber ?? null, version: turnFile?.header.version ?? null, wave: turnFile?.header.wave ?? null,
    completion,
    stuck: records ? maxSame >= 3 || (noProgress ?? 0) >= 4 : null,
    modelTurns: records?.length ?? run.turns.filter(t => t.role === 'candidate').length,
    stages,
    stagesSource,
    loops: { maxSameQuestion: maxSame, longestNoProgress: noProgress },
    codeFlags: flags,
    effort: { repeatedAsks: [...askTurns.values()].filter(s => s.size >= 2).length },
    opportunities: {
      explicitAsks: run.events.filter(e => e.category === 'request_signal' && e.subtype === 'explicit_ask').length,
      ledgerItemsRequested: askTurns.size + dr.filter(e => e.payloadJsonb.revealedByNow).flatMap(e => (e.payloadJsonb.ledgerItemIds as string[]) ?? []).filter(id => !askTurns.has(id)).length,
      mathChecks: mathTurns.size,
      exhibitsShown: run.analytics.filter(a => a.eventType === 'exhibit_shown').length,
      stallRungs: actedCheck('rung_delivery').filter(e => e.payloadJsonb.reason === 'rung delivered').length,
      recAsks: stages.recommendationAskCount,
    },
    performance: {
      firstRelevantMedianMs: records ? pct(rel, 0.5) : null, firstRelevantP90Ms: records ? pct(rel, 0.9) : null,
      regenerations: records ? records.filter(r => r.requests.length > 1).length : null,
      vetoTurns: actedCheck('vetoes').length,
      slowTurns: records ? rel.filter(x => x > SLOW_TURN_MS).length : null,
      unpricedUsageCalls, appCostUsd, simulatorCostUsd: turnFile?.end?.candidateUsage.usd ?? null,
    },
    scoring: turnFile?.end?.scoring ?? (scoringComplete ? 'scored' : null),
    ratings,
    scoringQa: (() => {
      const q = run.analytics.find(a => a.eventType === 'scoring_qa')?.payloadJsonb;
      return q ? Object.fromEntries(Object.entries(q).filter(([, v]) => typeof v === 'number')) as Record<string, number> : null;
    })(),
  };
}
