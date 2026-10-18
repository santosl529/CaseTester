// Tags every authored drill item with an industry (lib/drills/industries.ts)
// for transfer checks and the unfamiliar slot. Writes a CSV for Matt to
// check: every item the model is unsure about, plus a fixed random 50 of the
// rest. Item files are not changed; Matt reviews the CSV, then the reviewed
// tags are written into the item JSON (the `industry` field).
// By default only items with no `industry` field yet are tagged; --all retags
// everything (405 items, about $2.70: check with Matt before runs over $5).
//
//   npm run drills:industry            (new items only, about $0.007 each)
//   npm run drills:industry -- --all
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { INDUSTRIES } from '@/lib/drills/industries';
import { createRng } from '@/lib/drills/rng';

const MODEL_ID = 'claude-opus-5-5';
const CONCURRENCY = 6;
const DIR = path.join(process.cwd(), 'drill-items');
const OUT = path.join(process.cwd(), process.argv.includes('--all') ? 'docs/drills-content/industry-tags.csv' : 'docs/drills-content/industry-tags-new.csv');
const SAMPLE = 50;

const SYSTEM = `You tag practice items from a case-interview training app with the industry of the client in the item.

Pick exactly one industry from the list, by what the client sells or does, not by the business problem (a hospital's pricing question is still healthcare). For a market-sizing question with no client, tag the industry of the market being sized.

Placement rules (Matt, 2026-10-11):
- Restaurants, cafés, bakery chains, venues, attractions and sports teams → Airlines / Travel / Hospitality.
- Apps and online platforms → Tech / SaaS, unless they sell their own goods (→ Retail / E-commerce).
- Products households buy, including vehicles and farm products → Consumer / CPG. Products businesses buy → Industrials / Manufacturing.
- Stores and chains that sell goods → Retail / E-commerce.
- Schools, classes, lessons, tutoring and childcare → Public / Education / Nonprofit.
- A government running transport, hospitals or utilities → that sector. A government policy decision → Public / Education / Nonprofit.
- Professional services and vet care → Other. Consumer and local services (salons, gyms, laundromats, cleaning, repair, pest control) → Other.
- Investor or fund clients → the industry being invested in.

If the item never says what the client does or what market it is in (only generic revenue, cost or market figures), set stated to false and industry to Other.

Set sure to true when the rules above or the item make the choice clear. Set it to false only when two industries still fit about equally well. Give a one-sentence reason naming what in the item decided it.`;

const OutputSchema = z.object({
  industry: z.enum(INDUSTRIES),
  stated: z.boolean().describe('False when the item never says what the client does or what market it is in.'),
  sure: z.boolean(),
  reason: z.string().describe('One sentence.'),
});
const OUTPUT_FORMAT = betaZodOutputFormat(OutputSchema);

type Raw = { item_id: string; drill_id: string; prompt: string; industry?: string | null; exhibit?: unknown; options?: { text: string }[]; model_answer?: string | null; explanation?: string; extras?: Record<string, unknown>; generator?: unknown };

function render(item: Raw): string {
  const parts = [`Drill: ${item.drill_id}`, `Question: ${item.prompt}`];
  const extras = item.extras ?? {};
  for (const key of ['opening_facts', 'situation', 'client_question', 'facts']) {
    if (extras[key]) parts.push(`${key}: ${JSON.stringify(extras[key])}`);
  }
  if (item.exhibit) parts.push(`Exhibit: ${JSON.stringify(item.exhibit)}`);
  if (item.options?.length) parts.push(`Options:\n${item.options.map(o => `- ${o.text}`).join('\n')}`);
  if (item.model_answer) parts.push(`Model answer: ${item.model_answer}`);
  if (item.explanation) parts.push(`Explanation: ${item.explanation}`);
  return parts.join('\n\n');
}

const client = new Anthropic();
const usage = { input: 0, output: 0 };
const PRICE = { input: 4, output: 20 };   // Opus 5.5, per million tokens

async function tag(item: Raw) {
  const response = await client.beta.messages.parse({
    model: MODEL_ID,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content: render(item) }],
    // A short classification: low effort is enough.
    output_config: { format: OUTPUT_FORMAT, effort: 'low' },
    betas: [FALLBACK_BETA],
    fallbacks: FALLBACKS,
  });
  usage.input += response.usage.input_tokens;
  usage.output += response.usage.output_tokens;
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error(`no tag (stop reason ${response.stop_reason})`);
  return response.parsed_output;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function items(): { file: string; raw: Raw }[] {
  return fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    .flatMap(d => fs.readdirSync(path.join(DIR, d.name)).filter(f => f.endsWith('.json')).map(f => path.join(DIR, d.name, f)))
    .map(file => ({ file, raw: JSON.parse(fs.readFileSync(file, 'utf-8')) as Raw }))
    .filter(({ raw }) => !raw.generator && (process.argv.includes('--all') || raw.industry === undefined))
    .sort((a, b) => a.raw.item_id.localeCompare(b.raw.item_id));
}

async function run() {
  const targets = items();
  console.log(`Tagging ${targets.length} authored items with ${MODEL_ID}…`);
  const results = new Map<string, z.infer<typeof OutputSchema>>();
  const errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < targets.length) {
      const { raw } = targets[next++];
      try { results.set(raw.item_id, await tag(raw)); } catch (e) { errors.push(`${raw.item_id}: ${(e as Error).message}`); }
    }
  }));

  // Every unsure item, plus a fixed random 50 of the sure ones. Items that
  // name no client get no industry (they don't constrain transfer checks).
  const sure = targets.filter(t => results.get(t.raw.item_id)?.sure && results.get(t.raw.item_id)?.stated);
  const rng = createRng(20261011);
  const sample = new Set(rng.shuffle(sure.map(t => t.raw.item_id)).slice(0, SAMPLE));
  const rows = targets.filter(t => results.has(t.raw.item_id)).map(t => {
    const r = results.get(t.raw.item_id)!;
    const check = !r.stated ? 'no industry stated' : !r.sure ? 'unsure' : sample.has(t.raw.item_id) ? 'sample' : '';
    return [t.raw.item_id, t.raw.drill_id, r.stated ? r.industry : '', check, '', r.reason, t.raw.prompt.slice(0, 240)];
  });
  // Items to check first.
  const order = ['unsure', 'sample', 'no industry stated', ''];
  rows.sort((a, b) => order.indexOf(a[3]) - order.indexOf(b[3]));
  const header = ['item_id', 'drill', 'industry', 'check', 'matt_industry', 'reason', 'question'];
  fs.writeFileSync(OUT, [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n') + '\n');

  const counts = new Map<string, number>();
  for (const r of results.values()) { const k = r.stated ? r.industry : '(no industry stated)'; counts.set(k, (counts.get(k) ?? 0) + 1); }
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}: ${rows.length} items, ${rows.filter(r => r[3] === 'unsure').length} unsure, ${rows.filter(r => r[3] === 'sample').length} sampled, ${rows.filter(r => r[3] === 'no industry stated').length} with no industry stated.`);
  console.log([...counts].sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  if (errors.length) console.log(`\n${errors.length} errors:\n${errors.join('\n')}`);
  console.log(`\nCost: about $${((usage.input * PRICE.input + usage.output * PRICE.output) / 1e6).toFixed(2)} (${usage.input} input, ${usage.output} output tokens).`);
}

run().catch(e => { console.error(e); process.exit(1); });
