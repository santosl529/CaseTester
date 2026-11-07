import { SetScreen, ResultsScreen, type ResultsData } from '@/components/drills/views/set';
import type { RunnerView } from '@/components/drills/runner';
import { getDrill, getSkill } from '@/lib/drills/config';
import { loadAuthoredItems } from '@/lib/drills/authored';
import { toPublicItem } from '@/lib/drills/public-item';
import { itemFeedback, type ItemFeedback } from '@/lib/drills/sets/feedback';
import { scoreItem, scoreStep } from '@/lib/drills/sets/scoring';
import { mistakeSummary } from '@/lib/drills/sets/summary';
import type { Item } from '@/lib/drills/item-schema';
import type { Canned } from '../_lib/guard';
import type { Screen } from '../_lib/types';

// Drill sets: real authored items (drill-items/), served by the guard from
// sample answers. Feedback is the app's own, computed here for every option
// with the scoring code, so each choice gets what the real set would show.

let cache: Item[] | null = null;
const items = (drillId: string) => (cache ??= loadAuthoredItems()).filter(i => i.drill_id === drillId && i.status === 'live');

function runnerView(setId: string, drillId: string, over: Partial<RunnerView> = {}): RunnerView {
  const drill = getDrill(drillId);
  const limits = (drill.time_limits_s ?? [60]).slice(0, 1).map(s => s * 1000);
  return {
    set_id: setId, diagnostic: null, lesson_skill: drill.primary_skills[0] ?? null, position: 0, size: drill.set_size ?? 8,
    drill: { id: drill.id, name: drill.name, level: drill.level }, skills: drill.skills.map(id => ({ id, name: getSkill(id).name })),
    focus_skill: null, time_limit_ms: limits[0], stage_limits_ms: limits, ai_graded: drill.scoring !== 'auto', pass_bar: drill.pass_bar,
    example: null, repair_hint: null, defend: null, untimed: false, timer_hidden: false, timer_choice_open: true, feedback_mode: 'immediate',
    ...over,
  };
}

const loaded = (item: Item, position: number, size: number, limitMs: number) => ({
  position, size, item: toPublicItem(item), time_limit_ms: limitMs, remaining_ms: limitMs, completed_steps: [],
});

// Chart read (EX-1): one choice per item, an exhibit, a timer and immediate feedback.
function chartRead(): { node: React.ReactNode; api: Canned[] } {
  const setId = 'preview-ex1';
  const all = items('EX-1');
  const served = all.slice(0, 8);
  const example = all[8] ?? null;
  const view = runnerView(setId, 'EX-1', {
    size: served.length,
    lesson_skill: 'EX.takeaway',
    example: example && {
      prompt: example.prompt, exhibit: example.exhibit, options: example.options.map(o => ({ id: o.id, text: o.text, correct: o.correct })),
      answer: example.options.find(o => o.correct)?.text ?? '', explanation: example.explanation,
    },
  });
  const byAnswer: Record<string, ItemFeedback> = {};
  served.forEach((item, position) => {
    for (const o of item.options) {
      byAnswer[`${position}:${o.id}`] = itemFeedback(item, scoreItem(item, { skipped: false, timedOut: false, steps: [scoreStep(item, 0, { type: 'choice', option_id: o.id }, false)] }));
    }
    byAnswer[`${position}:none`] = itemFeedback(item, scoreItem(item, { skipped: true, timedOut: false, steps: [] }));
  });
  return {
    node: <SetScreen view={view} expired={false} />,
    api: [
      { method: 'PUT', path: `/api/drills/sets/${setId}/timer`, body: { ok: true } },
      { method: 'PUT', path: '/api/me/drill-settings', body: { ok: true } },
      { method: 'POST', path: `/api/drills/sets/${setId}/pause`, body: { remaining_ms: view.time_limit_ms } },
      ...served.map((item, position): Canned => ({ method: 'GET', path: `/api/drills/sets/${setId}/items/${position}`, delayMs: 150, body: loaded(item, position, served.length, view.time_limit_ms) })),
      { method: 'POST', path: `/api/drills/sets/${setId}/attempts`, delayMs: 250, byBody: { paths: ['position', 'response.option_id'], map: byAnswer } },
      { method: 'POST', path: `/api/drills/sets/${setId}/reports`, body: { ok: true } },
    ],
  };
}

