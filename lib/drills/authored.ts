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

// The wording checks (length, phrase, rule player) live in content-checks.ts,
// which the review page script can import too.
export { contentCheckProblems, lengthCueProblems } from './content-checks';
