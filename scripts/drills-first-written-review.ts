// The one-time update when EX-4 and CL-4 go live (Matt, 2026-11-10, D3):
// a student Mastered or Validated on EX.takeaway or CL.next_step reached it
// on multiple choice alone, so their next spaced review, which will now be
// the written drill, is due now rather than 14 days after their last set.
// The engine serves that first written review at tier 2 (nextSetFor).
// Read-only unless --apply; run once, at ship time, with Matt's go.
//
//   npm run drills:first-written-review            list who it would touch
//   npm run drills:first-written-review -- --apply make their reviews due now
import { and, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { skillStates } from '@/db/schema';

const SKILLS = ['EX.takeaway', 'CL.next_step'];
const apply = process.argv.includes('--apply');

async function main() {
  const where = and(inArray(skillStates.skillId, SKILLS), inArray(skillStates.state, ['mastered', 'validated']));
  const rows = await db.select({ skill: skillStates.skillId, state: skillStates.state, due: skillStates.nextReviewAt }).from(skillStates).where(where);
  console.log(`${rows.length} skill state${rows.length === 1 ? '' : 's'} at Mastered or Validated on ${SKILLS.join(' or ')}`);
  for (const r of rows) console.log(`- ${r.skill} ${r.state}, review due ${r.due?.toISOString() ?? 'never set'}`);
  if (!apply) { console.log('\nDry run: nothing changed. Add --apply to make these reviews due now.'); return; }
  const updated = await db.update(skillStates).set({ nextReviewAt: sql`now()` }).where(where).returning({ skill: skillStates.skillId });
  console.log(`\nUpdated ${updated.length}: their next review is due now.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
