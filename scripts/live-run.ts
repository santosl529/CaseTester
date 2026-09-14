// Live end-to-end run of the text product against real models and the real
// database. A simulated candidate (Claude) plays the case; the real
// orchestrator runs every turn, the turn route's background passes run the way
// after() schedules them (fired, not awaited, so they lag a turn), then the
// real scoring pipeline scores the session. Saves the transcript, feedback,
// Rule 11 audit rows, and scoring-QA metrics to "Case Interview Runs/".
//
//   npx tsx --env-file=.env.local scripts/live-run.ts [caseId]
//
// Costs real money: interviewer + judge + verifier + reconciliation on Opus,
// classifier + coverage on Haiku, candidate simulator on Opus 5. Writes a real
// session owned by the most recent session's user.

import Anthropic from '@anthropic-ai/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, sessionTurns, sessionEvents, scores, analyticsEvents, revealedData } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { startSession } from '@/lib/orchestrator/start-session';
import { runTurn } from '@/lib/orchestrator/session-runner';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { scoreSession } from '@/lib/scoring/score-session';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';
import { renderReportPdf } from '@/app/api/report/[sessionId]/pdf/render';

const CANDIDATE_MODEL = 'claude-opus-5';
const MAX_TURNS = 30;
const MAX_WALL_MS = 10 * 60_000; // the case clock is 5 minutes; this only guards a hang
const OUT_DIR = path.resolve('Case Interview Runs');

// The simulator must not know the answer — it sees only the transcript. The
// data-request guidance exercises Rule 11 paths (release / refuse / defer /
// ignore) without scripting what the candidate concludes.
const CANDIDATE_SYSTEM = `You are a college junior recruiting for management consulting, doing a text-based mock case interview. You are solid but not polished: you know profitability frameworks, you do math out loud, and you occasionally make small slips.

How you behave:
- Reply only as the candidate, in plain typed text, usually 60–180 words. No markdown headers.
- You don't know the answer. Reason only from what the interviewer has actually told you.
- When you need a number, ask for it explicitly ("Do we have data on X?"). In a profitability case you'd naturally want things like the cost breakdown, what's inside the biggest cost line, whether menu prices changed, ticket size, and volume.
- If a data request goes unanswered, don't nag — state the assumption you're making and keep going, like a real candidate would.
- Show your math when you compute something.
- When asked for a recommendation, give one: answer first, then the supporting points, risks, and next steps.`;

type Line = { role: 'interviewer' | 'candidate'; text: string };

