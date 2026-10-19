// Clean-room similarity check for authored drill items (docs/prd-drills.md
// "Authored items"). Asks Claude whether each item closely resembles
// well-known published case-prep material, and records the result on the
// item's authorship: passed, or flagged with a note for a human to review.
// A flagged live item goes back to in_review, since a live item must pass.
// Generated items are built from our own templates and aren't checked.
//
// It relies on the model's knowledge of published material plus a few web
// searches per item; it can still miss paywalled or unindexed material.
//
//   npm run drills:similarity                 items pending or not yet web-checked
//   npm run drills:similarity -- --all        every authored item again
//   npm run drills:similarity -- ps1-0011 …   just these items
//   add --no-web to skip the web search (cheaper, misses less famous cases)
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';

const MODEL_ID = 'claude-opus-5-5';
const CONCURRENCY = 6;
const DIR = path.join(process.cwd(), 'drill-items');

const SYSTEM = `You check practice items for a case-interview training app for originality. The app's content must be its own: it must not copy or closely adapt published case-prep material, such as RocketBlocks drills, CaseCoach, Hacking the Case Interview, Management Consulted, Case in Point, Case Interview Secrets, consulting firms' published practice cases (McKinsey, BCG, Bain, Oliver Wyman, Deloitte, Kearney, L.E.K., Roland Berger, Strategy&, Accenture and others), university consulting-club casebooks, or similar.

For the item you're given, decide whether it closely resembles a specific piece of published material you know of.

Firm practice cases are the most likely source. Before deciding, recall the official practice cases you know from each firm and compare their premises (the client, the decision it faces, and the key numbers) with this item's.

Flag it only for close resemblance:
- the same distinctive premise as a published case (for example, the same kind of client facing the same specific decision), even if the wording and some numbers differ;
- the same distinctive scenario with the same or nearly the same numbers, facts or answer choices;
- text that is the same or nearly the same as published text;
- a well-known named case or exercise reproduced with light changes.

Do not flag what every case-prep source shares: common business situations (a chain whose profit fell, a market-entry decision, a pricing change), standard frameworks (profit trees, the 4Ps, SWOT), standard metrics, or common sizing questions with their own numbers. Generic resemblance is expected and fine.

If you aren't confident of a specific source, don't flag. When you flag, name the source and what in the item matches it.`;

const OutputSchema = z.object({
  verdict: z.enum(['clear', 'flag']),
  resembles: z.string().describe('For a flag: the source and the specific material it matches. Empty when clear.'),
  reason: z.string().describe('One or two sentences.'),
});
const OUTPUT_FORMAT = betaZodOutputFormat(OutputSchema);

function render(item: Item): string {
  const parts = [`Drill: ${item.drill_id}`, `Question: ${item.prompt}`];
  if (item.exhibit) parts.push(`Exhibit: ${JSON.stringify(item.exhibit)}`);
  if (item.options.length) parts.push(`Options:\n${item.options.map(o => `- ${o.text}`).join('\n')}`);
  // Repair items: the flawed answer the student edits.
  if (typeof item.extras.flawed_answer === 'string') parts.push(`Answer to fix: ${item.extras.flawed_answer}`);
  if (item.defend) parts.push(`Interviewer follow-up: ${item.defend.text}\nModel reply: ${item.defend.model_reply}`);
  if (item.model_answer) parts.push(`Model answer: ${item.model_answer}`);
  parts.push(`Explanation: ${item.explanation}`);
  return parts.join('\n\n');
}

const client = new Anthropic();
const usage = { input: 0, output: 0, searches: 0 };
// Opus 5.5, per million tokens.
const PRICE = { input: 4, output: 20, search: 0.01 };

// The model also searches the web for published cases with the same premise:
// its own knowledge misses less famous firm cases (without search it passed
// Oliver Wyman's supermarket pharmacy case). --no-web skips the search.
const WEB = !process.argv.includes('--no-web');
const WEB_NOTE = `\n\nYou can search the web. Search for published practice cases with this item's premise (for example "<client type> <decision> practice case" or "<client type> case interview"), especially on consulting firms' careers pages and case-prep sites, before deciding.`;

async function check(item: Item): Promise<z.infer<typeof OutputSchema>> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: render(item) }];
  let response;
  // A server-side search can pause a long turn; send it back to continue.
  for (let turn = 0; turn < 4; turn++) {
    response = await client.beta.messages.stream({
      model: MODEL_ID,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: WEB ? SYSTEM + WEB_NOTE : SYSTEM,
      messages,
      output_config: { format: OUTPUT_FORMAT, effort: 'high' },
      ...(WEB && { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 4 }] }),
      betas: [FALLBACK_BETA],
      fallbacks: FALLBACKS,
    }).finalMessage();
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.searches += response.usage.server_tool_use?.web_search_requests ?? 0;
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  if (!response) throw new Error('no response');
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error(`no verdict (stop reason ${response.stop_reason})`);
  }
  return response.parsed_output;
}

function files(): string[] {
  return fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    .flatMap(d => fs.readdirSync(path.join(DIR, d.name)).filter(f => f.endsWith('.json')).map(f => path.join(DIR, d.name, f)));
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const ids = new Set(args.filter(a => !a.startsWith('--')));
  // Validated as not live: a live item that hasn't passed yet is exactly what
  // this script exists to fix, so the live-item rule mustn't block reading it.
  const read = (file: string) => {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return ItemSchema.parse({ ...raw, status: raw.status === 'live' ? 'in_review' : raw.status });
  };
  const targets = files().map(file => ({ file, item: read(file) }))
    .filter(({ item }) => item.generator === null && item.authorship)
    // By default: anything pending, and (when searching) anything not yet
    // checked with web search.
    .filter(({ item }) => (ids.size ? ids.has(item.item_id)
      : all || item.authorship!.similarity_check === 'pending' || (WEB && item.authorship!.similarity_method !== 'web' && item.authorship!.similarity_check === 'passed')));
  console.log(`Checking ${targets.length} authored items with ${MODEL_ID}…`);

  const today = new Date().toISOString().slice(0, 10);
  const flagged: string[] = [];
  const errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < targets.length) {
      const { file, item } = targets[next++];
      try {
        const v = await check(item);
        // Write the raw JSON back with only these fields changed, so the file
        // keeps its shape.
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        raw.authorship = {
          ...raw.authorship,
          similarity_check: v.verdict === 'clear' ? 'passed' : 'flagged',
          similarity_note: v.verdict === 'clear' ? null : `${v.resembles} — ${v.reason}`,
          similarity_checked_at: today,
          similarity_method: WEB ? 'web' : 'knowledge',
        };
        if (v.verdict === 'flag') {
          if (raw.status === 'live') raw.status = 'in_review';
          flagged.push(`${item.item_id}: ${v.resembles} — ${v.reason}`);
        }
        fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      } catch (e) {
        errors.push(`${item.item_id}: ${(e as Error).message}`);
      }
    }
  }));

  const cost = (usage.input * PRICE.input + usage.output * PRICE.output) / 1_000_000 + usage.searches * PRICE.search;
  console.log(`\n${targets.length - flagged.length - errors.length} passed, ${flagged.length} flagged, ${errors.length} errors (about $${cost.toFixed(2)})`);
  if (flagged.length) console.log(`\nFlagged for review:\n${flagged.sort().join('\n')}`);
  if (errors.length) { console.log(`\nNot checked (still pending):\n${errors.join('\n')}`); process.exitCode = 1; }
}

main();
