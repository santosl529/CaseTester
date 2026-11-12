// Matt's blind labels against Claude's (the next-7 golden-set plan): Matt
// labels a set of answers in docs/drills-content/blind/<drill>-blind.csv
// before seeing Claude's labels for them, which wait in blind/claude/ under
// the same file name (then that drill's graded-answers CSV, once merged).
// A cell Matt isn't asked to label reads "(yours)". Lists, per column, where the
// two disagree. A disagreement means a rule needs clarifying before the gate
// runs; neither label moves to match the other until it is settled.
//
//   npx tsx scripts/drills-blind-compare.ts [ex4 cl4 …]   (default: every blind sheet)
import fs from 'fs';
import path from 'path';
import { parseCsv } from '@/lib/drills/content-import';

const DIR = 'docs/drills-content';
const BLIND = path.join(DIR, 'blind');
// Columns that hold the answer and its context, not a label.
const NOT_LABELS = new Set(['answer_id', 'item_id', 'answer_type', 'answer', 'stage1_answer', 'stage2_action', 'stage2_answer', 'main_answer', 'main_decision', 'main_stage2', 'decision', 'reply', 'notes']);
const norm = (v: string) => (/^(y|yes|true|1)$/i.test(v) ? 'Y' : /^(n|no|false|0)$/i.test(v) ? 'N' : v.trim().toLowerCase());

const only = process.argv.slice(2);
const sheets = fs.existsSync(BLIND) ? fs.readdirSync(BLIND).filter(f => f.endsWith('-blind.csv') && (!only.length || only.includes(f.replace('-blind.csv', '')))) : [];
if (!sheets.length) { console.log(`No blind sheets in ${BLIND}.`); process.exit(0); }
let disagreements = 0, compared = 0, unlabeled = 0;
for (const sheet of sheets) {
  const drill = sheet.replace('-blind.csv', '');
  const held = path.join(BLIND, 'claude', sheet);
  const golden = fs.existsSync(held) ? held
    : drill.endsWith('-defend') ? path.join(DIR, 'defend-graded-answers.csv') : path.join(DIR, `${drill}-graded-answers.csv`);
  const claude = new Map(parseCsv(fs.readFileSync(golden, 'utf-8')).map(r => [r.answer_id, r]));
  console.log(`\n${sheet} against ${path.basename(golden)}`);
  for (const r of parseCsv(fs.readFileSync(path.join(BLIND, sheet), 'utf-8'))) {
    const c = claude.get(r.answer_id);
    if (!c) { console.log(`- ${r.answer_id}: no label of Claude's yet`); continue; }
    for (const col of Object.keys(r).filter(k => !NOT_LABELS.has(k))) {
      if (r[col] === '(yours)') continue;
      if (!r[col]) { unlabeled++; continue; }
      compared++;
      if (norm(r[col]) !== norm(c[col] ?? '')) {
        disagreements++;
        console.log(`- ${r.answer_id} ${col}: Matt ${r[col]}, Claude ${c[col] || '(blank)'}${c.notes ? ` (Claude's note: ${c.notes})` : ''}`);
      }
    }
  }
}
console.log(`\n${compared} labels compared, ${disagreements} disagreements${unlabeled ? `, ${unlabeled} left blank` : ''}.`);
