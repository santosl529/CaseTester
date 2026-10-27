// Step 1 (Lorenzo, 27 Oct, measure first): the ask check on the labelled turns' declared asks — today's prompt vs the
// raw-message prompt (+ prompt facts), on Haiku 4.5 and Haiku 5.5. Records each verdict, latency and cost.
//   XP_CAP_USD=1.5 npx tsx --env-file=<env> scripts/xp-item-choice/askcheck-eval.ts <need.json> <spend.json> <out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getCaseById } from '@/lib/cases/loader';
import { classifyAsk, askCheckCatalog, promptFactCatalog } from '@/lib/orchestrator/data-requests';
import { canSpend, record } from './spend';
type Need = { turn: string; record: string; class: string; caseId: string; message: string; whats: string[] };
const ARMS = [
  { arm: 'today-4.5', model: 'claude-haiku-4-5', raw: false },
  { arm: 'raw-4.5', model: 'claude-haiku-4-5', raw: true },
  { arm: 'raw-5.5', model: 'claude-haiku-5-5', raw: true },
];
async function main() {
  const [needPath, spendPath, outPath] = process.argv.slice(2);
  const need = JSON.parse(readFileSync(needPath, 'utf8')) as Need[];
  const out: Record<string, unknown>[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
  const done = new Set(out.map(o => `${o.arm}\u0000${o.turn}\u0000${o.what}`));
  for (const a of ARMS) for (const n of need) for (const what of n.whats) {
    if (done.has(`${a.arm}\u0000${n.turn}\u0000${what}`)) continue;
    if (!canSpend(spendPath, 0.006)) { console.log('cap: stop'); writeFileSync(outPath, JSON.stringify(out, null, 1)); return; }
    const c = getCaseById(n.caseId);
    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const t0 = Date.now();
    const r = await classifyAsk({ what, model: a.model, catalog: a.raw ? [...askCheckCatalog(c.dataLedger), ...promptFactCatalog(c as never)] : askCheckCatalog(c.dataLedger),
      ...(a.raw ? { message: n.message } : {}), onUsage: u => { usage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens ?? 0, cacheWriteTokens: u.cacheWriteTokens ?? 0 }; } });
    const latencyMs = Date.now() - t0;
    const usd = record(spendPath, { arm: `ask:${a.arm}`, model: a.model, ...usage, latencyMs, note: `${n.turn} ${what}` });
    out.push({ arm: a.arm, turn: n.turn, record: n.record, class: n.class, what, verdict: r, latencyMs, usd });
  }
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log('done', out.length);
}
void main();
