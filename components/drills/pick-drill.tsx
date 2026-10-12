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
export function PickDrill({ skillId, drill }: { skillId: string; drill: PickableDrill }) {
  const [tier, setTier] = useState(drill.current_tier ?? Math.max(...drill.tiers));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
      <span>
        <span className="text-muted-foreground">{STAGE[drill.stage]} · </span>
        <span className="font-medium">{drill.name}</span>
        {drill.items && <span className="text-muted-foreground"> · {drill.items} items</span>}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Tier for {drill.name}</legend>
          {drill.tiers.map(t => (
            <label key={t} className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 has-[:checked]:border-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name={`tier-${skillId}-${drill.drill_id}`} checked={tier === t} onChange={() => setTier(t)} className="sr-only" />
              Tier {t}
            </label>
          ))}
        </fieldset>
        <StartSetButton body={{ drill_id: drill.drill_id, skill_id: skillId, tier, browse: true }} label="Start" size="sm" variant="outline" />
      </span>
    </div>
  );
}
