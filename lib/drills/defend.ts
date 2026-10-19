// The Defend step (docs/prd-drills.md "Defend step"): after the main answer of
// a Construct item at tiers 2–3, an interviewer follow-up about it. It runs as
// extra steps on the item, so the set machinery that already handles HY-2's two
// stages (a stage clock, finished steps held server-side, one row per item)
// handles it too. Whether a set runs Defend is fixed when the set starts: the
// item plan marks each item that gets it (sets/plan.ts ItemRef.defend), and
// withDefend adds the steps whenever that item is resolved for the set.
//
// Weights: the Defend part is 25% of the item and the main answer's weights
// scale to 75% (HY-2: stage 1 45%, stage 2 30%, Defend 25%). A Challenge
// splits its 25% into the Hold/Update decision (40% of it, scored by code)
// and the written reason (60%).
import { DRILLS_CONFIG, type Drill } from './config';
import { DEFEND_DECISION_WEIGHT, type Item } from './item-schema';
import { DEFEND_CHOICES } from './checklists';
import { previewDrafts } from './live';
import { itemSteps } from './sets/scoring';

const rules = DRILLS_CONFIG.rules.defend;

// The drill's Defend step is switched on (or previewed locally with drafts).
export const defendLive = (drill: Drill) => Boolean(drill.defend && (drill.defend.live || previewDrafts()));

// Does a set of this drill, at this tier, from this source, run Defend? Not at
// tier 1 and not in the diagnostic; test-out sets and transfer checks run at
// tier 2, so they do.
export function defendRuns(drill: Drill, tier: number, source: string | null): boolean {
  return defendLive(drill) && tier >= rules.min_tier && source !== 'diagnostic';
}

// The set size: one item fewer at T2 and T3 on drills with Defend.
export function setSizeAt(drill: Drill, tier: number, defend: boolean): number {
  return defend && drill.defend ? drill.defend.set_size[tier - 1] : drill.set_size!;
}

// Seconds the follow-up adds per item, for workout time estimates.
export const defendSeconds = (tier: number) => (tier >= 3 ? rules.time_limits_s.t3 : rules.time_limits_s.t2);

// The item with its Defend steps and checks added. Idempotent; an item with no
// follow-up comes back unchanged.
export function withDefend(item: Item): Item {
  if (!item.defend || item.input.steps?.some(s => s.defend)) return item;
  const d = item.defend;
  const w = rules.weight;
  const main = itemSteps(item).map(s => ({ ...s, weight: s.weight * (1 - w) }));
  // Tier 1 never runs Defend; its slot repeats tier 2's time.
  const time: [number, number, number] = [rules.time_limits_s.t2, rules.time_limits_s.t2, rules.time_limits_s.t3];
  const steps = d.type === 'challenge'
    ? [
      { type: 'single_choice' as const, weight: w * DEFEND_DECISION_WEIGHT, label: 'Hold your recommendation, or update it?', choices: DEFEND_CHOICES, time_limits_s: time, defend: true },
      { type: 'free_text' as const, weight: w * (1 - DEFEND_DECISION_WEIGHT), label: 'Your reply, and why', max_words: rules.max_words, defend: true },
    ]
    : [{ type: 'free_text' as const, weight: w, label: 'Your reply', max_words: rules.max_words, time_limits_s: time, defend: true }];
  const replyStep = main.length + steps.length - 1;
  return {
    ...item,
    input: { ...item.input, steps: [...main, ...steps] },
    // Check weights are shares of the whole item, as for HY-2.
    checks: [
      ...item.checks.map(c => ({ ...c, weight: c.weight * (1 - w) })),
      ...d.checks.map(c => ({ ...c, step: replyStep, weight: c.weight * w })),
    ],
  };
}

// The index of the first Defend step, or -1 when the item has none.
export const defendStart = (item: Item) => itemSteps(item).findIndex(s => s.defend);

// Where the Defend steps sit: the first one, the Hold/Update step (-1 for a
// Justify) and the written reply. Null when the item runs no Defend.
export function defendParts(item: Item): { start: number; decision: number; reply: number } | null {
  const start = defendStart(item);
  if (start === -1) return null;
  const spec = itemSteps(item);
  const decision = spec.findIndex((s, i) => i >= start && s.type === 'single_choice');
  return { start, decision, reply: spec.length - 1 };
}

// The challenge decision's verdict: Update is right when the pushback is
// valid, Hold when it isn't. Null when right.
export function challengeTag(valid: boolean, chose: string): string | null {
  if ((chose === 'update') === valid) return null;
  return valid ? 'M.ignored_valid_pushback' : 'M.caved_to_invalid_pushback';
}
