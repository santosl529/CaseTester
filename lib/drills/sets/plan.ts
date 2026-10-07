// Which items a set serves, fixed when the set starts (drill_sets.item_plan).
// Generated drills: templates and seeds from the set id, so the plan is
// reproducible. Authored drills: the PRD serving rules (no repeat within 60
// days, oldest-seen reused first, case types mixed).
import 'server-only';
import { DRILLS_CONFIG } from '../config';
import type { Tier } from '../item-schema';
import { createRng, type Rng } from '../rng';
import { generatorsForDrill } from '../generators/registry';

export type ItemRef =
  | { kind: 'generated'; template_id: string; template_version: number; seed: number }
  | { kind: 'authored'; item_id: string; version: number };

// FNV-1a: a set id → a 32-bit seed for its plan.
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Cycles through a shuffled list so a set spreads across templates.
function cycle<T>(rng: Rng, items: T[], n: number): T[] {
  const out: T[] = [];
  let deck: T[] = [];
  while (out.length < n) {
    if (deck.length === 0) deck = rng.shuffle(items);
    out.push(deck.pop()!);
  }
  return out;
}

export function planGenerated(opts: {
  setId: string; drillId: string; size: number; focusSkill?: string | null; focusTag?: string | null;
}): ItemRef[] {
  const rng = createRng(hashSeed(opts.setId));
  const all = generatorsForDrill(opts.drillId);
  if (all.length === 0) throw new Error(`No generators for ${opts.drillId}`);
  // "70% of items target the prescribed skill, 30% mixed review" (QN-3), when
  // a focus narrows the templates at all.
  const targeted = all.filter(g =>
    opts.focusTag ? g.focus_tags.includes(opts.focusTag) : opts.focusSkill ? g.skills.includes(opts.focusSkill) : false);
  const focused = targeted.length > 0 && targeted.length < all.length;
  const nTarget = focused ? Math.round(opts.size * DRILLS_CONFIG.rules.prescriptions.focus_item_share) : 0;
  const picks = rng.shuffle([...cycle(rng, targeted, nTarget), ...cycle(rng, all, opts.size - nTarget)]);
  return picks.map(g => ({
    kind: 'generated', template_id: g.template_id, template_version: g.template_version, seed: rng.int(0, 2 ** 31 - 1),
  }));
}

export interface PoolItem { item_id: string; version: number; case_type: string | null; tier: number }

export function planAuthored(opts: {
  setId: string; pool: PoolItem[]; lastSeen: Map<string, Date>; size: number; tier: Tier; now: Date;
}): ItemRef[] {
  const rng = createRng(hashSeed(opts.setId));
  const cutoff = opts.now.getTime() - DRILLS_CONFIG.rules.serving.authored_repeat_days * 86_400_000;
  const fresh = opts.pool.filter(i => (opts.lastSeen.get(i.item_id)?.getTime() ?? -Infinity) < cutoff);
  const stale = opts.pool
    .filter(i => !fresh.includes(i))
    .sort((a, b) => opts.lastSeen.get(a.item_id)!.getTime() - opts.lastSeen.get(b.item_id)!.getTime());

  // Items at the set's tier first, then the rest; within each, round-robin
  // across case types so a set mixes them.
  const mixByCaseType = (items: PoolItem[]) => {
    const groups = new Map<string, PoolItem[]>();
    for (const item of rng.shuffle(items)) {
      const key = item.case_type ?? '';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const queues = rng.shuffle([...groups.values()]);
    const out: PoolItem[] = [];
    while (queues.some(q => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
    return out;
  };
  const ordered = [
    ...mixByCaseType(fresh.filter(i => i.tier === opts.tier)),
    ...mixByCaseType(fresh.filter(i => i.tier !== opts.tier)),
    ...stale,
  ];
  return ordered.slice(0, opts.size).map(i => ({ kind: 'authored', item_id: i.item_id, version: i.version }));
}
