// Case results → skill states and prescriptions (docs/prd-drills.md
// "Prescription rules", "Updating skill state from cases"). Pure code, no AI.
import { DRILLS_CONFIG, getMistakeTag, getSkill } from '../config';
import type { CaseResultPayload } from '../case-result';
import {
  hasLiveDrill, lowerName, newProgress, skillCatalogIndex, stateRank, type Context, type ProgressMap, type SkillStateName,
  type Transition,
} from './engine';

export interface CasePrescription {
  skill_id: string;
  priority: number;
  focus_tag: string | null;
  reason: string;
  evidence: string;
}

export interface CaseUpdate {
  progress: ProgressMap;
  transitions: Transition[];
  prescriptions: CasePrescription[];
  // Skills that reached Mastered earlier and were flagged again.
  regressions: string[];
}

type Finding = CaseResultPayload['findings'][number];

// Rule 1: each tag counts once per case, major if any report of it is major.
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byTag = new Map<string, Finding>();
  for (const f of findings) {
    const prior = byTag.get(f.tag);
    if (!prior || (prior.severity === 'minor' && f.severity === 'major')) byTag.set(f.tag, f);
  }
  return [...byTag.values()];
}

const skillOf = (tag: string) => getMistakeTag(tag)!.skill;

export function applyCase(before: ProgressMap, payload: CaseResultPayload, previous: CaseResultPayload | null, ctx: Context): CaseUpdate {
  const isLive = ctx.isLive ?? undefined;
  const progress: ProgressMap = new Map([...before].map(([k, v]) => [k, { ...v }]));
  const get = (id: string) => {
    let p = progress.get(id);
    if (!p) progress.set(id, (p = newProgress(id)));
    return p;
  };
  const transitions: Transition[] = [];
  const move = (id: string, to: SkillStateName, reason: string) => {
    const p = get(id);
    if (p.state !== to) transitions.push({ skill_id: id, from: p.state, to, reason });
    p.state = to;
  };

  const findings = dedupeFindings(payload.findings);
  const flagged = new Map<string, Finding[]>();
  for (const f of findings) flagged.set(skillOf(f.tag), [...(flagged.get(skillOf(f.tag)) ?? []), f]);
  const stateBefore = (id: string) => before.get(id)?.state ?? 'not_started';

  // A finding on a Practiced, Mastered or Validated skill drops it to Recognizes.
  const regressions: string[] = [];
  for (const id of flagged.keys()) {
    const s = stateBefore(id);
    if (s === 'practiced' || s === 'mastered' || s === 'validated') {
      if (s !== 'practiced') regressions.push(id);
      move(id, 'recognizes', `case ${payload.case_id} flagged ${flagged.get(id)!.map(f => f.tag).join(', ')}`);
      const p = get(id);
      const drills = DRILLS_CONFIG.rules.skill_drills[id];
      p.stage = drills?.repair ? 'repair' : drills?.l2 ? 'construct' : 'recognize';
      p.l1_streak = 0; p.l2_streak = 0; p.repair_sets = 0;
      p.transfer_due_at = null; p.next_review_at = null;
    }
  }
  // A Mastered skill observed with no findings becomes Validated.
  for (const id of payload.skills_observed) {
    if (stateBefore(id) === 'mastered' && !flagged.has(id)) move(id, 'validated', `case ${payload.case_id} used it with no mistakes`);
  }

  // Rules 2–4: score, drop skills with no live drill, take the top 3 with at
  // most 2 from one skill area.
  const w = DRILLS_CONFIG.rules.prescriptions.weights;
  const previouslyFlagged = new Set((previous?.findings ?? []).map(f => skillOf(f.tag)));
  const scored = [...flagged].filter(([id]) => hasLiveDrill(id, isLive)).map(([id, fs]) => ({
    id, fs,
    priority: fs.reduce((s, f) => s + (f.severity === 'major' ? w.major : w.minor), 0)
      + (previouslyFlagged.has(id) ? w.repeat_previous_case : 0)
      + (regressions.includes(id) ? w.regression : 0),
  }));
  // Ties: the skill in the lower state (after this case), then catalog order.
  scored.sort((a, b) => b.priority - a.priority
    || stateRank(get(a.id).state) - stateRank(get(b.id).state)
    || skillCatalogIndex(a.id, isLive) - skillCatalogIndex(b.id, isLive));
  const perArea = new Map<string, number>();
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.length >= DRILLS_CONFIG.rules.prescriptions.max_per_case) break;
    const area = getSkill(s.id).area;
    if ((perArea.get(area) ?? 0) >= 2) continue;
    perArea.set(area, (perArea.get(area) ?? 0) + 1);
    picked.push(s);
  }

  const prescriptions = picked.map(({ id, fs, priority }) => {
    const lead = fs.find(f => f.severity === 'major') ?? fs[0];
    if (get(id).state === 'not_started') move(id, 'learning', 'first prescription');
    const focusable = DRILLS_CONFIG.rules.focusable_tags[lead.tag] ? lead.tag : null;
    return { skill_id: id, priority, focus_tag: focusable, reason: caseReason(lead), evidence: lead.evidence };
  });
  return { progress, transitions, prescriptions, regressions };
}

// Rule 6: the reason quotes the student. Long quotes keep their last words.
export function caseReason(f: Finding): string {
  const words = f.evidence.trim().split(/\s+/);
  const quote = words.length > 25 ? `…${words.slice(-25).join(' ')}` : words.join(' ');
  const tag = getMistakeTag(f.tag)!;
  return `In your last case you said "${quote}". That's a ${tag.label}; this set practices ${lowerName(tag.skill)}.`;
}
