// Copies authored drill items from /drill-items into drill_items
// (docs/prd-drills.md "Content system"). Idempotent:
//   - a new item_id@version is inserted;
//   - an existing one may only change status, is_example or authorship (the
//     review record) — any other edit needs a new version, since attempts
//     record the version they saw;
//   - except a draft no attempt has used yet, which is updated in place;
//   - when a newer version is live, older live versions are retired.
//
//   npm run db:seed-drill-items
import { and, count, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { drillAttempts, drillItems } from '@/db/schema';
import { contentCheckProblems, loadAuthoredItems } from '@/lib/drills/authored';
import { TAXONOMY_VERSION } from '@/lib/drills/config';
import type { Item } from '@/lib/drills/item-schema';

// jsonb doesn't keep key order, so compare with keys sorted.
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]))
    : v;
// What students see and are scored on. Status, the example flag and the
// authorship record (reviewer, similarity check) are review metadata, so they
// can change without a new version.
const content = (item: Item) => JSON.stringify(canonical({ ...item, status: undefined, is_example: undefined, authorship: undefined }));
const meta = (item: Item) => JSON.stringify(canonical(item.authorship));

async function main() {
  const items = loadAuthoredItems();
  // A pool whose wording gives answers away isn't ready, even as drafts.
  const cues = contentCheckProblems(items);
  if (cues.length) throw new Error(`Option wording gives answers away:\n${cues.join('\n')}`);
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
      const [{ n }] = await db.select({ n: count() }).from(drillAttempts)
        .where(and(eq(drillAttempts.itemId, item.item_id), eq(drillAttempts.itemVersion, item.version)));
      if (row.status === 'draft' && n === 0) {
        await db.update(drillItems).set({ payload: item, status: item.status, isExample: item.is_example, tier: item.tier, skills: item.skills }).where(where);
        updated++;
      } else {
        conflicts.push(`${item.item_id}@${item.version}: content changed; bump "version" to publish the edit`);
      }
      continue;
    }
    if (row.status !== item.status || row.isExample !== item.is_example || meta(row.payload as Item) !== meta(item)) {
      await db.update(drillItems).set({ status: item.status, isExample: item.is_example, authorship: item.authorship ?? {}, payload: item }).where(where);
      updated++;
    } else {
      unchanged++;
    }
  }

  // A newer version replaces the old one: retire older live versions so only
  // one version of an item is live. Attempts keep pointing at the version
  // they saw.
  let retired = 0;
  for (const item of items.filter(i => i.status === 'live' && i.version > 1)) {
    const rows = await db.update(drillItems).set({ status: 'retired' })
      .where(and(eq(drillItems.itemId, item.item_id), lt(drillItems.version, item.version), eq(drillItems.status, 'live')))
      .returning({ id: drillItems.itemId });
    retired += rows.length;
  }

  console.log(`drill items: ${inserted} inserted, ${updated} updated (status, example or authorship), ${unchanged} unchanged, ${retired} older versions retired, ${conflicts.length} conflicts`);
  if (conflicts.length) {
    console.error(conflicts.join('\n'));
    process.exitCode = 1;
  }
}

main().then(() => process.exit()).catch(e => { console.error(e); process.exit(1); });
