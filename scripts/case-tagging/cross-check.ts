// Second-model cross-check of the case tagging golden labels (Matt, 15 Nov:
// "cross-check with a second model (as for the drill gates) and send me only
// the disagreements"). Claude Opus 5.5 labels every golden point from the
// written rules alone (the tagging step's own instructions), never seeing
// Claude's labels; the script lists where the two disagree. Matt rules on each
// disagreement; neither label moves to match the other until he has. Costs
// real money: ask Matt first. Stops before a call that would pass --cap.
//
//   npx tsx --conditions=react-server --env-file=../../../.env.local scripts/case-tagging/cross-check.ts [--cap 5] [--out case-tagging/golden/cross-check.json]
import fs from 'fs';
import path from 'path';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { anthropicClient } from '@/lib/anthropic-client';
import { costOf } from '@/lib/llm-pricing';
import { CASE_TAGS } from '@/lib/scoring/skill-tag-rules';
import { TAGGER_SYSTEM, pointsBlock, type TagPoint } from '@/lib/scoring/skill-tags';
import { isWrongSkill } from '@/lib/scoring/skill-tag-gate';

const MODEL_ID = 'claude-opus-5-5';
const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const CAP = Number(arg('--cap', '5'));
const OUT = arg('--out', 'case-tagging/golden/cross-check.json');
const BATCH = 10;
const CONCURRENCY = 3;

const OutputSchema = z.object({
  points: z.array(z.object({ id: z.string(), reason: z.string(), tag: z.enum(['none', ...CASE_TAGS] as [string, ...string[]]) })),
});

type Golden = TagPoint & { label: string | null; rule: string };

async function main() {
  const golden = JSON.parse(fs.readFileSync('case-tagging/golden/golden.json', 'utf-8')) as Golden[];
  const batches: Golden[][] = [];
  for (let i = 0; i < golden.length; i += BATCH) batches.push(golden.slice(i, i + BATCH));
  const client = anthropicClient({ maxRetries: 2 });
  const labels = new Map<string, { tag: string | null; reason: string }>();
  const failures: string[] = [];
  let spent = 0, next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      if (spent >= CAP) { failures.push(`${batch[0].id}…: skipped, cap $${CAP} reached`); continue; }
      try {
        const response = await client.beta.messages.stream({
          model: MODEL_ID,
          max_tokens: 32000,
          system: [{ type: 'text', text: TAGGER_SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `<points>\n${pointsBlock(batch)}\n</points>` }],
          output_config: { format: betaZodOutputFormat(OutputSchema), effort: 'high' },
        }).finalMessage();
        spent += costOf({ model: MODEL_ID, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0 });
        if (!response.model.startsWith(MODEL_ID)) throw new Error(`answered by ${response.model}`);
        if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error(`no labels (stop reason ${response.stop_reason})`);
        for (const p of response.parsed_output.points) labels.set(p.id, { tag: p.tag === 'none' ? null : p.tag, reason: p.reason });
      } catch (e) {
        failures.push(`${batch[0].id}…: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const rows = golden.filter(g => labels.has(g.id)).map(g => {
    const o = labels.get(g.id)!;
    return { id: g.id, group: g.dimension ?? 'topFix', rating: g.rating, point: g.point, quotes: g.quotes,
      claude: g.label, claude_rule: g.rule, opus: o.tag, opus_reason: o.reason,
      agree: o.tag === g.label, different_skill: isWrongSkill(g.label, o.tag) || isWrongSkill(o.tag, g.label) };
  });
  const disagreements = rows.filter(r => !r.agree);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL_ID, cost_usd: spent, labelled: rows.length, of: golden.length, failures, disagreements }, null, 2) + '\n');
  console.log(`${MODEL_ID}: labeled ${rows.length}/${golden.length}, $${spent.toFixed(2)}`);
  console.log(`agree ${rows.length - disagreements.length}, disagree ${disagreements.length} (${disagreements.filter(d => d.different_skill).length} on the skill)`);
  if (failures.length) console.log(`failed batches:\n  ${failures.join('\n  ')}`);
  console.log(`wrote ${OUT}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
