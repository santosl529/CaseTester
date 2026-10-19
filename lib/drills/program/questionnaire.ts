// The 2–3 minute questionnaire's rules (D6 round 2), pure so they can be
// tested: self-ratings place skills conservatively, pick up to 3
// prescriptions, and name the skills whose placement the first workouts check.
// Self-ratings are the least reliable plan source (case > diagnostic >
// questionnaire), so a rating never places a skill past Repair.
import { DRILLS_CONFIG, getSkill } from '../config';
import { stageDrills } from '../progress/engine';
import type { Place } from './diagnostic';
import { prerequisiteOrder } from './workout';

export const QUESTIONNAIRE_AREAS = {
  structuring: { label: 'Structuring', areas: ['PS', 'HY'] },
  math: { label: 'Math', areas: ['QN'] },
  charts: { label: 'Charts and exhibits', areas: ['EX'] },
  recommendations: { label: 'Recommendations', areas: ['SY', 'CL'] },
} as const;
export type QuestionnaireArea = keyof typeof QUESTIONNAIRE_AREAS;
export type Ratings = Record<QuestionnaireArea, number>;
const AREAS = Object.keys(QUESTIONNAIRE_AREAS) as QuestionnaireArea[];

// The area's skills that a live drill trains, in prerequisite order.
export function areaSkills(area: QuestionnaireArea, isLive: (drillId: string) => boolean): string[] {
  const codes: readonly string[] = QUESTIONNAIRE_AREAS[area].areas;
  const skills = DRILLS_CONFIG.taxonomy.skills.filter(s => codes.includes(s.area)).map(s => s.id);
  return prerequisiteOrder(skills.filter(id => Object.values(stageDrills(id, isLive)).some(Boolean)));
}

// 1–2: Recognize tier 1; 3: Recognize tier 2; 4–5: Repair (Recognize tier 2
// where the skill has no Repair drill). Never a Construct test-out.
export function placeFromRating(skillId: string, rating: number, isLive: (drillId: string) => boolean): Place {
  if (rating <= 2) return 'recognize';
  if (rating === 3) return 'recognize_t2';
  return stageDrills(skillId, isLive).repair ? 'repair' : 'recognize_t2';
}

export function questionnairePlacements(ratings: Ratings, isLive: (drillId: string) => boolean): Record<string, { place: Place }> {
  const out: Record<string, { place: Place }> = {};
  for (const area of AREAS) for (const skillId of areaSkills(area, isLive)) out[skillId] = { place: placeFromRating(skillId, ratings[area], isLive) };
  return out;
}

// Areas from most to least in need: the one named hardest first, then by
// rating, lowest first (ties in the questionnaire's order).
export function areasByNeed(ratings: Ratings, hardest: QuestionnaireArea | null): QuestionnaireArea[] {
  return [...AREAS].sort((a, b) => Number(b === hardest) - Number(a === hardest) || ratings[a] - ratings[b] || AREAS.indexOf(a) - AREAS.indexOf(b));
}

// Up to 3 prescriptions: the first skill (prerequisite order) of the hardest
// area and of each area rated 3 or lower. Priorities stay below a
// diagnostic's, which outranks them.
export function questionnairePrescriptions(ratings: Ratings, hardest: QuestionnaireArea | null, isLive: (drillId: string) => boolean) {
  const out: { skill_id: string; priority: number; reason: string }[] = [];
  for (const area of areasByNeed(ratings, hardest)) {
    if (out.length >= 3) break;
    if (area !== hardest && ratings[area] > 3) continue;
    const skillId = areaSkills(area, isLive)[0];
    if (!skillId) continue;
    const label = QUESTIONNAIRE_AREAS[area].label.toLowerCase();
    out.push({
      skill_id: skillId,
      priority: 1 + (area === hardest ? 0.5 : 0) + (ratings[area] <= 2 ? 0.5 : 0),
      reason: area === hardest
        ? `You said ${label} is the hardest part, so we start with ${getSkill(skillId).name}.`
        : `You rated your ${label} ${ratings[area]} of 5, so we start with ${getSkill(skillId).name}.`,
    });
  }
  return out;
}

// The skill whose placement each area's quick check confirms: the area's
// first skill, areas in order of need.
export function checkSkills(ratings: Ratings, hardest: QuestionnaireArea | null, isLive: (drillId: string) => boolean): string[] {
  return areasByNeed(ratings, hardest).map(a => areaSkills(a, isLive)[0]).filter((s): s is string => Boolean(s));
}
