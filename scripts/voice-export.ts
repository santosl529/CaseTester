// A voice session's review files from the database (voice deploy, 18 Oct — the
// hosted worker keeps no files): <out>/<date>/<sessionId>.jsonl (the per-turn
// records, line for line as the agent wrote them locally), <sessionId>.md (the
// transcript) and <sessionId>-db-dump.json (session, turns, events, analytics,
// revealed, exhibits — the shape of the 9ccf0836 dump the replay tools read).
// Free (database reads only). Won't overwrite a jsonl without --force.
//
//   npx tsx --env-file=.env.local scripts/voice-export.ts <sessionId> [--out="Case Interview Runs/voice-live"] [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { jsonlOf, sessionDate, transcriptMd } from '@/lib/voice/session-export';

const sessionId = process.argv[2];
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'Case Interview Runs/voice-live';
const force = process.argv.includes('--force');

async function main() {
  if (!sessionId || sessionId.startsWith('--')) throw new Error('usage: voice-export.ts <sessionId> [--out=dir] [--force]');
  const { asc, eq } = await import('drizzle-orm');
  const { db } = await import('@/db/client');
  const t = await import('@/db/schema');
  const session = await db.query.sessions.findFirst({ where: eq(t.sessions.id, sessionId) });
  if (!session) throw new Error(`no session ${sessionId}`);
  const lines = await db.select().from(t.voiceSessionLines).where(eq(t.voiceSessionLines.sessionId, sessionId)).orderBy(asc(t.voiceSessionLines.id));
  const turns = await db.select().from(t.sessionTurns).where(eq(t.sessionTurns.sessionId, sessionId)).orderBy(asc(t.sessionTurns.turnIndex));
  const events = await db.select().from(t.sessionEvents).where(eq(t.sessionEvents.sessionId, sessionId)).orderBy(asc(t.sessionEvents.createdAt));
  const analytics = await db.select().from(t.analyticsEvents).where(eq(t.analyticsEvents.sessionId, sessionId)).orderBy(asc(t.analyticsEvents.createdAt));
  const revealed = await db.select().from(t.revealedData).where(eq(t.revealedData.sessionId, sessionId));
  const exhibits = await db.select().from(t.exhibitsShown).where(eq(t.exhibitsShown.sessionId, sessionId));

  const dir = path.join(out, sessionDate(lines, session.startedAt));
  const jsonl = path.join(dir, `${sessionId}.jsonl`);
  if (existsSync(jsonl) && !force) throw new Error(`${jsonl} exists — pass --force to overwrite`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(jsonl, jsonlOf(lines));
  writeFileSync(path.join(dir, `${sessionId}.md`), transcriptMd(session, turns, lines));
  writeFileSync(path.join(dir, `${sessionId}-db-dump.json`), JSON.stringify({ session, turns, events, analytics, revealed, exhibits }, null, 1));
  console.log(`${lines.length} record lines, ${turns.length} turns, ${events.length} events → ${dir}`);
  if (lines.length === 0) console.log('no record lines: the session ran on a worker before the voice_session_lines table, or never reached a turn');
}

main().then(() => process.exit(0), e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
