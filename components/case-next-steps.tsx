import Link from 'next/link';
import { StartSetButton } from '@/components/drills/start-set-button';
import { buttonVariants } from '@/components/ui/button';
import { TrackedLink } from '@/components/tracked-link';
import { PrepareNextSteps } from '@/components/prepare-next-steps';
import type { NextStepsView } from '@/lib/drills/progress/report-view';
import { coveredBy, practicedSkills, type NextStepsSnapshot } from '@/lib/drills/next-steps';
import { KindTag } from '@/components/drills/kind-tag';

// "Your next steps" at the end of a case report (Matt, 15 Nov; proposal §3,
// wording approved with his edits). The list is fixed when the case result
// arrived; "done" and readiness come only from drill results. Shown only when
// CASE_TO_DRILLS is on (lib/drills/progress/report-view.ts).

// S8: a skill whose practice set an earlier skill's set covers. Its link (Matt, 22 Nov: option 2) jumps to that card,
// which the page outlines (:target), so the Start practice to press is plain; screen readers hear which set it is.
export const COVERED_LINK = 'Practice with the set above';
export const stepAnchor = (skillId: string) => `next-step-${skillId.replace(/[^\w-]/g, '-')}`;
export const coveredDetail = (s: NextStepsSnapshot, coverId: string) => {
  const cover = s.skills.find(k => k.skill_id === coverId);
  return `: the ${cover?.practice?.drill_name ?? 'practice'} set under ${cover?.name ?? 'the skill above'} also trains this skill`;
};
const COUNT = ['', 'The skill that would most improve your next case.', 'The two skills that would most improve your next case, most important first.', 'The three skills that would most improve your next case, most important first.'];
const WHEN_DONE = ['', 'When it is done, try', 'When both are done, try', 'When all three are done, try'];
const lessonHref = (skillId: string, caseId: string) => `/drills/learn/${encodeURIComponent(skillId)}?source=case_report&case=${caseId}`;

function Quote({ text, onPaper = false }: { text: string; onPaper?: boolean }) {
  return <blockquote className={`t-small mt-1 rounded-window px-3 py-2 text-ink/85 ${onPaper ? 'bg-white' : 'bg-paper'}`}>“{text}”</blockquote>;
}

// The report's jump link to this section (Matt, 21 Nov, pre-pilot audit S7: "Your next steps" was 17 phone screens
// down, after the eight dimension cards). Shown wherever the section has a heading (not the demo's one line).
export const NEXT_STEPS_ANCHOR = 'your-next-steps';
export const hasNextStepsSection = (view: NextStepsView | null | undefined) => Boolean(view && view.state !== 'demo');
export function NextStepsLink() {
  return (
    <p className="t-small">
      <a href={`#${NEXT_STEPS_ANCHOR}`} className="font-semibold text-cobalt underline-offset-4 hover:underline">Your next steps <span aria-hidden="true">↓</span></a>
    </p>
  );
}

