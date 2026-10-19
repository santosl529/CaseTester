// Labeled disputes → the golden sets (D6 pilot feedback). Each report Matt
// labeled in the review queue (/drills/review/reports) whose answer was
// AI-graded becomes drill-golden/<drill>/dispute-<id>.json: the student's
// answer with Matt's labels, answer_type "dispute". A follow-up reply's
// labels go in a second file, part "defend", as the golden sets keep them.
// The importer never deletes these files; `npm run drills:golden` grades them.
//
//   npm run drills:export-disputes            write and mark exported
//   npm run drills:export-disputes -- --dry   list what would be written
import fs from 'fs';
import path from 'path';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillItemReports, drillSets } from '@/db/schema';
import { GoldenAnswerSchema } from '@/lib/drills/content-import';

const dry = process.argv.includes('--dry');
const REASON = { answer_key_wrong: 'answer key is wrong', question_confusing: 'question is confusing', grade_unfair: 'grade seems unfair', other: 'other' } as const;

async function main() {
  const rows = await db.select({ report: drillItemReports, attempt: drillAttempts, drillId: drillSets.drillId })
    .from(drillItemReports)
    .innerJoin(drillSets, eq(drillSets.id, drillItemReports.setId))
    .innerJoin(drillAttempts, eq(drillAttempts.id, drillItemReports.attemptId))
    .where(and(eq(drillItemReports.status, 'labeled'), isNull(drillItemReports.exportedAt)));
  let written = 0;
  for (const { report, attempt, drillId } of rows) {
    const labels = (report.labels ?? {}) as Record<string, boolean>;
    if (!report.itemId || Object.keys(labels).length === 0) {
      console.log(`skip ${report.id}: ${report.itemId ? 'no labels' : 'a generated item'} (golden sets hold authored items)`);
      continue;
    }
    const responses = (attempt.response as { steps?: unknown[] } | null)?.steps ?? [];
    const short = report.id.slice(0, 8);
    const notes = `Disputed by a student (${REASON[report.reason]}${report.comment ? `: "${report.comment}"` : ''}), item version ${report.itemVersion}. Matt: ${report.reviewerNotes ?? 'no note'}.`;
    const parts = [
      { part: 'main' as const, labels: Object.fromEntries(Object.entries(labels).filter(([k]) => !k.startsWith('defend_'))) },
      { part: 'defend' as const, labels: Object.fromEntries(Object.entries(labels).filter(([k]) => k.startsWith('defend_'))) },
    ].filter(p => Object.keys(p.labels).length > 0);
    for (const p of parts) {
      const golden = GoldenAnswerSchema.parse({
        answer_id: `dispute-${short}${p.part === 'defend' ? '-d' : ''}`, item_id: report.itemId, drill_id: drillId, answer_type: 'dispute',
        responses, labels: p.labels, red_flags: p.part === 'main' ? (report.redFlags ?? {}) : {}, family: null, notes, part: p.part,
      });
      const file = path.join('drill-golden', drillId, `${golden.answer_id}.json`);
      console.log(`${dry ? 'would write' : 'write'} ${file}`);
      if (!dry) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(p.part === 'main' ? { ...golden, part: undefined } : golden, null, 2) + '\n');
      }
      written++;
    }
    if (!dry) await db.update(drillItemReports).set({ exportedAt: new Date() }).where(eq(drillItemReports.id, report.id));
  }
  console.log(`${written} golden answer(s) ${dry ? 'to write' : 'written'} from ${rows.length} labeled report(s).`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
