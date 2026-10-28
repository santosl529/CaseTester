// Arm A (Lorenzo, 27 Oct, measurement only): Opus writes, per ledger item of a demo case, the asks it answers and the
// nearby asks it does not, from the case and real candidate asks of batches ≤ 38 (batch 39 held out). Drafts go to
// evals/case-notes-draft/<case>.json — never cases/.
//   npx tsx --env-file=<env> scripts/xp-item-choice/author-notes.ts <asks.json> <spend.json> <caseId>...
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { anthropicClient } from '@/lib/anthropic-client';
import { FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { canSpend, record } from './spend';
const MODEL = 'claude-opus-5-5';
const SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['id', 'answers', 'notAnswers'], properties: {
    id: { type: 'string' }, answers: { type: 'array', items: { type: 'string' } },
    notAnswers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['phrase', 'missing'], properties: { phrase: { type: 'string' }, missing: { type: 'string' } } } },
  } } } } };
function prompt(caseId: string, asks: string[]): string {
  const c = JSON.parse(readFileSync(`cases/${caseId}.json`, 'utf8'));
  const ledger = c.dataLedger.map((i: { id: string; label: string; value: string }) => ({ id: i.id, label: i.label, line: i.value }));
  const exhibits = c.exhibits.map((e: { id: string; title: string; coversLedgerItems?: string[]; data: unknown }) => ({ id: e.id, title: e.title, items: e.coversLedgerItems ?? [], data: e.data }));
  return `You are writing matching notes for a case-interview simulator. An AI interviewer answers a candidate's data asks only from the case's ledger items below. Code matches an ask to an item by short phrases. Your notes decide which item answers an ask.

For EVERY ledger item, write:
- "answers": 6–15 short phrases (2–6 words, lowercase) a candidate might use when asking for data this item's line actually gives. Include paraphrases and synonyms of the real asks below where they fit.
- "notAnswers": 0–8 nearby asks a candidate might expect this item (or its exhibit) to answer but whose answer is NOT in the item's line. Each has "phrase" (2–6 words, lowercase, as the candidate would say it) and "missing" (a short noun phrase naming the part not held, e.g. "the length of the royalty term").

Rules: judge only by the item's line (and its exhibit's cells). Never write a phrase whose answer is in another item's line under this item's notAnswers if THIS item holds it. A finer cut (by month, by route, per unit) that the line doesn't give is a notAnswer. Don't invent data. Use each item id exactly.

Case prompt: ${c.prompt}

Ledger items (JSON): ${JSON.stringify(ledger)}

Exhibits (JSON): ${JSON.stringify(exhibits)}

Existing name phrases per item (keep consistent; you may add): ${JSON.stringify(c.factAnchors?.names ?? {})}
Existing cover phrases per item: ${JSON.stringify(c.factAnchors?.covers ?? {})}

Real candidate asks from earlier interviews on this case (one per line):
${asks.join('\n')}`;
}
async function main() {
  const [asksPath, spendPath, ...cases] = process.argv.slice(2);
  const asks = JSON.parse(readFileSync(asksPath, 'utf8')) as Record<string, string[]>;
  const client = anthropicClient();
  mkdirSync('evals/case-notes-draft', { recursive: true });
  for (const caseId of cases) {
    const p = prompt(caseId, asks[caseId] ?? []);
    const worst = (p.length / 3) * 4 / 1e6 + 32000 * 20 / 1e6;
    if (!canSpend(spendPath, worst)) { console.log(`cap: stop before ${caseId}`); break; }
    const t0 = Date.now();
    const stream = client.beta.messages.stream({ model: MODEL, max_tokens: 32000, betas: [FALLBACK_BETA], fallbacks: FALLBACKS,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: p }] } as never);
    const r = await (stream as unknown as { finalMessage(): Promise<{ model: string; stop_reason: string; content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }> }).finalMessage();
    const usd = record(spendPath, { arm: 'A', model: MODEL, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, cacheReadTokens: r.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0, latencyMs: Date.now() - t0, note: caseId });
    const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (r.stop_reason !== 'end_turn') { console.log(caseId, 'stop', r.stop_reason, `$${usd.toFixed(3)}`); writeFileSync(`evals/case-notes-draft/${caseId}.raw.txt`, text); continue; }
    const notes = JSON.parse(text) as { items: { id: string; answers: string[]; notAnswers: { phrase: string; missing: string }[] }[] };
    const known = new Set(JSON.parse(readFileSync(`cases/${caseId}.json`, 'utf8')).dataLedger.map((i: { id: string }) => i.id));
    const items = notes.items.filter(i => known.has(i.id));
    writeFileSync(`evals/case-notes-draft/${caseId}.json`, JSON.stringify({ caseId, model: r.model, authoredFrom: 'case JSON + candidate asks, batches <= 38 (batch 39 held out)', items }, null, 1) + '\n');
    console.log(caseId, `items ${items.length}/${known.size}`, `answers ${items.reduce((s, i) => s + i.answers.length, 0)}`, `notAnswers ${items.reduce((s, i) => s + i.notAnswers.length, 0)}`, `$${usd.toFixed(3)}`, `${Date.now() - t0} ms`, r.model);
  }
}
void main();
