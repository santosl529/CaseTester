// Live end-to-end run of the text product against real models and the real
// database. A simulated candidate (Claude) plays the case; the real
// orchestrator runs every turn, the turn route's background passes run the way
// after() schedules them (fired, not awaited, so they lag a turn), then the
// real scoring pipeline scores the session. Saves the transcript, feedback,
// Rule 11 audit rows, and scoring-QA metrics to "Case Interview Runs/" — a
// persona run under test runs/<batch>/<NN-name>/, the default candidate under
// default-candidate/.
//
//   npx tsx --env-file=.env.local scripts/live-run.ts [caseId] [--persona=N --batch=NAME] [--pace=human] [--wpm=90] [--think-ms=8000]
//
// --persona=N plays pressure-test persona N (scripts/personas.ts) instead of
// the default solid-but-unpolished candidate. --batch names the test-runs
// folder the run belongs to (e.g. batch-3-oct-02); required with --persona.
//
// --pace=human paces the candidate like a person (think + type time before each
// message). Without it the simulator answers in seconds and the case finishes
// long before the clock matters. A persona can also ask for an explicit silence
// by starting a reply with [pause Ns]; the tag is stripped and the harness
// waits N seconds (≤600) before sending, in either pacing mode. During the
// pause the harness plays the channel's idle timer: it reports the silence to
// runSilence at the check-in, pause, and pause-expiry thresholds (lib/orchestrator/silence.ts),
// and the scripted check-in / pause line joins the candidate's transcript.
// Typing time is not silence, so --pace=human typing delay comes after.
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
import { summarizeCheckEvents } from '@/lib/orchestrator/check-log';
import { getCaseById } from '@/lib/cases/loader';
import { startSession } from '@/lib/orchestrator/start-session';
import { runTurn, runSilence, type ExhibitDisplay } from '@/lib/orchestrator/session-runner';
import { SILENCE_CHECK_IN_MS, SILENCE_PAUSE_MS, SILENCE_PAUSE_MAX_MS } from '@/lib/orchestrator/silence';
import { runPostTurnBackground } from '@/lib/orchestrator/post-turn';
import type { Phase } from '@/lib/orchestrator/state-machine';
import { scoreSession } from '@/lib/scoring/score-session';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS } from '@/lib/scoring/rubric';
import type { RubricScores } from '@/lib/scoring/judge';
import { renderReportPdf } from '@/app/api/report/[sessionId]/pdf/render';
import { getPersona, type Persona } from './personas';

const CANDIDATE_MODEL = 'claude-opus-5';
const MAX_TURNS = 60; // human pacing on a 20-minute clock can exceed 30 turns
const MAX_WALL_MS = 30 * 60_000; // the case clock is 20 minutes; this only guards a hang
const RUNS_DIR = path.resolve('Case Interview Runs');

// Human pacing. The simulator replies in ~7s, so fast runs finish every stage
// long before the clock: the time warning, the time-up close, Rule 15 load
// shedding, and the time-warning force-release path never run. --pace=human
// waits before each candidate message for reading/thinking plus typing at a
// chat-typing speed, capped per turn so one long answer can't eat the clock.
const flag = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const PACE: 'human' | 'fast' = flag('pace') === 'human' ? 'human' : 'fast';
const WPM = Number(flag('wpm') ?? 90);
const THINK_MS = Number(flag('think-ms') ?? 8000);
const MAX_TURN_DELAY_MS = 90_000;
const MAX_PAUSE_MS = 600_000;
const PERSONA: Persona | null = flag('persona') ? getPersona(Number(flag('persona'))) : null;

const BATCH = flag('batch');
if (PERSONA && !BATCH) throw new Error('--persona runs need --batch=NAME (the "test runs/" subfolder)');

// "Maya — the Freezer" (id 1) → test runs/<batch>/01-maya-the-freezer
const OUT_DIR = PERSONA
  ? path.join(RUNS_DIR, 'test runs', BATCH!, `${String(PERSONA.id).padStart(2, '0')}-${PERSONA.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`)
  : path.join(RUNS_DIR, 'default-candidate');

function humanDelayMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(MAX_TURN_DELAY_MS, THINK_MS + (words / WPM) * 60_000);
}

// A [pause Ns] tag is a silence the persona wants before this message. The
// prompt says to lead with it, but the simulator also writes it mid-message
// (run ec32a47f sent "[pause 200s]" to the interviewer verbatim), so take it
// from anywhere, strip every tag, and wait the longest one.
const PAUSE_TAG = /\[pause\s+(\d+)\s*s?\]/gi;
function takePause(text: string): { text: string; pauseMs: number } {
  const seconds = [...text.matchAll(PAUSE_TAG)].map(m => Number(m[1]));
  if (seconds.length === 0) return { text, pauseMs: 0 };
  const stripped = text.replace(PAUSE_TAG, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: stripped, pauseMs: Math.min(MAX_PAUSE_MS, Math.max(...seconds) * 1000) };
}

