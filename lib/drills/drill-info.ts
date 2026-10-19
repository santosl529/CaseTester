// What each drill is for, on Browse drills and Learn (D6 round 2): two short
// lines (what you do, how it helps in the interview), the interview stage it
// trains, its skills and its time. The stage comes from the intro lesson's
// "Skills:" lines (lessons/intro/), so Browse and the lesson can't disagree.
import 'server-only';
import descriptions from './config/drill-descriptions.json';
import { DRILLS_CONFIG, getDrill, getSkill } from './config';
import { isLiveDrill } from './live';
import { loadIntroLesson } from './lessons';
import { setMinutes } from './program/workout';

export const INTERVIEW_STAGES = ['Clarify', 'Structure', 'Analyze', 'Recommend'] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export function drillDescription(drillId: string): { what: string; why: string } | null {
  return (descriptions.drills as Record<string, { what: string; why: string }>)[drillId] ?? null;
}

// skill id → interview stage, from the intro lesson ("## 2. Structure" … "Skills: …").
export function stageOfSkill(): Map<string, InterviewStage> {
  const intro = loadIntroLesson();
  const out = new Map<string, InterviewStage>();
  for (const s of intro?.sections ?? []) {
    const name = s.heading.replace(/^\d+\.\s*/, '') as InterviewStage;
    if (!INTERVIEW_STAGES.includes(name)) continue;
    for (const skill of s.skills ?? []) out.set(skill, name);
  }
  return out;
}

// The stages a drill's primary skills belong to, in interview order.
export function drillStages(drillId: string, map = stageOfSkill()): InterviewStage[] {
  const stages = new Set(getDrill(drillId).primary_skills.map(id => map.get(id)).filter((s): s is InterviewStage => Boolean(s)));
  return INTERVIEW_STAGES.filter(s => stages.has(s));
}

// Minutes for a full set at a tier (items × time per item, as workouts estimate).
export const drillMinutes = (drillId: string, tier: number) => {
  const d = getDrill(drillId);
  return Math.max(1, Math.round(setMinutes(drillId, tier, d.set_size ?? 1)));
};

export interface DrillCard {
  drill_id: string; name: string; what: string | null; why: string | null; stages: InterviewStage[];
  skills: { id: string; name: string }[]; primary_skill: string; items: number | null; minutes: number;
}

// Every live drill as a card, grouped under the first interview stage it trains.
export function drillCards(tierOf: (drillId: string) => number = () => 1): { stage: InterviewStage; drills: DrillCard[] }[] {
  const map = stageOfSkill();
  const cards = DRILLS_CONFIG.drills.drills.filter(d => isLiveDrill(d.id)).map((d): DrillCard => {
    const text = drillDescription(d.id);
    return {
      drill_id: d.id, name: d.name, what: text?.what ?? null, why: text?.why ?? null, stages: drillStages(d.id, map),
      skills: d.skills.map(id => ({ id, name: getSkill(id).name })), primary_skill: d.primary_skills[0],
      items: d.set_size ?? null, minutes: drillMinutes(d.id, tierOf(d.id)),
    };
  });
  return INTERVIEW_STAGES.map(stage => ({ stage, drills: cards.filter(c => (c.stages[0] ?? 'Analyze') === stage) }));
}

// The live drills that practice a skill (for Learn).
export function drillsForSkill(skillId: string): { drill_id: string; name: string }[] {
  return DRILLS_CONFIG.drills.drills.filter(d => isLiveDrill(d.id) && d.skills.includes(skillId)).map(d => ({ drill_id: d.id, name: d.name }));
}
