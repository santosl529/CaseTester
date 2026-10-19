// Imports D2 and D5 drill content from the CSV templates
// (docs/drills-content-templates README) into /drill-items (questions) and
// /drill-golden (graded sample answers). Re-running is safe: draft items are
// rewritten; an item that is already in review or live is never overwritten
// (edit it, bump its version). The one exception: a reviewed item whose only
// changes are ones students never see (its Defend follow-up from defend.csv,
// its grading rules, or the wording of its check questions) is written as a
// new draft version, keeping its similarity check, for review.
//
//   npm run drills:import -- <folder with the CSVs> [--include-examples] [--dry-run]
import fs from 'fs';
import path from 'path';
import { importContent, parseCsv, type Tables } from '@/lib/drills/content-import';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--')) ?? 'docs/drills-content-templates';
const includeExamples = args.includes('--include-examples');
const dryRun = args.includes('--dry-run');

const tables: Tables = {};
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.csv'))) {
  tables[path.basename(file, '.csv')] = parseCsv(fs.readFileSync(path.join(dir, file), 'utf-8'));
}
// Repair items are derived from the authored Level 1 items on disk.
const sources = new Map<string, Item>();
for (const drill of ['PS-1', 'HY-1', 'SY-1']) {
  const folder = path.join('drill-items', drill);
  for (const f of fs.existsSync(folder) ? fs.readdirSync(folder).filter(f => f.endsWith('.json')) : []) {
    const item = ItemSchema.parse(JSON.parse(fs.readFileSync(path.join(folder, f), 'utf-8')));
    sources.set(item.item_id, item);
  }
}
const { items, golden, problems } = importContent(tables, { includeExamples, sources });

// An item's content, apart from its review state, industry tag and version,
// with keys sorted: a file's key order (kept for small review diffs) can
// differ from a freshly built item's, and that alone once made six unchanged
// live SY-2 items look edited and get new versions.
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const content = (i: Record<string, unknown>) => JSON.stringify(canonical({ ...i, status: undefined, authorship: undefined, version: undefined, industry: undefined }));
// What students see: the item without its follow-up, grading rules or check
// questions (the grader's text).
const studentFacing = (i: Record<string, unknown>) => {
  const extras = { ...(i.extras as Record<string, unknown>), grading_rules: undefined };
  const checks = (i.checks as Record<string, unknown>[] | undefined)?.map(c => ({ ...c, question: undefined }));
  return content({ ...i, defend: undefined, extras, checks });
};
// The new file in the old file's key order, so a review diff shows only what changed.
const inOrder = (existing: Record<string, unknown>, item: Record<string, unknown>) =>
  Object.fromEntries([...new Set([...Object.keys(existing), ...Object.keys(item)])].filter(k => item[k] !== undefined).map(k => [k, item[k]]));

let written = 0, kept = 0;
for (const item of items) {
  const file = path.join('drill-items', item.drill_id, `${item.item_id}.json`);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (existing.status !== 'draft') {
      if (content(existing) !== content(item) && studentFacing(existing) === studentFacing(item)) {
        // Only grader-facing text changed (follow-up, rules, check questions):
        // a new draft version for review. The case is unchanged, so its
        // similarity check carries over.
        Object.assign(item, {
          version: existing.version + 1, industry: existing.industry,
          authorship: { ...existing.authorship, author_of_record: 'Draft — awaiting human review', drafting_model: 'claude-opus-5-5', reviewed_by: null, reviewed_at: null },
        });
        if (!dryRun) fs.writeFileSync(file, JSON.stringify(inOrder(existing, item), null, 2) + '\n');
        written++;
        continue;
      }
      // Unchanged content is fine; a change to a reviewed item needs a new version.
      if (content(existing) !== content(item)) problems.push({ file, row: item.item_id, message: `already ${existing.status}; edit the JSON and bump "version" instead of re-importing` });
      kept++;
      continue;
    }
    // Same case and model answer: keep the review record (drafting model,
    // similarity check). A changed case starts over and is checked again.
    if (existing.prompt === item.prompt && existing.model_answer === item.model_answer) item.authorship = existing.authorship;
    // The industry tag is set by npm run drills:industry and Matt's review, not the CSV.
    if (existing.industry !== undefined && existing.prompt === item.prompt) (item as Record<string, unknown>).industry = existing.industry;
    // A draft may be a new version of a live item: keep its version number.
    item.version = existing.version;
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
    fs.writeFileSync(file, JSON.stringify(inOrder(existing, item), null, 2) + '\n');
  }
  written++;
}
for (const g of golden) {
  const file = path.join('drill-golden', g.drill_id, `${g.answer_id}.json`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // part defaults to "main"; only Defend answers spell it out.
    fs.writeFileSync(file, JSON.stringify(g.part === 'main' ? { ...g, part: undefined } : g, null, 2) + '\n');
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
