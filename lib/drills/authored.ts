// Authored drill items (docs/prd-drills.md "Authored items"): human-reviewed
// JSON in /drill-items/<drill id>/, validated against ItemSchema on load the
// way /cases is (lib/cases/loader.ts). A malformed item fails the load.
// `npm run db:seed-drill-items` copies them into drill_items, which is what
// sets are served from. A content admin UI replaces the files later.
import 'server-only';
import fs from 'fs';
import path from 'path';
import { ItemSchema, type Item } from './item-schema';
import { getDrill } from './config';

export const DRILL_ITEMS_DIR = path.join(process.cwd(), 'drill-items');

export function parseAuthoredItems(files: { file: string; raw: unknown }[]): Item[] {
  const items = files.map(({ file, raw }) => {
    const result = ItemSchema.safeParse(raw);
    if (!result.success) throw new Error(`Malformed drill item ${file}: ${result.error.message}`);
    const item = result.data;
    const folder = path.basename(path.dirname(file));
    if (folder !== item.drill_id) throw new Error(`Drill item ${file}: drill_id ${item.drill_id} is filed under ${folder}`);
    if (getDrill(item.drill_id).item_source === 'generated') throw new Error(`Drill item ${file}: ${item.drill_id} is fully generated`);
    return item;
  });

  const seen = new Set<string>();
  const examples = new Map<string, string>();
  for (const item of items) {
    const key = `${item.item_id}@${item.version}`;
    if (seen.has(key)) throw new Error(`Duplicate drill item ${key}`);
    seen.add(key);
    // One worked example per drill, never served in a set.
    if (item.is_example) {
      const other = examples.get(item.drill_id);
      if (other && other !== item.item_id) throw new Error(`${item.drill_id} has two worked examples: ${other} and ${item.item_id}`);
      examples.set(item.drill_id, item.item_id);
    }
  }
  return items;
}

export function loadAuthoredItems(dir = DRILL_ITEMS_DIR): Item[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .flatMap(d => fs.readdirSync(path.join(dir, d.name)).filter(f => f.endsWith('.json')).map(f => path.join(dir, d.name, f)));
  return parseAuthoredItems(files.map(file => ({ file, raw: JSON.parse(fs.readFileSync(file, 'utf-8')) })));
}

// Option length must not give the answer away. Drafted pools had the right
// answer as the longest option in 39–40 of 40 items, so a student could pass by
// picking the longest. For choice drills, across a pool of 20+ items, the right
// answer may be the longest (or the shortest) option in at most half of them;
// chance is 1 in the number of options.
export const LENGTH_CUE_MAX_SHARE = 0.5;
const LENGTH_CUE_MIN_POOL = 20;

export function lengthCueProblems(items: Item[]): string[] {
  const byDrill = new Map<string, Item[]>();
  for (const item of items) {
    if (item.options.length < 3) continue;
    byDrill.set(item.drill_id, [...(byDrill.get(item.drill_id) ?? []), item]);
  }
  const problems: string[] = [];
  for (const [drill, pool] of byDrill) {
    if (pool.length < LENGTH_CUE_MIN_POOL) continue;
    const rank = (item: Item) => [...item.options].sort((a, b) => a.text.length - b.text.length);
    const longest = pool.filter(i => rank(i).at(-1)!.correct).length;
    const shortest = pool.filter(i => rank(i)[0].correct).length;
    for (const [which, n] of [['longest', longest], ['shortest', shortest]] as const) {
      if (n / pool.length > LENGTH_CUE_MAX_SHARE) {
        problems.push(`${drill}: the right answer is the ${which} option in ${n} of ${pool.length} items (max ${Math.round(LENGTH_CUE_MAX_SHARE * 100)}%)`);
      }
    }
  }
  return problems;
}

