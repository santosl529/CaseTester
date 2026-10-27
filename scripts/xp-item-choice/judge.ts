// Arm B (Lorenzo, 27 Oct, measurement only): a Sonnet judge on the candidate's raw message — which ledger item(s)
// answer each data ask, full / partial / none, and the missing part. Runs on the labelled test set; records verdicts,
// latency, and the recorded turn's timing marks (for "would it have arrived before the data line").
//   npx tsx --env-file=<env> scripts/xp-item-choice/judge.ts <testset.json> <spend.json> <out.json>
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { anthropicClient } from '@/lib/anthropic-client';
import { FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { canSpend, record } from './spend';
import { requireRunBudget, BudgetExceededError } from '@/lib/llm-budget';
const MODEL = process.env.XP_JUDGE_MODEL ?? 'claude-sonnet-5-5';
const WITH_PROMPT = process.env.XP_PROMPT_FACTS === '1';
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
  // Round 2 (Lorenzo, 27 Oct): the prompt and its facts, citable as items "prompt:<id>".
  const facts = WITH_PROMPT ? [{ id: 'prompt:case', label: 'The case prompt the candidate was given', line: c.prompt },
    ...(c.factAnchors?.promptFacts ?? []).filter((f: { say?: string }) => f.say).map((f: { id: string; say: string }) => ({ id: `prompt:${f.id}`, label: 'Prompt fact', line: f.say }))] : [];
  return `You judge, for a case-interview simulator, which case data answers a candidate's data asks. The case holds ONLY the ledger items below${WITH_PROMPT ? ' (items whose id starts with prompt: are facts the candidate was already given in the case prompt)' : ''}.

For each distinct data ask in the candidate's message (a request for a figure, fact or breakdown — not a question about their reasoning), output:
- "ask": the ask in the candidate's own words, short;
- "items": every ledger item whose line answers it, each "full" (its line answers the whole ask) or "partial" (it answers part, coarser, or a related figure that lets them work it out);
- "missing": the part of the ask no item's line holds, as a short noun phrase ("" when nothing is missing). With no item at all, items is [] and missing is the whole ask.

Judge only by what each line actually says. A finer cut (by month, by quarter, per route, a breakdown) that no line gives is missing. Do not count an item because it is on the same topic. If the message asks for no data, output {"asks": []}.

Ledger items (JSON): ${JSON.stringify([...items, ...facts])}`;
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
  if (process.env.LLM_BUDGET_USD) requireRunBudget('xp-judge');
  const client = anthropicClient();
  const out: unknown[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
  const done = new Set((out as { key: string }[]).map(o => o.key));
  let order = [...turns.entries()].sort((a, b) => a[1].r.caseId.localeCompare(b[1].r.caseId));
  if (process.env.XP_ONLY_SCORED) {
    const scored = new Set((JSON.parse(readFileSync(process.env.XP_ONLY_SCORED, 'utf8')) as { turn: string; score: string }[]).filter(x => x.score !== 'na').map(x => x.turn));
    const byClass = new Map<string, typeof order>();
    for (const e of order.filter(([k]) => scored.has(k))) { const g = groups[e[1].ids[0]]; byClass.set(g, [...(byClass.get(g) ?? []), e]); }
    order = [];
    for (let i = 0; [...byClass.values()].some(v => v.length > i); i++) for (const v of byClass.values()) if (v[i]) order.push(v[i]);
  }
  for (const [key, { ids, r }] of order) {
    if (done.has(key)) continue;
    if (!canSpend(spendPath, 0.05)) { console.log('cap: stop'); break; }
    const t0 = Date.now();
    const haiku = MODEL === 'claude-haiku-5-5';   // no server-side fallback; it rejects between_tools
    const haiku45 = MODEL.startsWith('claude-haiku-4-5');   // as the app calls it: no thinking, effort or schema; a JSON prefill
    const resp = await (async () => { try { return await client.beta.messages.create({ model: MODEL, max_tokens: 1024,
      ...(haiku45 ? {} : haiku ? { thinking: { type: 'disabled' } } : { betas: [FALLBACK_BETA], fallbacks: FALLBACKS, thinking: { type: 'between_tools' } }),
      ...(haiku45 ? {} : { output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } } }),
      system: [{ type: 'text', text: system(r.caseId), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Items already given to the candidate: ${JSON.stringify(r.state.revealedIds)}\n\nCandidate's message:\n${r.candidateText}${haiku45 ? '\n\nReply with ONLY the JSON: {"asks":[{"ask":"...","items":[{"id":"...","answers":"full|partial"}],"missing":"..."}]}' : ''}` },
        ...(haiku45 ? [{ role: 'assistant', content: '{"asks":' }] : [])] } as never) as unknown as { model: string; content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    } catch (e) { if (e instanceof BudgetExceededError) return null; throw e; } })();
    if (resp === null) { console.log('budget reached: stop'); break; }
    const latencyMs = Date.now() - t0;
    const u = resp.usage;
    const usd = record(spendPath, { arm: `B:${MODEL}${WITH_PROMPT ? '+pf' : ''}`, model: MODEL, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, latencyMs, note: key });
    const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    // The prefill's continuation, cut at the end of its balanced JSON.
    const text = haiku45 ? (() => { const t = `{"asks":${raw}`; let d = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '{') d++; else if (t[i] === '}' && --d === 0) return t.slice(0, i + 1); } return t; })() : raw;
    let verdict: unknown = null; try { verdict = JSON.parse(text); } catch { verdict = { raw: text }; }
    const timing = recordedTurn(r.turnFile, r.turn)?.timing ?? null;
    out.push({ key, caseId: r.caseId, run: r.run, turn: r.turn, records: ids, groups: ids.map(i => groups[i]), candidateText: r.candidateText, verdict, latencyMs, usd, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, servedBy: resp.model, timing });
    writeFileSync(outPath, JSON.stringify(out, null, 1));
  }
  console.log(`judged ${out.length} turns`);
}
void main();
