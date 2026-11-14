// Runs a smoke or the a11y audit with drills whose items aren't in the
// database yet (approved in the repo, seeded only after the deploy): each of
// their items missing from drill_items is inserted as a draft for the run and
// deleted afterwards, whatever the command's outcome. Drafts are served only
// with DRILLS_PREVIEW_DRAFTS=1 outside production, so production never sees
// them. Rows that already exist are left alone.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/smoke-with-items.ts EX-4,EX-5,CL-4 -- npm run drills:smoke:d2
import { spawnSync } from 'child_process';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillItems } from '@/db/schema';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { TAXONOMY_VERSION, getDrill } from '@/lib/drills/config';

const sep = process.argv.indexOf('--');
const drillIds = (process.argv[2] ?? '').split(',').filter(Boolean);
const command = sep > 0 ? process.argv.slice(sep + 1) : [];

async function main() {
  if (!drillIds.length || !command.length) {
    console.log('Usage: smoke-with-items.ts <drill ids, comma-separated> -- <command>');
    process.exit(1);
  }
  const items = loadAuthoredItems().filter(i => drillIds.includes(i.drill_id));
  const added: { itemId: string; version: number }[] = [];
  let code = 1;
  try {
    for (const item of items) {
      const [row] = await db.select({ itemId: drillItems.itemId }).from(drillItems)
        .where(and(eq(drillItems.itemId, item.item_id), eq(drillItems.version, item.version)));
      if (row) continue;
      await db.insert(drillItems).values({
        itemId: item.item_id, version: item.version, drillId: item.drill_id, status: 'draft',
        isExample: item.is_example, tier: item.tier, skills: item.skills, payload: { ...item, status: 'draft' },
        authorship: item.authorship ?? {}, taxonomyVersion: TAXONOMY_VERSION,
        stage: getDrill(item.drill_id).stage, industry: item.industry ?? null,
      });
      added.push({ itemId: item.item_id, version: item.version });
    }
    console.log(`smoke-with-items: ${added.length} draft row(s) added for ${drillIds.join(', ')}`);
    const run = spawnSync(command[0], command.slice(1), { stdio: 'inherit', env: { ...process.env, DRILLS_PREVIEW_DRAFTS: '1' } });
    code = run.status ?? 1;
  } finally {
    // Every authored item has one version on disk, so the item ids pick out exactly the rows added.
    if (added.length) await db.delete(drillItems).where(and(inArray(drillItems.itemId, added.map(a => a.itemId)), eq(drillItems.status, 'draft')));
    const left = added.length ? await db.select({ itemId: drillItems.itemId }).from(drillItems)
      .where(and(inArray(drillItems.itemId, added.map(a => a.itemId)), eq(drillItems.status, 'draft'))) : [];
    console.log(`smoke-with-items: ${added.length - left.length} of ${added.length} draft row(s) removed${left.length ? `; still there: ${left.map(r => r.itemId).join(', ')}` : ''}`);
  }
  process.exit(code);
}
main();
