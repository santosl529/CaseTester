// Guard verification on one run record (7 Oct). Per model turn: the pressure
// test's state, explicit-ask cues, whether guard B regenerated and what the
// second attempt declared, the data decisions, first useful content. Then the
// four properties: requests recorded while the pressure test is pending; no
// release before it is answered; after it, requests fulfilled and no repeat;
// no explicit ask left unanswered at the end. Free — reads the record.
//
//   npx tsx scripts/guard-check.ts "<run dir>"

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';
import { usefulMs, parseTiming } from './useful-latency';

type Ev = { category: string; subtype: string; turnIndex: number | null; phase: string; payloadJsonb: Record<string, unknown> };
type Run = {
  session: { flagsJsonb: { moves?: Record<string, string> } };
  turns: { turnIndex: number; role: string; text: string }[];
  events: Ev[];
  revealed: { ledgerItemId: string }[];
  analytics: { eventType: string; createdAt: string; payloadJsonb: { turnIndex: number } }[];
};

const dir = process.argv[2];
const files = readdirSync(dir);
const run = JSON.parse(readFileSync(path.join(dir, files.find(f => f.endsWith('.json'))!), 'utf8')) as Run;
const log = readFileSync(path.join(dir, files.find(f => f.endsWith('.log'))!), 'utf8');
const groups = log.split(/^\[runner\] phase:/m).slice(1).map(g => ({
  raws: [...g.matchAll(/^\[interviewer-model\] raw response: (.*)$/gm)].map(m => m[1]),
  timing: g.match(/^\[timing\] (.*)$/m)?.[1],
}));
const lat = run.analytics.filter(a => a.eventType === 'turn_latency').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const moves = run.session.flagsJsonb.moves ?? {};
const declaredCount = (raw?: string) => { try { return raw ? (JSON.parse(raw).requests ?? []).length : null; } catch { return null; } };

let ptAskedAt: number | null = null;
const rows: string[] = [];
const releasesBeforePT: string[] = [];
const ptRepeats: number[] = [];
const guardTurns: { t: number; regenerated: boolean; secondDeclared: number | null; useful: number | null }[] = [];
const normalUseful: number[] = [];

lat.forEach((a, k) => {
  const t = a.payloadJsonb.turnIndex;
  const g = groups[k];
  const cand = run.turns.find(x => x.turnIndex === t - 1 && x.role === 'candidate')?.text ?? '';
  const cues = explicitRequestCues(cand);
  const ev = run.events.filter(e => e.turnIndex === t - 1);
  const dd = ev.find(e => e.subtype === 'data_decisions')?.payloadJsonb.detail as { releases?: string[]; defers?: string[]; refusals?: string[]; offers?: string[] } | undefined;
  const guard = ev.find(e => e.subtype === 'request_guard');
  const regenerated = guard?.payloadJsonb.decision === 'act';
  const ptDone = ptAskedAt !== null && ptAskedAt < t;
  const marks = g?.timing ? parseTiming(g.timing) : {};
  const useful = g?.timing ? usefulMs(marks) : null;
  if (!ptDone && (dd?.releases?.length ?? 0) > 0) releasesBeforePT.push(`t${t}: ${dd!.releases!.join(', ')}`);
  if (moves[String(t)] === 'pressure_test') { if (ptAskedAt !== null) ptRepeats.push(t); else ptAskedAt = t; }
  if (guard) guardTurns.push({ t, regenerated, secondDeclared: regenerated ? declaredCount(g?.raws.at(-1)) : null, useful });
  else if (g?.raws.length && useful != null) normalUseful.push(useful);
  rows.push(`t${String(t).padEnd(3)} ${String(moves[String(t)] ?? 'code').padEnd(14)} PT ${ptDone ? 'done' : ptAskedAt === t ? 'ASKED' : 'pending'}` +
    ` · cues ${cues.length ? cues.join('+') : '-'}${guard ? ` · guardB ${regenerated ? 'REGEN' : 'ok'}` : ''}` +
    ` · declared ${g?.raws.map(declaredCount).join('→') ?? '-'}` +
    ` · rel ${dd?.releases?.length ?? 0} def ${dd?.defers?.length ?? 0} ref ${dd?.refusals?.length ?? 0} off ${dd?.offers?.length ?? 0}` +
    ` · useful ${useful ?? '-'}ms`);
});

// Requests the candidate made that were deferred and never later released.
const deferred = run.events.filter(e => e.category === 'data_request' && e.subtype === 'defer')
  .flatMap(e => (e.payloadJsonb.ledgerItemIds as string[]) ?? []);
const revealed = new Set(run.revealed.map(r => r.ledgerItemId));
const neverFulfilled = [...new Set(deferred.filter(id => !revealed.has(id)))];
const classified = run.events.filter(e => e.subtype === 'classified').map(e => `t${e.payloadJsonb.interviewerTurnIndex}:${e.payloadJsonb.requestCount}`);

const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : '-'; };
console.log(`# ${path.basename(path.dirname(dir))}/${path.basename(dir)}`);
console.log(rows.join('\n'));
console.log(`\nPressure test first asked at t${ptAskedAt ?? '-'} · repeated at ${ptRepeats.length ? ptRepeats.map(t => `t${t}`).join(', ') : 'none'}`);
console.log(`Releases before the pressure test was answered: ${releasesBeforePT.length ? releasesBeforePT.join(' | ') : 'none'}`);
console.log(`Deferred and never released: ${neverFulfilled.length ? neverFulfilled.join(', ') : 'none'}`);
console.log(`Guard B: fired on ${guardTurns.length} turns, regenerated ${guardTurns.filter(g => g.regenerated).length} (second attempt declared: ${guardTurns.filter(g => g.regenerated).map(g => g.secondDeclared).join(', ') || '-'})`);
console.log(`First useful content — normal turns median ${pct(normalUseful, 0.5)} p90 ${pct(normalUseful, 0.9)} (n ${normalUseful.length}) · guard-armed, no regen: ${guardTurns.filter(g => !g.regenerated).map(g => g.useful).join(', ') || '-'} · regenerated: ${guardTurns.filter(g => g.regenerated).map(g => g.useful).join(', ') || '-'}`);
console.log(`Background classifier request counts: ${classified.join(' ')}`);
