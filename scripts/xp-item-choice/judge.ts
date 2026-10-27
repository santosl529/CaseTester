// Arm B (Lorenzo, 27 Oct, measurement only): a Sonnet judge on the candidate's raw message — which ledger item(s)
// answer each data ask, full / partial / none, and the missing part. Runs on the labelled test set; records verdicts,
// latency, and the recorded turn's timing marks (for "would it have arrived before the data line").
//   npx tsx --env-file=<env> scripts/xp-item-choice/judge.ts <testset.json> <spend.json> <out.json>
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { anthropicClient } from '@/lib/anthropic-client';
import { FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { canSpend, record } from './spend';
const MODEL = 'claude-sonnet-5-5';
const ROOTS = ['/Users/lorenzo/coding/personal-projects/CaseTester/Case Interview Runs', '/Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase1/Case Interview Runs'];
const SCHEMA = { type: 'object', additionalProperties: false, required: ['asks'], properties: { asks: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['ask', 'items', 'missing'], properties: {
    ask: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'answers'], properties: { id: { type: 'string' }, answers: { type: 'string', enum: ['full', 'partial'] } } } },
    missing: { type: 'string' },
  } } } } };
const system = (caseId: string) => {
  const c = JSON.parse(readFileSync(`cases/${caseId}.json`, 'utf8'));
  const items = c.dataLedger.map((i: { id: string; label: string; value: string }) => ({ id: i.id, label: i.label, line: i.value }));
  return `You judge, for a case-interview simulator, which case data answers a candidate's data asks. The case holds ONLY the ledger items below.

For each distinct data ask in the candidate's message (a request for a figure, fact or breakdown — not a question about their reasoning), output:
- "ask": the ask in the candidate's own words, short;
- "items": every ledger item whose line answers it, each "full" (its line answers the whole ask) or "partial" (it answers part, coarser, or a related figure that lets them work it out);
- "missing": the part of the ask no item's line holds, as a short noun phrase ("" when nothing is missing). With no item at all, items is [] and missing is the whole ask.

Judge only by what each line actually says. A finer cut (by month, by quarter, per route, a breakdown) that no line gives is missing. Do not count an item because it is on the same topic. If the message asks for no data, output {"asks": []}.

Ledger items (JSON): ${JSON.stringify(items)}`;
};
function recordedTurn(turnFile: string, turn: number): { timing?: Record<string, number> } | null {
  for (const root of ROOTS) {
    const p = `${root}/${turnFile}`;
    if (!existsSync(p)) continue;
    for (const l of gunzipSync(readFileSync(p)).toString('utf8').split('\n')) {
      if (!l) continue;
      const d = JSON.parse(l);
      if (d.turnIndex === turn - 1 && d.delivered) return d;
    }
  }
  return null;
}
async function main() {
  const [setPath, spendPath, outPath] = process.argv.slice(2);
  const set = JSON.parse(readFileSync(setPath, 'utf8')) as Record<string, string[]>;
  const bank = new Map<string, { id: string; caseId: string; turnFile: string; turn: number; run: string; candidateText: string; state: { revealedIds: string[] } }>();
  for (const f of readdirSync('evals/fault-bank').filter(n => n.endsWith('.jsonl')).map(n => `evals/fault-bank/${n}`)) for (const l of readFileSync(f, 'utf8').split('\n')) if (l) { const r = JSON.parse(l); bank.set(r.id, r); }
  const groups = Object.fromEntries(Object.entries(set).flatMap(([g, ids]) => ids.map(id => [id, g])));
  const turns = new Map<string, { ids: string[]; r: typeof bank extends Map<string, infer V> ? V : never }>();
  for (const id of Object.keys(groups)) { const r = bank.get(id)!; const k = `${r.run}:${r.turn}`; const t = turns.get(k); if (t) t.ids.push(id); else turns.set(k, { ids: [id], r }); }
  const client = anthropicClient();
  const out: unknown[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
  const done = new Set((out as { key: string }[]).map(o => o.key));
  for (const [key, { ids, r }] of [...turns.entries()].sort((a, b) => a[1].r.caseId.localeCompare(b[1].r.caseId))) {
    if (done.has(key)) continue;
    if (!canSpend(spendPath, 0.05)) { console.log('cap: stop'); break; }
    const t0 = Date.now();
    const resp = await client.beta.messages.create({ model: MODEL, max_tokens: 1024, betas: [FALLBACK_BETA], fallbacks: FALLBACKS, thinking: { type: 'between_tools' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: system(r.caseId), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Items already given to the candidate: ${JSON.stringify(r.state.revealedIds)}\n\nCandidate's message:\n${r.candidateText}` }] } as never) as unknown as { model: string; content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    const latencyMs = Date.now() - t0;
    const u = resp.usage;
    const usd = record(spendPath, { arm: 'B', model: MODEL, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, latencyMs, note: key });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let verdict: unknown = null; try { verdict = JSON.parse(text); } catch { verdict = { raw: text }; }
    const timing = recordedTurn(r.turnFile, r.turn)?.timing ?? null;
    out.push({ key, caseId: r.caseId, run: r.run, turn: r.turn, records: ids, groups: ids.map(i => groups[i]), candidateText: r.candidateText, verdict, latencyMs, usd, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, servedBy: resp.model, timing });
    writeFileSync(outPath, JSON.stringify(out, null, 1));
  }
  console.log(`judged ${out.length} turns`);
}
void main();