export function CaseNextSteps({ view, sessionId }: { view: NextStepsView; sessionId: string }) {
  if (view.state === 'demo') {
    return (
      <p className="t-body">Take a full case to get your next steps.{' '}
        <Link href="/home#cases" className="font-semibold text-cobalt underline-offset-4 hover:underline">Go to cases</Link></p>
    );
  }
  if (view.state !== 'ready') {
    return (
      <section id="your-next-steps" aria-labelledby="next-steps" className="scroll-mt-20 space-y-3">
        <h2 id="next-steps" className="t-heading font-semibold">Your next steps</h2>
        <PrepareNextSteps sessionId={sessionId} state={view.state} />
      </section>
    );
  }
  const { snapshot: s, caseAttemptId } = view;
  const done = new Set(view.done);
  const practiced = practicedSkills(s);
  const nextCase = view.nextCase === 'all_taken' ? (
    <p className="t-small">You’ve taken every case. Retake one?</p>
  ) : view.nextCase ? (
    <p className="t-small"><span className="block">{s.all_clear ? 'Next case:' : view.ready ? 'You’re ready for your next case:' : WHEN_DONE[practiced.length] ?? 'When these are done, try'}</span>
      <span className="font-semibold">{view.nextCase.title} · {view.nextCase.difficulty}</span></p>
  ) : null;
  const goToCases = view.nextCase && (
    <TrackedLink href="/home#cases" className="t-small font-semibold text-cobalt underline-offset-4 hover:underline"
      track={{ case_attempt_id: caseAttemptId, skill_id: null, prescription_id: null, action: 'next_case', position: null }}>Go to cases</TrackedLink>
  );

  return (
    <section id="your-next-steps" aria-labelledby="next-steps" className="scroll-mt-20 space-y-5">
      <div className="space-y-1">
        <h2 id="next-steps" className="t-heading font-semibold">Your next steps</h2>
        {s.skills.length > 0 && <p className="t-small text-ink/70">{COUNT[s.skills.length]}</p>}
        {s.partial && <p className="t-small text-ink/70">You ended this case early, so these come from the parts you reached.</p>}
      </div>

      {s.all_clear && (
        <div className="space-y-2 rounded-panel border border-ink/12 bg-white p-5">
          <p className="t-body font-semibold">Nothing from this case needs practice. You’re ready for a harder case.</p>
          {nextCase}{goToCases}
        </div>
      )}
      {!s.all_clear && s.skills.length === 0 && !s.also && (
        <p className="t-body">No drill fits this case’s feedback yet. The points above are what to work on in your next case.</p>
      )}

      {s.skills.length > 0 && (
        <ol className="space-y-3">
          {s.skills.map((x, i) => (
            <li key={x.skill_id} id={stepAnchor(x.skill_id)} className="scroll-mt-24 space-y-2 rounded-panel border border-ink/12 bg-white p-5 target:border-cobalt target:ring-2 target:ring-cobalt">
              <h3 className="t-body font-semibold">{x.name}</h3>
              <p className="t-body">{x.why}</p>
              <Quote text={x.quote} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                {x.lesson && (
                  <TrackedLink href={lessonHref(x.skill_id, caseAttemptId)} className="t-small font-semibold text-cobalt underline-offset-4 hover:underline"
                    track={{ case_attempt_id: caseAttemptId, skill_id: x.skill_id, prescription_id: x.prescription_id, action: 'lesson', position: i }}>
                    Read the lesson <span className="font-normal text-ink/70">· {x.lesson.minutes} min</span>
                  </TrackedLink>
                )}
                {x.practice && (
                  <>
                    <StartSetButton label="Start practice" name={`Start practice: ${x.name}, about ${x.practice.minutes} minutes`}
                      variant={i === 0 ? 'default' : 'outline'}
                      body={{ prescription_id: x.prescription_id, report: { case_attempt_id: caseAttemptId, skill_id: x.skill_id }, ...(coveredBy(s, x.skill_id).length > 0 && { also_skills: coveredBy(s, x.skill_id) }) }}
                      track={{ case_attempt_id: caseAttemptId, skill_id: x.skill_id, prescription_id: x.prescription_id, action: 'practice', position: i }} />
                    <span className="t-small text-ink/70"><KindTag kind="drill" />{x.practice.drill_name} · Level {x.practice.level} · about {x.practice.minutes} min</span>
                  </>
                )}
                {x.covered_by && (
                  <a href={`#${stepAnchor(x.covered_by)}`} className={buttonVariants({ variant: 'outline' })}>
                    {COVERED_LINK} <span aria-hidden="true">↑</span><span className="sr-only">{coveredDetail(s, x.covered_by)}</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {s.also && (
        <div className="space-y-2 rounded-panel border border-ink/12 bg-paper p-5">
          <p className="t-label font-semibold text-ink/70">Also from this case</p>
          <h3 className="t-body font-semibold">{s.also.name}</h3>
          <p className="t-body">{s.also.why}</p>
          <Quote text={s.also.quote} onPaper />
          <p className="t-small text-ink/80">No drill for this skill yet, so you’ll practice it in full cases for now.{s.also.tip && ` ${s.also.tip}`}</p>
          {s.also.lesson && (
            <TrackedLink href={lessonHref(s.also.skill_id, caseAttemptId)} className="t-small font-semibold text-cobalt underline-offset-4 hover:underline"
              track={{ case_attempt_id: caseAttemptId, skill_id: s.also.skill_id, prescription_id: null, action: 'lesson', position: null }}>
              Read the lesson <span className="font-normal text-ink/70">· {s.also.lesson.minutes} min</span>
            </TrackedLink>
          )}
        </div>
      )}

      {practiced.length > 0 && (
        <div className="space-y-3 rounded-panel border border-ink/12 bg-white p-5">
          <h3 className="t-body font-semibold">Before your next case</h3>
          <ul className="space-y-1.5">
            {practiced.map(x => (
              <li key={x.skill_id} className="t-body flex items-start gap-2">
                <span aria-hidden="true" className={`mt-1.5 size-3 shrink-0 rounded-full ${done.has(x.skill_id) ? 'bg-mastery' : 'border-2 border-ink/25'}`} />
                <span>{done.has(x.skill_id) ? `${x.name}: passed a set` : `${x.name}: pass one set`}<span className="sr-only">{done.has(x.skill_id) ? ' (done)' : ' (to do)'}</span></span>
              </li>
            ))}
          </ul>
          <p className="t-small text-ink/70">About {view.minutes} minutes, with the lessons. Your daily workouts mix these with this week’s plan.</p>
          {nextCase && <div className="space-y-1 rounded-window bg-sky/60 p-3">{nextCase}{goToCases}</div>}
        </div>
      )}

      {view.strengths.length > 0 && (
        <div className="space-y-2">
          <h3 className="t-body font-semibold">What went well</h3>
          <ul className="space-y-2">
            {view.strengths.map(w => (
              <li key={w.label} className="t-body"><span className="font-semibold">{w.label}:</span> {w.text}{w.quote && <Quote text={w.quote} />}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