// Framework builder (PS-3): a written framework, graded by AI. The guard
// answers with a sample grade after a short wait.
function frameworkBuilder(): { node: React.ReactNode; api: Canned[] } {
  const setId = 'preview-ps3';
  const item = items('PS-3')[0];
  const checks = item.checks.slice(0, 5);
  const view = runnerView(setId, 'PS-3', { size: 4, lesson_skill: 'PS.case_specific' });
  const graded: ItemFeedback = {
    done: true, correct: false, score: 0.75, skipped: false, timed_out: false, steps: [], mistakes: [{ tag: 'M.missing_bucket', label: 'missing bucket' }],
    explanation: item.explanation,
    grading: {
      checks: checks.map((c, i) => ({
        check_id: c.check_id, question: c.question.split(' This counts:')[0], pass: i !== 2,
        evidence: i === 0 ? 'Revenue per car: price, mix of services, add-ons' : i === 1 ? 'Variable costs: parts, tires, technician hours' : i === 3 ? 'Competition: new chains nearby' : '',
        feedback: c.feedback,
      })),
      red_flags: [], model_answer: item.model_answer ?? null, review_flagged: false,
    },
  };
  return {
    node: <SetScreen view={view} expired={false} />,
    api: [
      { method: 'PUT', path: `/api/drills/sets/${setId}/timer`, body: { ok: true } },
      { method: 'PUT', path: '/api/me/drill-settings', body: { ok: true } },
      { method: 'POST', path: `/api/drills/sets/${setId}/pause`, body: { remaining_ms: view.time_limit_ms } },
      { method: 'GET', path: `/api/drills/sets/${setId}/items/0`, body: loaded(item, 0, 4, view.time_limit_ms) },
      { method: 'POST', path: `/api/drills/sets/${setId}/attempts`, delayMs: 300, body: { ...graded, grading: undefined, grading_now: true } },
      { method: 'GET', path: `/api/drills/sets/${setId}/items/0/feedback`, sequence: [{ status: 'pending' }, { status: 'pending' }, { status: 'ready', feedback: graded }] },
    ],
  };
}

function results(): ResultsData {
  const served = items('EX-1').slice(0, 8);
  const picks = ['correct', 'correct', 'wrong', 'correct', 'correct', 'skip', 'correct', 'correct'];
  const scored = served.map((item, position) => {
    const option = picks[position] === 'correct' ? item.options.find(o => o.correct)! : item.options.find(o => !o.correct)!;
    return picks[position] === 'skip'
      ? scoreItem(item, { skipped: true, timedOut: false, steps: [] })
      : scoreItem(item, { skipped: false, timedOut: false, steps: [scoreStep(item, 0, { type: 'choice', option_id: option.id }, false)] });
  });
  return {
    skill_changes: [{ skill_id: 'EX.takeaway', skill_name: 'Chart takeaway', from: 'learning', to: 'recognizes', transfer_due_at: null }],
    from_workout: true, lesson_skill: null, defend_lesson: null, set_id: 'preview-results', status: 'completed', drill: { id: 'EX-1', name: 'Chart read', level: 1 },
    ai_graded: false, focus_skill: 'EX.takeaway', score: 0.75, passed: false, pass_bar: 0.8, ungraded: 0, untimed: false,
    time_ms: 236_000, target_ms: 360_000, mistakes: mistakeSummary(scored),
    tier: { before: 1, after: 1 }, skill_scores: { 'EX.takeaway': { score: 0.75, count: 8 } },
    items: served.map((item, position) => ({
      position, prompt: item.prompt, exhibit: item.exhibit, options: item.options.map(o => ({ id: o.id, text: o.text, correct: o.correct })),
      time_ms: 20_000 + position * 3_100, time_limit_ms: 45_000, feedback: itemFeedback(item, scored[position]),
    })),
  };
}

export const SET_SCREENS: Screen[] = [
  { slug: 'drill-set', chrome: 'drills', area: 'Drills', title: 'Drill set: Chart read (intro → item → feedback)', pilot: true, render: chartRead },
  { slug: 'drill-set-written', chrome: 'drills', area: 'Drills', title: 'Drill set: Framework builder (written, AI-graded)', render: frameworkBuilder },
  { slug: 'drill-results', chrome: 'drills', area: 'Drills', title: 'Set results', render: () => ({ node: <ResultsScreen results={results()} checkin={{ id: 'preview-checkin', kind: 'set_usefulness' }} />, api: [{ method: 'POST', path: '/api/drills/checkins/preview-checkin', body: { ok: true } }] }) },
  { slug: 'drill-grading', chrome: 'drills', area: 'Drills', title: 'Set results: grading', render: () => ({ node: <ResultsScreen results={{ set_id: 'preview-grading', status: 'grading', delayed: false, drill: { id: 'PS-3', name: 'Framework builder', level: 2 } }} checkin={null} /> }) },
];
