// Rows for a choice drill's draft review sheet (scripts/drills-review-sheet.ts).
// Pure, so a test can check the sheet on disk still matches the items.
import type { Item } from './item-schema';

export const REVIEW_SHEET_COLUMNS = ['item_id', 'version', 'what_changed', 'prompt',
  ...['a', 'b', 'c', 'd'].flatMap(x => [`option_${x}`, `feedback_${x}`]), 'explanation'];

export function reviewSheetRows(items: Item[], drillId: string, notes: Map<string, string> = new Map()): Record<string, string | number>[] {
  return items.filter(i => i.drill_id === drillId && i.status === 'draft').sort((a, b) => a.item_id.localeCompare(b.item_id)).map(i => {
    const row: Record<string, string | number> = { item_id: i.item_id, version: i.version, what_changed: notes.get(i.item_id) ?? '', prompt: i.prompt, explanation: i.explanation };
    for (const o of i.options) {
      row[`option_${o.id}`] = `${o.correct ? 'RIGHT' : o.tag}: ${o.text}`;
      row[`feedback_${o.id}`] = o.feedback;
    }
    return row;
  });
}
