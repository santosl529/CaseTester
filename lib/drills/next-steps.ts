// "Your next steps" on a case report (Matt, 15 Nov 2026; proposal §3, D4, D5,
// D12). Pure, so every rule is tested (tests/drills/next-steps.test.ts):
//   - the list is this case's prescriptions in the shared ranking's order (at
//     most 3), fixed when the case result arrives (`NextStepsSnapshot`, stored
//     in case_results.next_steps); each with its plain line, the quote, the
//     lesson and the practice set;
//   - at most one "Also from this case" row: the case's top finding on a skill
//     with no live drill, when it weighs at least as much as the lowest skill
//     listed (or nothing is listed);
//   - what's live: a skill is done only when a drill set on it passed after the
//     case; the student is ready for the next case when every listed skill with
//     a drill is done.
import { DRILLS_CONFIG, getMistakeTag, getSkill } from './config';
import type { CaseResultPayload } from './case-result';
import { reasonLine } from './reason';

export const NEXT_STEPS_MAX = 3;
const WORDS_PER_MINUTE = 200;

export type NextStepSkill = {
  skill_id: string;
  name: string;
  why: string;            // the tag's plain line ("You made an arithmetic slip.")
  quote: string;          // the student's own words
  prescription_id: string;
  lesson: { minutes: number } | null;
  practice: { drill_name: string; level: number; minutes: number } | null;
};
export type NextStepAlso = { skill_id: string; name: string; why: string; quote: string; lesson: { minutes: number } | null; tip: string | null };
export type NextStepsSnapshot = {
  version: 1;
  skills: NextStepSkill[];
  also: NextStepAlso | null;
  // No finding at all, and the case met the bar: "Nothing from this case needs practice."
  all_clear: boolean;
  partial: boolean;
  retake: boolean;
};

type Finding = CaseResultPayload['findings'][number] & { tip?: string };
type CaseRx = { id: string; skill_id: string; priority: number; evidence: string | null };

export const lessonMinutes = (words: number) => Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));

const skillOf = (tag: string) => getMistakeTag(tag)!.skill;
const weight = (f: Finding) => (f.severity === 'major' ? DRILLS_CONFIG.rules.prescriptions.weights.major : DRILLS_CONFIG.rules.prescriptions.weights.minor);

// The finding behind a skill: its major one first, else the first.
function leadFinding(findings: Finding[], skillId: string): Finding | undefined {
  const fs = findings.filter(f => skillOf(f.tag) === skillId);
  return fs.find(f => f.severity === 'major') ?? fs[0];
}

export function buildNextSteps(input: {
  payload: CaseResultPayload & { findings: Finding[] };
  retake: boolean;
  metTheBar: boolean;
  // This case's prescriptions, in the shared ranking's order (sharedRanking).
  ranked: CaseRx[];
  lessons: Map<string, { words: number }>;
  practice: Map<string, { drill_name: string; level: number; minutes: number }>;
  hasLiveDrill: (skillId: string) => boolean;
}): NextStepsSnapshot {
  const findings = input.payload.findings;
  const skills: NextStepSkill[] = input.ranked.slice(0, NEXT_STEPS_MAX).flatMap(rx => {
    const lead = leadFinding(findings, rx.skill_id);
    if (!lead) return [];
    const lesson = input.lessons.get(rx.skill_id);
    return [{
      skill_id: rx.skill_id, name: getSkill(rx.skill_id).name, why: reasonLine(lead.tag), quote: lead.evidence,
      prescription_id: rx.id, lesson: lesson ? { minutes: lessonMinutes(lesson.words) } : null,
      practice: input.practice.get(rx.skill_id) ?? null,
    }];
  });

  // The weightiest finding on a skill with no live drill, kept if it weighs at least as much as the lowest skill listed.
  const noDrill = new Map<string, number>();
  for (const f of findings) {
    const id = skillOf(f.tag);
    if (!input.hasLiveDrill(id)) noDrill.set(id, (noDrill.get(id) ?? 0) + weight(f));
  }
  const [topNoDrill] = [...noDrill].sort((a, b) => b[1] - a[1]);
  const floor = skills.length ? Math.min(...input.ranked.slice(0, skills.length).map(r => r.priority)) : 0;
  let also: NextStepAlso | null = null;
  if (topNoDrill && topNoDrill[1] >= floor) {
    const lead = leadFinding(findings, topNoDrill[0])!;
    const lesson = input.lessons.get(topNoDrill[0]);
    also = {
      skill_id: topNoDrill[0], name: getSkill(topNoDrill[0]).name, why: reasonLine(lead.tag), quote: lead.evidence,
      lesson: lesson ? { minutes: lessonMinutes(lesson.words) } : null, tip: lead.tip ?? null,
    };
  }
  return {
    version: 1, skills, also, all_clear: findings.length === 0 && input.metTheBar,
    partial: input.payload.partial ?? false, retake: input.retake,
  };
}

// What's live on the report: which listed skills are done (a passing set on
// the skill since the case), and whether the student is ready for the next
// case (every listed skill with a drill is done; nothing to practice counts as
// ready). `passed`: skills with a passing set completed after the case.
export function nextStepsStatus(snapshot: NextStepsSnapshot, passed: Set<string>) {
  const practiced = snapshot.skills.filter(s => s.practice);
  const done = new Set(practiced.filter(s => passed.has(s.skill_id)).map(s => s.skill_id));
  return { done, ready: practiced.every(s => done.has(s.skill_id)) };
}

// "About N minutes": every listed lesson and practice set.
export const totalMinutes = (snapshot: NextStepsSnapshot) =>
  snapshot.skills.reduce((m, s) => m + (s.lesson?.minutes ?? 0) + (s.practice?.minutes ?? 0), 0);
