// Copies authored drill items from /drill-items into drill_items
// (docs/prd-drills.md "Content system"). Idempotent:
//   - a new item_id@version is inserted;
//   - an existing one may only change status or is_example — any other edit
//     needs a new version, since attempts record the version they saw.
//
//   npm run db:seed-drill-items
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillItems } from '@/db/schema';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { TAXONOMY_VERSION } from '@/lib/drills/config';
import type { Item } from '@/lib/drills/item-schema';

// jsonb doesn't keep key order, so compare with keys sorted.
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]))
    : v;
const content = (item: Item) => JSON.stringify(canonical({ ...item, status: undefined, is_example: undefined }));

async function main() {
  const items = loadAuthoredItems();
  let inserted = 0, updated = 0, unchanged = 0;
  const conflicts: string[] = [];

  for (const item of items) {
    const where = and(eq(drillItems.itemId, item.item_id), eq(drillItems.version, item.version));
    const [row] = await db.select().from(drillItems).where(where);
    if (!row) {
      await db.insert(drillItems).values({
        itemId: item.item_id, version: item.version, drillId: item.drill_id, status: item.status,
        isExample: item.is_example, tier: item.tier, skills: item.skills, payload: item,
        authorship: item.authorship ?? {}, taxonomyVersion: TAXONOMY_VERSION,
      });
      inserted++;
      continue;
    }
    if (content(row.payload as Item) !== content(item)) {
      conflicts.push(`${item.item_id}@${item.version}: content changed; bump "version" to publish the edit`);
      continue;
    }
    if (row.status !== item.status || row.isExample !== item.is_example) {
      await db.update(drillItems).set({ status: item.status, isExample: item.is_example, payload: item }).where(where);
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`drill items: ${inserted} inserted, ${updated} status updated, ${unchanged} unchanged, ${conflicts.length} conflicts`);
  if (conflicts.length) {
    console.error(conflicts.join('\n'));
    process.exitCode = 1;
  }
}

main().then(() => process.exit()).catch(e => { console.error(e); process.exit(1); });
