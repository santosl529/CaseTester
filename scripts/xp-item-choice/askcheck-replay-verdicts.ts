// Step 1 replay (Lorenzo, 27 Oct): the raw-message ask check (Haiku 4.5) on every call the switch-on replay logged
// (REPLAY_ASK_NEED); writes REPLAY_CHECKS overrides, so the replay is deterministic and paid once.
//   XP_CAP_USD=1.5 npx tsx --env-file=<env> scripts/xp-item-choice/askcheck-replay-verdicts.ts <need.jsonl> <spend.json> <overrides.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getCaseById } from '@/lib/cases/loader';
import { classifyAsk, askCheckCatalog, promptFactCatalog } from '@/lib/orchestrator/data-requests';
import { canSpend, record } from './spend';
async function main() {
  const [needPath, spendPath, outPath] = process.argv.slice(2);
  const need = readFileSync(needPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { run: string; turn: number; what: string; message: string });
  const uniq = [...new Map(need.map(n => [`${n.run}\u0000${n.turn}\u0000${n.what}`, n])).values()];
  const out: { run: string; turn: number; what: string; ids: string[] | null; answers: Record<string, 'full' | 'partial'>; missing: Record<string, string>; latencyMs: number }[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
  const done = new Set(out.map(o => `${o.run}\u0000${o.turn}\u0000${o.what}`));
  for (const n of uniq) {
    if (done.has(`${n.run}\u0000${n.turn}\u0000${n.what}`)) continue;
    if (!canSpend(spendPath, 0.006)) { console.log('cap: stop'); break; }
    const caseId = JSON.parse(readFileSync(n.run.replace(/\.turns\.jsonl\.gz$/, '.json'), 'utf8')).session.caseId as string;
    const c = getCaseById(caseId);
    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const t0 = Date.now();
    const r = await classifyAsk({ what: n.what, model: 'claude-haiku-4-5', catalog: [...askCheckCatalog(c.dataLedger), ...promptFactCatalog(c as never)], message: n.message,
      onUsage: u => { usage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens ?? 0, cacheWriteTokens: u.cacheWriteTokens ?? 0 }; } });
    const latencyMs = Date.now() - t0;
    record(spendPath, { arm: 'ask:replay-raw-4.5', model: 'claude-haiku-4-5', ...usage, latencyMs, note: `${n.turn} ${n.what}` });
    out.push({ run: n.run, turn: n.turn, what: n.what, ids: r === null ? null : r.items.map(i => i.id), answers: Object.fromEntries((r?.items ?? []).map(i => [i.id, i.answers])), missing: Object.fromEntries((r?.items ?? []).filter(i => i.missing).map(i => [i.id, i.missing!])), latencyMs });
    writeFileSync(outPath, JSON.stringify(out, null, 1));
  }
  console.log('verdicts', out.length, 'of', uniq.length);
}
void main();
