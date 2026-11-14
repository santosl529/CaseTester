// Review records (drill-items/review-records.json): each authored item's
// authorship (who drafted and reviewed it, and its similarity check), kept
// apart from the item files and tied to a fingerprint of the text the
// similarity check judged. Re-importing restores an item's authorship from
// here whenever that text is unchanged, even if its file was deleted or
// rewritten; changed text starts over as pending. (Matt, 2026-11-11, after a
// re-import over deleted CL-4 and EX-4 files lost the pilot's results.)
import { createHash } from 'crypto';
import fs from 'fs';
import type { Item } from './item-schema';

export type Authorship = NonNullable<Item['authorship']>;
export interface ReviewRecord { fingerprint: string; authorship: Authorship }
// Per item, one record per text it has had, newest last.
export type ReviewRecords = Record<string, ReviewRecord[]>;

type Checked = Pick<Item, 'drill_id' | 'prompt' | 'exhibit' | 'options' | 'extras' | 'defend' | 'model_answer' | 'explanation'>;

// Keys sorted, so a file's key order can't change the text.
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])) : v;

// What the similarity check reads (scripts/drills-similarity.ts).
export function similarityInput(item: Checked): string {
  const parts = [`Drill: ${item.drill_id}`, `Question: ${item.prompt}`];
  if (item.exhibit) parts.push(`Exhibit: ${JSON.stringify(canonical(item.exhibit))}`);
  if (item.options.length) parts.push(`Options:\n${item.options.map(o => `- ${o.text}`).join('\n')}`);
  // Repair items: the flawed answer the student edits.
  if (typeof item.extras.flawed_answer === 'string') parts.push(`Answer to fix: ${item.extras.flawed_answer}`);
  if (item.defend) parts.push(`Interviewer follow-up: ${item.defend.text}\nModel reply: ${item.defend.model_reply}`);
  if (item.model_answer) parts.push(`Model answer: ${item.model_answer}`);
  parts.push(`Explanation: ${item.explanation}`);
  return parts.join('\n\n');
}

export const fingerprint = (item: Checked) => createHash('sha256').update(similarityInput(item)).digest('hex').slice(0, 16);

export const REVIEW_RECORDS_FILE = 'drill-items/review-records.json';

export const loadReviewRecords = (file = REVIEW_RECORDS_FILE): ReviewRecords =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};

export function saveReviewRecords(records: ReviewRecords, file = REVIEW_RECORDS_FILE): void {
  fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(Object.keys(records).sort().map(k => [k, records[k]])), null, 2)}\n`);
}

// Records an item's authorship once something has happened to it (a
// similarity result or a review); a pending, unreviewed draft has nothing to keep.
export function recordReview(records: ReviewRecords, item: Item): void {
  const a = item.authorship;
  if (item.generator !== null || !a || (a.similarity_check === 'pending' && !a.reviewed_by)) return;
  const fp = fingerprint(item);
  records[item.item_id] = [...(records[item.item_id] ?? []).filter(r => r.fingerprint !== fp), { fingerprint: fp, authorship: a }];
}

// The authorship a freshly built item should carry: its record for the same
// text, else the existing file's when that file has the same text, else the
// new build's own (pending).
export function carryAuthorship(item: Item, existing: Checked & Pick<Item, 'authorship'> | null, records: ReviewRecords): Authorship | null {
  const fp = fingerprint(item);
  const recorded = records[item.item_id]?.find(r => r.fingerprint === fp);
  if (recorded) return recorded.authorship;
  if (existing?.authorship && fingerprint(existing) === fp) return existing.authorship;
  return item.authorship;
}
