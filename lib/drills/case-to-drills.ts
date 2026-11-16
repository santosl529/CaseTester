// The switch for full cases → drills (Matt, 15 Nov, proposal D11), read from
// the environment so it can be turned off without a deploy of new code:
//   CASE_TO_DRILLS=off     today's behaviour: grading sends drills nothing (default)
//   CASE_TO_DRILLS=shadow  grading tags the report and stores the case result it
//                          would send (case_result_runs), with a preview of the
//                          prescriptions; nothing is shown to the student and
//                          nothing in drills changes
//   CASE_TO_DRILLS=on      the case result goes to drills (ingestCaseResult)
// Shadow ends when Matt has read 20 real reports or after 2 weeks; then he
// decides on "on".
//
// CASE_TAG_DRILL_GROUPS: the report groups whose tags may become findings
// (a drill recommendation and a prescription). The rest are still tagged and
// recorded, for the shadow review page, but give no drill. Default: the 7 that
// passed the gate on 15 Nov. A group goes on only after its gate passes again
// with real shadow points Matt has labelled.
import { RUBRIC_DIMENSION_KEYS } from '@/lib/scoring/rubric';

export type CaseToDrillsMode = 'off' | 'shadow' | 'on';
const MODES: readonly CaseToDrillsMode[] = ['off', 'shadow', 'on'];

export function caseToDrillsMode(env: Record<string, string | undefined> = process.env): CaseToDrillsMode {
  const v = env.CASE_TO_DRILLS?.trim().toLowerCase();
  if (!v) return 'off';
  if (!(MODES as readonly string[]).includes(v)) throw new Error(`CASE_TO_DRILLS must be one of ${MODES.join(', ')}, not "${env.CASE_TO_DRILLS}"`);
  return v as CaseToDrillsMode;
}

// Case results reach drills (plan source, workouts, dashboard) only when on.
export const caseResultsWired = (env?: Record<string, string | undefined>) => caseToDrillsMode(env) === 'on';

// A report's groups: its 8 rubric dimensions, and the top improvement.
export const TAG_GROUPS = [...RUBRIC_DIMENSION_KEYS, 'topFix'] as const;
export type TagGroup = (typeof TAG_GROUPS)[number];
export const DEFAULT_DRILL_GROUPS: readonly TagGroup[] = ['structure', 'quantitative', 'creativity', 'synthesis', 'communication', 'pushback', 'topFix'];

export function drillGroups(env: Record<string, string | undefined> = process.env): Set<TagGroup> {
  const raw = env.CASE_TAG_DRILL_GROUPS?.trim();
  if (!raw) return new Set(DEFAULT_DRILL_GROUPS);
  const names = raw.split(',').map(s => s.trim()).filter(Boolean);
  const unknown = names.filter(n => !(TAG_GROUPS as readonly string[]).includes(n));
  if (unknown.length) throw new Error(`CASE_TAG_DRILL_GROUPS: unknown group ${unknown.join(', ')} (have ${TAG_GROUPS.join(', ')})`);
  return new Set(names as TagGroup[]);
}
