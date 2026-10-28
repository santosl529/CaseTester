// Step 3 (Lorenzo, 27 Oct): the background judge (Sonnet 5.5, the arm-B prompt with prompt facts) on the candidate
// messages of the replay set — every turn where a correction could act (the candidate asked for data and the reply
// refused, said to assume, pointed, restated, or released and deferred nothing). Marks each verdict `inTime`: started
// when the interviewer's turn ended, back before the next message arrived. LLM_BUDGET_USD caps the spend.
//   LLM_BUDGET_USD=2 npx tsx --env-file=<env> scripts/xp-item-choice/async-judge.ts <out.json> <list of turn files, one a line>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { anthropicClient } from '@/lib/anthropic-client';
import { FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { requireRunBudget, BudgetExceededError } from '@/lib/llm-budget';
import { costOf } from '@/lib/llm-pricing';
import { SCHEMA, judgeSystem } from './judge-prompt';
const MODEL = 'claude-sonnet-5-5';
const ASK = /\?|\b(?:do we have|do we know|could i get|can i get|can we get|i'?d (?:also )?(?:want|need|like)|is there (?:any|a)|please share)\b/i;
const ACT = /I don't have|not something I have|reasonable assumption|sensible assumption|make an assumption|You'll find that on the exhibit|That one is on the exhibit|The exhibit already shows|The exhibit you have covers|That's covered on the exhibit|As I mentioned|As the exhibit shows|Repeating what I said|I'll say that again|Again, for reference|I gave you|That's on the exhibit|Reading the exhibit again|Again, from the exhibit/i;
type Turn = { turnIndex: number; candidateText: string; delivered: { text: string; revealIds?: string[]; exhibitId?: string }[]; stateBefore: { revealedIds: string[]; elapsedMs: number }; timing?: Record<string, number> };
async function main() {
  const [outPath, listPath] = process.argv.slice(2);
  const files = readFileSync(listPath, 'utf8').split('\n').filter(Boolean);
  requireRunBudget('xp-async-judge');
  const client = anthropicClient();
  const out: Record<string, unknown>[] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : [];
  const done = new Set(out.map(o => `${o.run}\u0000${o.turn}`));
  for (const f of files) {
    const caseId = JSON.parse(readFileSync(f.replace(/\.turns\.jsonl\.gz$/, '.json'), 'utf8')).session.caseId as string;
    const turns = gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Turn).filter(t => t.delivered && t.candidateText);
    for (let n = 0; n < turns.length; n++) {
      const t = turns[n], next = turns[n + 1];
      if (!next || `${f}\u0000${t.turnIndex}` === '' || done.has(`${f}\u0000${t.turnIndex}`)) continue;   // no next turn: nothing to correct
      const said = t.delivered.map(s => s.text).join(' ');
      const released = t.delivered.some(s => (s.revealIds?.length ?? 0) > 0 || s.exhibitId);
      if (!ASK.test(t.candidateText) || !(ACT.test(said) || !released)) continue;
      const revealedAfter = [...new Set([...t.stateBefore.revealedIds, ...t.delivered.flatMap(s => s.revealIds ?? [])])];
      const t0 = Date.now();
      let r: { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
      try {
        r = await client.beta.messages.create({ model: MODEL, max_tokens: 1024, betas: [FALLBACK_BETA], fallbacks: FALLBACKS, thinking: { type: 'between_tools' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          system: [{ type: 'text', text: judgeSystem(caseId, true), cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Items already given to the candidate: ${JSON.stringify(revealedAfter)}\n\nCandidate's message:\n${t.candidateText}` }] } as never) as never;
      } catch (e) { if (e instanceof BudgetExceededError) { console.log('budget reached: stop'); writeFileSync(outPath, JSON.stringify(out, null, 1)); return; } throw e; }
      const latencyMs = Date.now() - t0;
      const u = r.usage;
      const usd = costOf({ model: MODEL, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 } as never);
      let verdict: unknown = null;
      try { verdict = JSON.parse(r.content.filter(b => b.type === 'text').map(b => b.text).join('')); } catch { verdict = null; }
      // Starts when this interviewer turn ends (its last mark), lands before the next message arrives.
      const endMs = Math.max(0, ...Object.values(t.timing ?? {}).filter(v => typeof v === 'number'));
      const gapMs = next.stateBefore.elapsedMs - t.stateBefore.elapsedMs - endMs;
      out.push({ run: f, turn: t.turnIndex, caseId, candidateText: t.candidateText, verdict, latencyMs, usd, gapMs, inTime: latencyMs <= gapMs });
      writeFileSync(outPath, JSON.stringify(out, null, 1));
    }
  }
  console.log('verdicts', out.length);
}
void main();