// Everything the run prints — including the orchestrator's per-turn phase and
// stall-rung lines, which the report files don't carry — saved as <base>.log.
const logLines: string[] = [];
for (const level of ['log', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    logLines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    original(...args);
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

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

// A persona replaces the default character. Its brief overrides the defaults
// above where they conflict (a candidate who never asks for data, freezes at
// the recommendation, etc.). The standing data-request requirement comes from
// the persona PDF: every run should exercise the non-response catch.
function personaSystem(persona: Persona): string {
  return `${CANDIDATE_SYSTEM}

You are playing a specific candidate for a pressure test of the interviewer. Stay in character for the whole case; where the character below conflicts with the defaults above, play the character.

Your character: ${persona.brief}

Also, unless your character never asks for data or never attempts the case: at some point, ask for one piece of data a profitability case like this would plausibly hold but that an interviewer might skip past (e.g. menu-price history, transaction volume, or a split of the biggest cost line), then keep going without pressing if it goes unanswered.

Silences: if your character would go quiet before answering, the very first characters of that reply must be [pause Ns] (N in seconds, at most 600) — never in the middle or at the end. A silence always happens before a message is sent, so if your character drops out mid-thought, send what they had, and put the pause at the start of the reply where they come back. The tag is stripped before sending; the interviewer only experiences the wait. Do not otherwise mention the pause.`;
}

type Line = { role: 'interviewer' | 'candidate'; text: string };

// The simulator's own spend, which the app's llm_usage events don't see —
// reported beside them so a run's cost is complete.
const candidateUsage = { calls: 0, input: 0, output: 0, models: new Set<string>() };

async function candidateReply(client: Anthropic, transcript: Line[]): Promise<string> {
  const response = await client.beta.messages.create({
    model: CANDIDATE_MODEL,
    max_tokens: 4096,
    system: PERSONA ? personaSystem(PERSONA) : CANDIDATE_SYSTEM,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-06-01'],
    fallbacks: [{ model: 'claude-opus-4-8' }],
    messages: transcript.map(l => ({ role: l.role === 'interviewer' ? 'user' : 'assistant', content: l.text })),
  });
  candidateUsage.calls += 1;
  candidateUsage.input += response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
  candidateUsage.output += response.usage.output_tokens;
  candidateUsage.models.add(response.model);
  if (response.stop_reason === 'refusal') throw new Error('candidate simulator refused');
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('candidate simulator returned no text');
  return text;
}

// The app renders exhibits in a panel beside the chat; a text-only simulated
// candidate sees none of it, so hand it the same data as a plain table. Run
// 58cb8061 lost three turns to "nothing is coming through" without this.
function exhibitAsText(exhibit: ExhibitDisplay): string {
  const columns = [...new Set(exhibit.data.flatMap(row => Object.keys(row)))];
  const rows = exhibit.data.map(row => columns.map(c => String(row[c] ?? '')).join(' | '));
  return `[Exhibit shown: ${exhibit.title}]\n${columns.join(' | ')}\n${rows.join('\n')}`;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function main() {
  const caseId = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'prof-001';
  const caseData = getCaseById(caseId);

  const owner = await db.query.sessions.findFirst({ orderBy: [desc(sessions.startedAt)] });
  if (!owner) throw new Error('No existing session to borrow a user id from — start one through the app first.');
  const userId = owner.userId;

  const client = new Anthropic();
  const { sessionId, openingText } = await startSession(userId, caseId);
  console.log(`[live-run] session ${sessionId} · ${caseData.title}${PERSONA ? ` · persona ${PERSONA.id} ${PERSONA.name}` : ''} · pace ${PACE}`);
  console.log(`\n[interviewer · INTRO] ${openingText}`);

  const transcript: Line[] = [{ role: 'interviewer', text: openingText }];
  const background: Promise<unknown>[] = [];
  const startedAt = Date.now();
  let phase: Phase = 'INTRO';
  let ended = false;

  for (let turn = 0; turn < MAX_TURNS && Date.now() - startedAt < MAX_WALL_MS; turn++) {
    // The interviewer's turn just landed: the candidate's silence starts now.
    const replyStartedAt = Date.now();
    const { text: candidateText, pauseMs } = takePause(await candidateReply(client, transcript));
    if (pauseMs) console.log(`\n[candidate silent ${pauseMs / 1000}s]`);
    let abandoned = false;
    for (const threshold of [SILENCE_CHECK_IN_MS, SILENCE_PAUSE_MS, SILENCE_PAUSE_MS + SILENCE_PAUSE_MAX_MS]) {
      if (pauseMs < threshold) break;
      // Report the silence actually measured, a beat past the threshold: the
      // server bounds it by its own clock, and an exact-threshold report lost
      // the 180s pause to millisecond jitter (run 88288c97).
      await sleep(replyStartedAt + threshold + 1000 - Date.now());
      const silence = await runSilence(sessionId, Date.now() - replyStartedAt);
      if (silence.interviewerText) {
        transcript.push({ role: 'interviewer', text: silence.interviewerText });
        console.log(`\n[interviewer · ${silence.action} · ${clock(Date.now() - startedAt)}] ${silence.interviewerText}`);
      }
      if (silence.ended) {
        abandoned = true;
        break;
      }
    }
    if (abandoned) break; // expired pause: session abandoned, unscored
    // The simulator's own latency counts toward the pause and the think + type time.
    await sleep(replyStartedAt + pauseMs + (PACE === 'human' ? humanDelayMs(candidateText) : 0) - Date.now());
    transcript.push({ role: 'candidate', text: candidateText });
    console.log(`\n[candidate · ${clock(Date.now() - startedAt)}] ${candidateText}`);

    const phaseBeforeTurn = phase;
    const result = await runTurn(sessionId, candidateText);
    // What the candidate sees: the spoken text, plus the exhibit the app would
    // render in its side panel. The DB transcript is unaffected.
    transcript.push({
      role: 'interviewer',
      text: result.exhibit ? `${result.interviewerText}\n\n${exhibitAsText(result.exhibit)}` : result.interviewerText,
    });
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
  md.push(`- Candidate simulator: \`${CANDIDATE_MODEL}\` (sees only the transcript)`);
  if (PERSONA) {
    md.push(`- Persona: **${PERSONA.id}. ${PERSONA.name}**`);
    md.push(`- Tests: ${PERSONA.tests}`);
  }
  md.push(`- Pacing: ${PACE === 'human' ? `human (${THINK_MS}ms think + ${WPM} wpm typing, ≤${MAX_TURN_DELAY_MS / 1000}s per turn)` : 'fast (no delay)'}; persona pauses ≤${MAX_PAUSE_MS / 1000}s`, '');

  md.push('## Rule 11 / v4.1 checks', '');
  md.push(`- Ledger items revealed: ${revealed.map(r => `\`${r.ledgerItemId}\``).join(', ') || 'none'}`);
  md.push(`- Force-released before the recommendation ask: ${forced.length ? '`' + JSON.stringify(forced) + '`' : 'none'}`);
  md.push(`- Scoring QA: \`${JSON.stringify(scoringQa ?? {})}\``);
  md.push(`- Assists / interventions: ${interventions.map(i => `${i.subtype}@${i.turnIndex}`).join(', ') || 'none'}`, '');
  md.push('| Candidate turn | Response | Ledger items | Asked for | Revealed by then |', '|---|---|---|---|---|');
  for (const r of dataRequests) {
    const p = r.payloadJsonb as { what?: string; ledgerItemIds?: string[]; ledgerItemId?: string | null; revealedByNow?: boolean };
    const ids = p.ledgerItemIds ?? (p.ledgerItemId ? [p.ledgerItemId] : []);
    md.push(`| ${r.turnIndex} | ${r.subtype} | ${ids.join(', ') || '—'} | ${(p.what ?? '').replace(/\|/g, '/')} | ${p.revealedByNow ? 'yes' : 'no'} |`);
  }
  md.push('');

  // Part V (v4.6): every check records its decision — a check with no row
  // never ran, which is different from one that ran and found nothing.
  md.push('## Check decisions', '', '| Check | Pass | Act | Skip | Acted at candidate turn |', '|---|---|---|---|---|');
  for (const c of summarizeCheckEvents(events.filter(e => e.category === 'check'))) {
    md.push(`| ${c.check} | ${c.pass} | ${c.act} | ${c.skip} | ${c.actedAt.join(', ') || '—'} |`);
  }
  md.push('');

  // List price per million tokens, uncached (the app sets no cache_control).
  const PRICE_PER_MTOK: Record<'opus' | 'haiku', [number, number]> = { opus: [5, 25], haiku: [1, 5] };
  const HAIKU_COMPONENTS = new Set(['coverage', 'data_request', 'distress']);
  const usd = (tier: 'opus' | 'haiku', input: number, output: number) =>
    (input * PRICE_PER_MTOK[tier][0] + output * PRICE_PER_MTOK[tier][1]) / 1e6;
  let appUsd = 0;
  md.push('## LLM usage', '', '| Component | Calls | Input tokens | Output tokens | Est. USD |', '|---|---|---|---|---|');
  for (const [k, u] of usage) {
    const cost = usd(HAIKU_COMPONENTS.has(k) ? 'haiku' : 'opus', u.input, u.output);
    appUsd += cost;
    md.push(`| ${k} | ${u.calls} | ${u.input} | ${u.output} | $${cost.toFixed(3)} |`);
  }
  const simUsd = usd('opus', candidateUsage.input, candidateUsage.output);
  md.push(`| candidate simulator (${[...candidateUsage.models].join(', ')}) | ${candidateUsage.calls} | ${candidateUsage.input} | ${candidateUsage.output} | $${simUsd.toFixed(3)} |`);
  md.push('', `- App cost (interviewer + scoring): **$${appUsd.toFixed(2)}** · with simulator: **$${(appUsd + simUsd).toFixed(2)}** · list prices, uncached`);
  md.push(`- Wall time: ${clock(Date.now() - startMs)}`, '');

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
  await writeFile(path.join(OUT_DIR, `${base}.log`), logLines.join('\n'));

  console.log(`[live-run] wrote ${path.join(OUT_DIR, base)}.{md,json,log${pdf ? ',pdf' : ''}}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[live-run] failed:', err);
    process.exit(1);
  });
