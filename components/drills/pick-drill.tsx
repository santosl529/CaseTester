'use client';
import { useState } from 'react';
import { StartSetButton } from './start-set-button';

const STAGE = { recognize: 'Recognize', repair: 'Repair', construct: 'Construct' } as const;

export interface PickableDrill {
  stage: keyof typeof STAGE;
  drill_id: string;
  name: string;
  items: number | null;
  current_tier: number | null;
  tiers: number[];
}

// "Pick exactly" (docs/prd-drills.md "Browse drills"): a drill and a tier up to
// one above the student's current tier on it.
export function PickDrill({ skillId, drill, compact = false }: { skillId: string; drill: PickableDrill; compact?: boolean }) {
  const [tier, setTier] = useState(drill.current_tier ?? Math.max(...drill.tiers));
  return (
    <div className="t-small flex flex-wrap items-center justify-between gap-3 pt-1">
      {compact ? <span className="text-ink/70">{STAGE[drill.stage]} drill</span> : (
        <span>
          <span className="text-ink/70">{STAGE[drill.stage]} · </span>
          <span className="font-semibold">{drill.name}</span>
          {drill.items && <span className="text-ink/70"> · {drill.items} items</span>}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Tier for {drill.name}</legend>
          {drill.tiers.map(t => (
            <label key={t} className="flex h-9 cursor-pointer items-center rounded-full border border-ink/20 bg-white px-3 transition-colors hover:border-ink/40 has-[:checked]:border-cobalt has-[:checked]:bg-sky/50 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt motion-reduce:transition-none">
              <input type="radio" name={`tier-${skillId}-${drill.drill_id}`} checked={tier === t} onChange={() => setTier(t)} className="sr-only" />
              Tier {t}
            </label>
          ))}
        </fieldset>
        <StartSetButton body={{ drill_id: drill.drill_id, skill_id: skillId, tier, browse: true }} label={compact ? `Start ${drill.name}` : 'Start'} size="sm" variant="outline" />
      </span>
    </div>
  );
}
