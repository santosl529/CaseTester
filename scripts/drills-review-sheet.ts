// A review sheet for draft choice-drill items (docs/drills-content/
// sy1-drafts-review.csv): one row per draft with its prompt, every option with
// its tag and feedback, and the explanation, generated from /drill-items so it
// can't fall behind them (tests/drills/authored.test.ts checks it). The
// "what_changed" column is the reviewer's note, kept from the existing sheet.
//
//   npm run drills:review-sheet
import fs from 'fs';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { parseCsv } from '@/lib/drills/content-import';
import { reviewSheetRows, REVIEW_SHEET_COLUMNS } from '@/lib/drills/review-sheet';

const FILE = 'docs/drills-content/sy1-drafts-review.csv';
const notes = new Map((fs.existsSync(FILE) ? parseCsv(fs.readFileSync(FILE, 'utf-8')) : []).map(r => [r.item_id, r.what_changed]));
const rows = reviewSheetRows(loadAuthoredItems(), 'SY-1', notes);
const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
fs.writeFileSync(FILE, [REVIEW_SHEET_COLUMNS.join(','), ...rows.map(r => REVIEW_SHEET_COLUMNS.map(c => cell(r[c] ?? '')).join(','))].join('\n') + '\n');
console.log(`${FILE}: ${rows.length} draft items`);
