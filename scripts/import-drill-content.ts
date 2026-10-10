// Imports D2 drill content from the CSV templates (docs/drills-content-templates
// README) into /drill-items (questions) and /drill-golden (graded sample
// answers). Re-running is safe: draft items are rewritten; an item that is
// already in review or live is never overwritten (edit it, bump its version).
//
//   npm run drills:import -- <folder with the CSVs> [--include-examples] [--dry-run]
import fs from 'fs';
import path from 'path';
import { importContent, parseCsv, type Tables } from '@/lib/drills/content-import';

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--')) ?? 'docs/drills-content-templates';
const includeExamples = args.includes('--include-examples');
const dryRun = args.includes('--dry-run');

const tables: Tables = {};
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.csv'))) {
  tables[path.basename(file, '.csv')] = parseCsv(fs.readFileSync(path.join(dir, file), 'utf-8'));
}
const { items, golden, problems } = importContent(tables, { includeExamples });

let written = 0, kept = 0;
for (const item of items) {
  const file = path.join('drill-items', item.drill_id, `${item.item_id}.json`);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (existing.status !== 'draft') {
      problems.push({ file, row: item.item_id, message: `already ${existing.status}; edit the JSON and bump "version" instead of re-importing` });
      kept++;
      continue;
    }
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(item, null, 2) + '\n');
  }
  written++;
}
for (const g of golden) {
  const file = path.join('drill-golden', g.drill_id, `${g.answer_id}.json`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(g, null, 2) + '\n');
  }
}

const byDrill = (xs: { drill_id: string }[]) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ({ ...a, [x.drill_id]: (a[x.drill_id] ?? 0) + 1 }), {})).map(([d, n]) => `${d} ${n}`).join(', ') || 'none';
console.log(`${dryRun ? '[dry run] ' : ''}questions: ${written} written (${byDrill(items)}), ${kept} left as they were`);
console.log(`graded answers: ${golden.length} (${byDrill(golden)})`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`- ${p.file} ${p.row}: ${p.message}`);
  process.exitCode = 1;
}
