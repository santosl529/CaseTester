// The only path from an item to the client (docs/prd-drills.md "Integrity
// rules": answer keys stay on the server until an item is submitted). Built as
// an allowlist, so a key field added to ItemSchema later stays server-side
// unless someone adds it here on purpose.
import 'server-only';
import type { Item } from './item-schema';
import type { ChartSpec } from './chart-spec';

export interface PublicItem {
  drill_id: string;
  level: 1 | 2;
  tier: 1 | 2 | 3;
  prompt: string;
  exhibit: ChartSpec | null;
  input: Item['input'];
  options: { id: string; text: string }[];
}

export function toPublicItem(item: Item): PublicItem {
  return {
    drill_id: item.drill_id,
    level: item.level,
    tier: item.tier,
    prompt: item.prompt,
    exhibit: item.exhibit,
    input: {
      type: item.input.type,
      ...(item.input.max_words !== undefined && { max_words: item.input.max_words }),
      ...(item.input.max_buckets !== undefined && { max_buckets: item.input.max_buckets }),
      ...(item.input.max_select !== undefined && { max_select: item.input.max_select }),
    },
    options: item.options.map(o => ({ id: o.id, text: o.text })),
  };
}