async function candidateReply(client: Anthropic, transcript: Line[]): Promise<string> {
  const response = await client.beta.messages.create({
    model: CANDIDATE_MODEL,
    max_tokens: 4096,
    system: CANDIDATE_SYSTEM,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-06-01'],
    fallbacks: [{ model: 'claude-opus-4-8' }],
    messages: transcript.map(l => ({ role: l.role === 'interviewer' ? 'user' : 'assistant', content: l.text })),
  });
  if (response.stop_reason === 'refusal') throw new Error('candidate simulator refused');
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('candidate simulator returned no text');
  return text;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function main() {
  const caseId = process.argv[2] ?? 'prof-001';
  const caseData = getCaseById(caseId);

  const owner = await db.query.sessions.findFirst({ orderBy: [desc(sessions.startedAt)] });
  if (!owner) throw new Error('No existing session to borrow a user id from — start one through the app first.');
  const userId = owner.userId;

  const client = new Anthropic();
  const { sessionId, openingText } = await startSession(userId, caseId);
  console.log(`[live-run] session ${sessionId} · ${caseData.title}`);
  console.log(`\n[interviewer · INTRO] ${openingText}`);

  const transcript: Line[] = [{ role: 'interviewer', text: openingText }];
  const background: Promise<unknown>[] = [];
  const startedAt = Date.now();
  let phase: Phase = 'INTRO';
  let ended = false;

  for (let turn = 0; turn < MAX_TURNS && Date.now() - startedAt < MAX_WALL_MS; turn++) {
    const candidateText = await candidateReply(client, transcript);
    transcript.push({ role: 'candidate', text: candidateText });
    console.log(`\n[candidate · ${clock(Date.now() - startedAt)}] ${candidateText}`);

    const phaseBeforeTurn = phase;
    const result = await runTurn(sessionId, candidateText);
    transcript.push({ role: 'interviewer', text: result.interviewerText });
    console.log(`\n[interviewer · ${result.phase} · ${clock(Date.now() - startedAt)}] ${result.interviewerText}`);
    phase = result.phase;

    background.push(runPostTurnBackground({ sessionId, userId, caseId, phase: phaseBeforeTurn, result }));
    if (result.ended) {
      ended = true;
      break;
    }
    if (!result.interviewerText) throw new Error('interviewer returned an empty turn');
  }
  await Promise.allSettled(background);

  const scoring = ended ? await scoreSession({ sessionId, userId }) : { status: 'not_completed' as const };
  console.log(`\n[live-run] ended=${ended} scoring=${scoring.status}`);

  await writeArtifacts(sessionId, caseData.title);
}

async function writeArtifacts(sessionId: string, caseTitle: string) {
  const session = (await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) }))!;
  const turns = await db.query.sessionTurns.findMany({
    where: eq(sessionTurns.sessionId, sessionId),
    orderBy: (t, { asc }) => [asc(t.turnIndex)],
  });
  const score = await db.query.scores.findFirst({ where: eq(scores.sessionId, sessionId) });
  const events = await db.query.sessionEvents.findMany({
    where: and(eq(sessionEvents.sessionId, sessionId)),
    orderBy: (e, { asc }) => [asc(e.createdAt)],
  });
  const analytics = await db.query.analyticsEvents.findMany({
    where: eq(analyticsEvents.sessionId, sessionId),
    orderBy: (e, { asc }) => [asc(e.createdAt)],
  });
  const revealed = await db.query.revealedData.findMany({ where: eq(revealedData.sessionId, sessionId) });

  const startMs = session.startedAt.getTime();
  const dataRequests = events.filter(e => e.category === 'data_request' && e.subtype !== 'classified');
  const interventions = events.filter(e => e.category === 'intervention');
  const scoringQa = analytics.find(a => a.eventType === 'scoring_qa')?.payloadJsonb as Record<string, unknown> | undefined;
  const forced = analytics.filter(a => a.eventType === 'data_force_released').map(a => a.payloadJsonb);
  const usage = new Map<string, { calls: number; input: number; output: number }>();
  for (const a of analytics.filter(x => x.eventType === 'llm_usage')) {
    const p = a.payloadJsonb as { component?: string; inputTokens?: number; outputTokens?: number; apiCalls?: number };
    const key = p.component ?? 'unknown';
    const u = usage.get(key) ?? { calls: 0, input: 0, output: 0 };
    u.calls += p.apiCalls ?? 1;
    u.input += p.inputTokens ?? 0;
    u.output += p.outputTokens ?? 0;
    usage.set(key, u);
  }

  const date = new Date().toISOString().slice(0, 10);
  const base = `live-run-${date}-${sessionId.slice(0, 8)}`;
  await mkdir(OUT_DIR, { recursive: true });

  const md: string[] = [];
  md.push(`# Live run — ${caseTitle}`, '');
  md.push(`- Session: \`${sessionId}\` · case \`${session.caseId}\` · status **${session.status}** · ${date}`);
  md.push(`- Overall: **${score?.overallRating ?? 'not scored'}**`);
  md.push(`- Candidate simulator: \`${CANDIDATE_MODEL}\` (sees only the transcript)`, '');

  md.push('## Rule 11 / v4.1 checks', '');
  md.push(`- Ledger items revealed: ${revealed.map(r => `\`${r.ledgerItemId}\``).join(', ') || 'none'}`);
  md.push(`- Force-released before the recommendation ask: ${forced.length ? '`' + JSON.stringify(forced) + '`' : 'none'}`);
  md.push(`- Scoring QA: \`${JSON.stringify(scoringQa ?? {})}\``);
  md.push(`- Assists / interventions: ${interventions.map(i => `${i.subtype}@${i.turnIndex}`).join(', ') || 'none'}`, '');
  md.push('| Candidate turn | Response | Ledger item | Asked for | Revealed by then |', '|---|---|---|---|---|');
  for (const r of dataRequests) {
    const p = r.payloadJsonb as { what?: string; ledgerItemId?: string | null; revealedByNow?: boolean };
    md.push(`| ${r.turnIndex} | ${r.subtype} | ${p.ledgerItemId ?? '—'} | ${(p.what ?? '').replace(/\|/g, '/')} | ${p.revealedByNow ? 'yes' : 'no'} |`);
  }
  md.push('');

  md.push('## LLM usage', '', '| Component | Calls | Input tokens | Output tokens |', '|---|---|---|---|');
  for (const [k, u] of usage) md.push(`| ${k} | ${u.calls} | ${u.input} | ${u.output} |`);
  md.push('');

  if (score) {
    const rubric = score.rubricJsonb as RubricScores;
    md.push('## Feedback', '', `**Top improvement:** ${rubric.topFix}`, '');
    for (const key of RUBRIC_DIMENSION_KEYS) {
      const d = rubric[key];
      md.push(`### ${RUBRIC_DIMENSION_LABELS[key]} — ${d.rating}`);
      if (d.coverageCaveat) md.push(`_Coverage caveat: ${d.coverageCaveat}_`);
      for (const w of d.wentWell) md.push(`- ✅ ${w.point}${w.quotes.map(q => `\n  > ${q}`).join('')}`);
      for (const n of d.needsWork) md.push(`- ⚠️ ${n.point}${n.quotes.map(q => `\n  > ${q}`).join('')}`);
      for (const m of d.missedOpportunities) md.push(`- 💡 ${m.moment}\n  > Better: ${m.betterResponse}`);
      md.push('');
    }
  }

  md.push('## Transcript', '');
  for (const t of turns) {
    md.push(`**${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'} · ${clock(t.timestampMs - startMs)}** (turn ${t.turnIndex})`, '', t.text, '');
  }

  await writeFile(path.join(OUT_DIR, `${base}.md`), md.join('\n'));
  await writeFile(path.join(OUT_DIR, `${base}.json`), JSON.stringify({ session, turns, score, events, analytics, revealed }, null, 2));
  const pdf = score ? await renderReportPdf(sessionId) : null;
  if (pdf) await writeFile(path.join(OUT_DIR, `${base}.pdf`), pdf.buffer);

  console.log(`[live-run] wrote ${path.join(OUT_DIR, base)}.{md,json${pdf ? ',pdf' : ''}}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[live-run] failed:', err);
    process.exit(1);
  });
