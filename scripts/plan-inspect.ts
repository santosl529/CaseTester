// What today's production Plan gives a saved turn (read-only diagnostic,
// 7 Oct): rebuilds the five reads from a run record as they stood before the
// candidate's message, runs the real planTurn (no classifier call), and
// prints the per-turn prompt plus the hint state. Limits: session flags and
// coverage at that moment are not saved — flags start {} (the run's final
// recomputeAttempts / explainProbed are printed to show what they ended as),
// coverage null.
//
//   npx tsx scripts/plan-inspect.ts "<run dir>" <candidate turnIndex>

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { planTurn, type TurnReads } from '@/lib/orchestrator/plan-turn';
import { promptContextFor } from '@/lib/orchestrator/prompt-context';
import { buildPromptParts } from '@/lib/agent/prompts/system';

type Run = {
  session: Record<string, unknown> & { startedAt: string; flagsJsonb: Record<string, unknown> };
  turns: { turnIndex: number; role: string; text: string; timestampMs: number }[];
  events: { category: string; subtype: string; turnIndex: number | null; phase: string; payloadJsonb: Record<string, unknown> }[];
  revealed: { ledgerItemId: string; revealedAtMs: number }[];
  analytics: { eventType: string; createdAt: string; payloadJsonb: Record<string, unknown> }[];
};

const [dir, tArg] = process.argv.slice(2);
const T = Number(tArg);
const run = JSON.parse(readFileSync(path.join(dir, readdirSync(dir).find(f => f.endsWith('.json'))!), 'utf8')) as Run;
const cand = run.turns.find(t => t.turnIndex === T && t.role === 'candidate');
if (!cand) throw new Error(`no candidate turn ${T}`);
const phase = run.events.find(e => e.turnIndex === T && e.category === 'check')?.phase ?? String(run.session.phase);

const reads = {
  session: {
    ...run.session, phase, startedAt: new Date(run.session.startedAt), phaseStartedAt: new Date(run.session.startedAt),
    completedAt: null, status: 'active', flagsJsonb: {}, coverageJsonb: null,
  },
  turnRows: run.turns.filter(t => t.turnIndex < T).map(t => ({ ...t, sessionId: run.session.id, latencyMs: null })),
  exhibitRows: run.analytics.filter(a => a.eventType === 'exhibit_shown' && new Date(a.createdAt).getTime() < cand.timestampMs)
    .map(a => ({ sessionId: run.session.id, exhibitId: a.payloadJsonb.exhibitId as string, shownAtMs: new Date(a.createdAt).getTime() })),
  revealedRows: run.revealed.filter(r => r.revealedAtMs < cand.timestampMs).map(r => ({ ...r, sessionId: run.session.id })),
  dataRequestEventRows: run.events.filter(e => e.category === 'data_request' && (e.turnIndex ?? Infinity) < T)
    .map(e => ({ ...e, sessionId: run.session.id })),
} as unknown as TurnReads;

const now = cand.timestampMs;
const plan = planTurn(reads, cand.text, { sessionId: String(run.session.id), now, turnStartMs: now, later: () => {}, classify: false });
if (plan.kind === 'scripted') { console.log('SCRIPTED:', plan.interviewerText); process.exit(0); }
const st = plan.state;
console.log(`turn kind: ${st.kind} · phase ${plan.ctx.currentPhase}`);
console.log(`recompute flags: ${JSON.stringify(st.recomputeFlags)}`);
console.log(`verified now: ${JSON.stringify(st.verifiedNow.map(v => ({ value: v.value, stepId: v.stepId })))} · verified earlier: ${JSON.stringify(st.verifiedPrev.map(v => ({ value: v.value, stepId: v.stepId })))}`);
console.log(`unit-check hint: ${st.unitCheckHint ? 'YES' : 'none'} · stall: ${st.stallDecision.intervene ? `rung ${st.stallDecision.rung}` : 'none'} · coverage steer: ${st.coverageSteer ?? 'none'}`);
console.log(`final session flags — recomputeAttempts ${JSON.stringify(run.session.flagsJsonb.recomputeAttempts)} · explainProbed ${JSON.stringify(run.session.flagsJsonb.explainProbed)}`);
console.log('--- TURN PROMPT (case state) ---');
console.log(buildPromptParts(promptContextFor(plan)).turn);
