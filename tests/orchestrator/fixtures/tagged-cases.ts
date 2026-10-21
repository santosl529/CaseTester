// Round 6 Task 68 fixtures: the four new cases with a `factAnchors.tags` block,
// built in the test (the case files get their tags in Task 69). The tag data is
// the plan's (Task 69, "Data (decided here)"); `covers` adds fixture-only phrases.
import { buildFactBase, type FactBase } from '@/lib/orchestrator/fact-check';
import { getCaseById } from '@/lib/cases/loader';

export type Tags = NonNullable<FactBase['tags']>;
export const TAGS: Record<string, Tags> = {
  'prof-002': {
    clientWords: ['Larkspur', 'our', 'we'],
    entities: [{ id: 'competitor', words: ['entrant', 'competitor', 'competitors', 'low-cost airline', 'low-cost carrier', 'rival', 'the other airline', 'new carrier'], items: ['competitor_entry', 'competitor_costs'] }],
    forecast: ['new_routes_plan', 'new_routes_cost_flights', 'new_route_rampup'],
  },
  'launch-001': {
    clientWords: ['chickpea', 'the line', 'the new line', 'roasted', 'the snack'],
    entities: [{ id: 'chips', words: ['chip', 'chips', 'chip business', 'potato chips'], items: ['why_now', 'cannibalization'] }],
    forecast: ['planning_assumptions', 'sampling_program'],
  },
  'entry-001': {
    clientWords: ['Kelvexa', 'Aldermoor'],
    entities: [{ id: 'nimbrel', words: ['Nimbrel'], items: ['nimbrel', 'current_treatment'] }],
    forecast: ['peak_share_forecast', 'peak_timing'],
  },
};

// A case's fact base with its tags (or none: `tags: null`) and extra cover phrases.
export function taggedFactBase(id: string, opts: { covers?: Record<string, string[]>; tags?: Tags | null } = {}): FactBase {
  const c = getCaseById(id);
  const fa = c.factAnchors!;
  const covers = { ...fa.covers };
  for (const [k, v] of Object.entries(opts.covers ?? {})) covers[k] = [...(covers[k] ?? []), ...v];
  const tags = opts.tags === null ? undefined : opts.tags ?? TAGS[id];
  return buildFactBase({ ...c, factAnchors: { ...fa, covers, ...(tags ? { tags } : {}) } } as never);
}
