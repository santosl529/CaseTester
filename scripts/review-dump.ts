// A review sheet per run for hand grading (7 Oct): every model turn with the
// candidate's message, the model's raw JSON (run log), what the candidate
// heard (transcript), and every check that acted or decided data. Free.
//
//   npx tsx scripts/review-dump.ts "<run dir>" > sheet.md

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

type Run = {
  turns: { turnIndex: number; role: string; text: string }[];
  events: { category: string; subtype: string; turnIndex: number | null; payloadJsonb: { decision?: string; reason?: string; detail?: unknown } & Record<string, unknown> }[];
  analytics: { eventType: string; createdAt: string; payloadJsonb: Record<string, unknown> }[];
};

const dir = process.argv[2];
const files = readdirSync(dir);
const run = JSON.parse(readFileSync(path.join(dir, files.find(f => f.endsWith('.json'))!), 'utf8')) as Run;
const log = readFileSync(path.join(dir, files.find(f => f.endsWith('.log'))!), 'utf8');

// Log groups, one per runner turn, in order; model turns carry a raw reply.
const groups = log.split(/^\[runner\] phase:/m).slice(1).map(g => ({
  head: g.split('\n')[0].trim(),
  raws: [...g.matchAll(/^\[interviewer-model\] raw response: (.*)$/gm)].map(m => m[1]),
}));
const latency = run.analytics.filter(a => a.eventType === 'turn_latency')
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(a => a.payloadJsonb as { turnIndex: number; kind?: string });

const out: string[] = [`# ${path.basename(dir)}\n`];
latency.forEach((lat, k) => {
  const iTurn = lat.turnIndex;
  const cand = run.turns.find(t => t.turnIndex === iTurn - 1 && t.role === 'candidate');
  const heard = run.turns.find(t => t.turnIndex === iTurn && t.role === 'interviewer');
  const g = groups[k];
  out.push(`## t${iTurn} · ${g?.head ?? '?'}`);
  out.push(`**Candidate (t${iTurn - 1}):** ${cand?.text.replace(/\n+/g, ' ⏎ ') ?? '(none)'}`);
  if (g?.raws.length) g.raws.forEach((r, i) => out.push(`**Raw model${g.raws.length > 1 ? ` (attempt ${i + 1})` : ''}:** \`${r}\``));
  else out.push(`**Raw model:** (none — code-written turn)`);
  out.push(`**Heard:** ${heard?.text.replace(/\n+/g, ' ⏎ ') ?? '(none)'}`);
  const evs = run.events.filter(e => e.turnIndex === iTurn - 1 && (e.category !== 'check' || e.payloadJsonb.decision !== 'pass' || e.subtype === 'data_decisions'));
  for (const e of evs) out.push(`- _${e.category}/${e.subtype}_ ${e.payloadJsonb.decision ?? ''} ${e.payloadJsonb.reason ?? ''} ${JSON.stringify(e.payloadJsonb.detail ?? {}).slice(0, 300)}`);
  out.push('');
});
console.log(out.join('\n'));
