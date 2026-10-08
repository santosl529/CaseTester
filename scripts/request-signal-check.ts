// Guard B precision check (7 Oct): the explicit-request detector over every
// saved model turn, against what the model declared. "Would regenerate" =
// detector fires and the model declared no request. Free — reads run records.
//
//   npx tsx scripts/request-signal-check.ts batch-12-oct-06 batch-13-oct-06 …

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { explicitRequestCues } from '@/lib/orchestrator/request-signal';

const R = 'Case Interview Runs/test runs';
type Run = { turns: { turnIndex: number; role: string; text: string }[]; analytics: { eventType: string; createdAt: string; payloadJsonb: { turnIndex: number } }[] };

let turns = 0, fires = 0, quietButDeclared = 0;
const regen: string[] = [];
for (const batch of process.argv.slice(2)) {
  for (const dir of readdirSync(path.join(R, batch)).filter(d => !d.startsWith('.') && !d.endsWith('.md') && d !== 'review')) {
    const d = path.join(R, batch, dir);
    const files = readdirSync(d);
    const jf = files.find(f => f.endsWith('.json')), lf = files.find(f => f.endsWith('.log'));
    if (!jf || !lf) continue;
    const run = JSON.parse(readFileSync(path.join(d, jf), 'utf8')) as Run;
    const groups = readFileSync(path.join(d, lf), 'utf8').split(/^\[runner\] phase:/m).slice(1)
      .map(g => [...g.matchAll(/^\[interviewer-model\] raw response: (.*)$/gm)].map(m => m[1]));
    const lat = run.analytics.filter(a => a.eventType === 'turn_latency').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    lat.forEach((a, k) => {
      const raws = groups[k];
      if (!raws?.length) return;                       // code-written turn
      let declared = 0;
      try { declared = (JSON.parse(raws[raws.length - 1]).requests ?? []).length; } catch { return; }
      const cand = run.turns.find(t => t.turnIndex === a.payloadJsonb.turnIndex - 1 && t.role === 'candidate')?.text ?? '';
      const cues = explicitRequestCues(cand);
      turns++;
      if (cues.length) fires++;
      if (!cues.length && declared > 0) quietButDeclared++;
      if (cues.length && declared === 0) regen.push(`${batch}/${dir} t${a.payloadJsonb.turnIndex} [${cues.join(', ')}]\n    ${cand.replace(/\s+/g, ' ').slice(0, 700)}`);
    });
  }
}
console.log(`${turns} model turns · detector fires on ${fires} · would regenerate (fires, nothing declared) ${regen.length} · quiet but the model declared requests ${quietButDeclared}`);
console.log(regen.join('\n'));
