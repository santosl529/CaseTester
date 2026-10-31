'use client';
import { ArrowUp, BookOpen, Check } from 'lucide-react';
import { ADAPT, CHAPTERS, DRILL, LESSON, REPORT, WEEKS, WORKOUT_FROM_SNAPSHOT } from './content';
import { Caption, Orb, wordCount } from './call';
import { useScenes } from './motion';
import { ChapterLayout } from './ride';
import { Snapshot } from './ch-diagnose';
import { Row } from './hero-demo';
import s from './exhibition.module.css';

// Chapters 02–06 (Matt's brief, 23 Oct 2026, v2). Each picks its scene from
// how far its track has scrolled; each ends on the scene the next one starts
// from. Reduced motion: every chapter shows its last scene.

const d = (ms: number) => ({ '--delay': `${ms}ms` }) as React.CSSProperties;
// Each stage is sized to its final scene (phones first, then desktop).
const PANEL = `${s.panel} ${s.quiet} relative flex flex-col overflow-hidden`;
const H = {
  plan: 'h-[min(31rem,calc(100svh-5rem))] lg:h-[min(29rem,calc(100vh-6rem))]',
  learn: 'h-[min(36rem,calc(100svh-5rem))] lg:h-[min(27rem,calc(100vh-6rem))]',
  drill: 'h-[min(37rem,calc(100svh-5rem))] lg:h-[min(26.5rem,calc(100vh-6rem))]',
  mock: 'h-[min(38rem,calc(100svh-5rem))] lg:h-[min(35rem,calc(100vh-6rem))]',
  adapt: 'h-[min(33rem,calc(100svh-5rem))] lg:h-[min(26.5rem,calc(100vh-6rem))]',
};

// ---------- 02 · Your plan ----------

export function PlanChapter() {
  const { track, scene } = useScenes(4);
  const zoomed = scene >= 2;
  return (
    <ChapterLayout copy={CHAPTERS.plan} n={4} track={track}>
      <div className={`${PANEL} ${H.plan} p-4 sm:p-6`}>
        <div className={s.grow} data-on={!zoomed}>
          <div><div className="pb-5"><Snapshot compact /></div></div>
        </div>
        <div className={`${s.reveal}`} data-on={scene >= 1}>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Your plan · Standard, 6 weeks</p>
            <p className="text-xs text-(--ink)/65">Built from your diagnostic</p>
          </div>
          <div className="relative mt-4">
            <span aria-hidden="true" className={`${s.drawX} absolute top-[5px] right-0 left-0 hidden h-px bg-(--cobalt) sm:block`} data-on={scene >= 1} />
            <ol className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
              {WEEKS.map((theme, i) => {
                const today = i === 0;
                return (
                  <li key={theme} className={`${s.reveal} relative`} data-on={scene >= 1} style={d(200 + i * 160)}>
                    <span aria-hidden="true" className={`block h-[11px] w-[11px] rounded-full border-2 border-(--white) ${zoomed && today ? 'bg-(--cobalt) ring-4 ring-(--sky)' : 'bg-(--cobalt)'}`} />
                    <p className={`mt-2 text-xs font-semibold whitespace-nowrap ${zoomed && !today ? 'text-(--ink)/65' : ''}`}>Week {i + 1}</p>
                    {zoomed && today && <p className="mt-1"><span className="rounded-full bg-(--cobalt) px-1.5 py-0.5 text-xs font-semibold text-(--white)">Today</span></p>}
                    <p className={`mt-0.5 text-xs leading-snug ${zoomed && !today ? 'text-(--ink)/65' : 'text-(--ink)/70'}`}>{theme}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <section className={`${s.reveal} mt-6 rounded-[10px] border border-(--ink)/12 p-4`} data-on={scene >= 3}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-medium">Today’s workout</h3>
            <span className={`${s.figures} text-sm text-(--ink)/65`}>About 15 min · 3 sets</span>
          </div>
          <ol className="mt-1">
            {WORKOUT_FROM_SNAPSHOT.map((r, i) => (
              <li key={r.drill} className={`${s.grow} -mx-2`} data-on={scene >= 3} style={d(250 + i * 350)}><div><Row {...r} /></div></li>
            ))}
          </ol>
        </section>
      </div>
    </ChapterLayout>
  );
}

// ---------- 03 · Learn ----------

export function LearnChapter() {
  // The lesson opens with both answers; then the weak one is flagged, then the strong one.
  const { track, scene: raw } = useScenes(3);
  const scene = raw + 1;
  return (
    <ChapterLayout copy={CHAPTERS.learn} n={3} track={track}>
      <div className={`${PANEL} ${H.learn} p-4 sm:p-6`}>
        <p className="flex items-center gap-1.5 text-xs text-(--ink)/65"><BookOpen aria-hidden="true" className="h-3.5 w-3.5" />{LESSON.meta}</p>
        <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.02em]">{LESSON.title}</h3>
        <p className="mt-3 border-l-2 border-(--ink)/15 pl-3 text-sm leading-relaxed text-(--ink)/80">{LESSON.prompt}</p>
        <div className="mt-5 grid min-h-0 gap-3 sm:grid-cols-2">
          <div className={`${s.reveal} rounded-[10px] border border-(--ink)/12 p-3.5`} data-on={scene >= 1}>
            <p className="text-xs font-semibold text-(--ink)/65">{LESSON.weak.label}</p>
            <ol className="mt-2 space-y-1.5 text-sm">
              {LESSON.weak.buckets.map((b, i) => (
                <li key={b} className="flex gap-2"><span className="tabular-nums text-(--ink)/60">{i + 1}</span>
                  <span className={`rounded-[4px] px-1 transition-colors duration-500 ${scene >= 2 && i === LESSON.weak.flagged ? 'bg-(--ink)/10 underline decoration-(--ink)/40 decoration-wavy underline-offset-4' : ''}`}>{b}</span></li>
              ))}
            </ol>
            <p className={`${s.reveal} mt-3 border-t border-(--ink)/10 pt-2.5 text-sm font-medium`} data-on={scene >= 2} style={d(250)}>{LESSON.weak.note}</p>
          </div>
          <div className={`${s.reveal} rounded-[10px] border border-(--ink)/12 p-3.5`} data-on={scene >= 1} style={d(180)}>
            <p className="text-xs font-semibold text-(--ink)/65">{LESSON.strong.label}</p>
            <ol className="mt-2 space-y-1.5 text-sm leading-snug">
              {LESSON.strong.buckets.map((b, i) => (
                <li key={b} className="flex gap-2"><span className="tabular-nums text-(--ink)/60">{i + 1}</span>
                  <span className={`rounded-[4px] px-1 transition-colors duration-500 ${scene >= 3 ? 'bg-(--sky)' : ''}`} style={{ transitionDelay: `${i * 140}ms` }}>{b}</span></li>
              ))}
            </ol>
            <p className={`${s.reveal} mt-3 flex items-center gap-2 border-t border-(--ink)/10 pt-2.5 text-sm font-medium`} data-on={scene >= 3} style={d(600)}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />{LESSON.strong.note}
            </p>
          </div>
        </div>
      </div>
    </ChapterLayout>
  );
}

// ---------- 04 · Drill ----------

function TimerRing({ left }: { left: number }) {
  const C = 2 * Math.PI * 18;
  return (
    <span className="relative flex h-12 w-12 items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeWidth="3" />
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--cobalt)" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / 60)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      <span className={`${s.figures} text-xs font-semibold`}><span className="sr-only">Time left </span>0:{String(left).padStart(2, '0')}</span>
    </span>
  );
}

export function DrillChapter() {
  const { track, scene } = useScenes(4);
  const left = [48, 31, 22, 22][scene];
  const attempt = (answer: string, chip: string, correct: boolean, on: boolean, struck = false) => (
    <div className={`${s.reveal} flex flex-wrap items-center gap-x-3 gap-y-2`} data-on={on}>
      <span className={`${s.figures} flex h-11 w-24 flex-none items-center rounded-[8px] border px-3 text-lg font-medium ${correct ? 'border-(--mastery) shadow-[inset_0_0_0_1px_var(--mastery)]' : 'border-(--ink)/40 text-(--ink)/70'}`}>
        {struck ? <s>{answer}</s> : answer}
      </span>
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${correct ? 'bg-(--mastery) text-(--ink)' : 'bg-(--ink) text-(--white)'}`}>
        {correct && <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />}{chip}
      </span>
    </div>
  );
  return (
    <ChapterLayout copy={CHAPTERS.drill} n={4} track={track}>
      <div className={`${PANEL} ${H.drill} p-4 sm:p-6`}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-(--ink)/65">{DRILL.meta}</p>
          <TimerRing left={left} />
        </div>
        <p className="mt-3 text-xl font-medium leading-snug tracking-[-0.01em]">{DRILL.prompt}</p>
        {/* First try, then the second: the named mistake stays on screen. */}
        <div className="mt-5 space-y-3">
          {scene === 0 && <span className="flex h-11 w-36 items-center rounded-[8px] border border-(--ink)/25 px-3 text-lg text-(--ink)/60">Your answer</span>}
          {attempt(DRILL.wrong.answer, DRILL.wrong.chip, false, scene >= 1, scene >= 2)}
          {attempt(DRILL.right.answer, DRILL.right.chip, true, scene >= 2)}
        </div>
        <div className={`${s.reveal} ${s.revealX} mt-5 rounded-[10px] border border-(--cobalt)/60 bg-(--white) p-4`} data-on={scene >= 3}>
          <p className="text-xs font-semibold text-(--ink)/65">{DRILL.followup.meta}</p>
          <p className="mt-1.5 text-base font-medium leading-snug">{DRILL.followup.text}</p>
          <p className="mt-3 rounded-[6px] border border-(--ink)/15 px-3 py-2 text-sm text-(--ink)/60">Your reply · up to 60 words</p>
        </div>
      </div>
    </ChapterLayout>
  );
}

// ---------- 05 · Mock interview ----------

const RATING: Record<string, string> = {
  Strong: 'bg-(--mastery) text-(--ink)',
  Adequate: 'bg-(--sky) text-(--ink)',
  'Needs work': 'bg-(--cobalt) text-(--white)',
};

export function MockChapter() {
  const { track, scene } = useScenes(4);
  const call = scene === 0;
  return (
    <ChapterLayout copy={CHAPTERS.mock} n={4} track={track}>
      <div className={`${PANEL} ${H.mock} p-4 sm:p-5`}>
        {/* The same interviewer, near the end of a full case. */}
        <div className={s.grow} data-on={call}>
          <div>
            <div className="rounded-[10px] border border-(--ink)/12 p-4">
              <div className="flex items-center justify-between">
                <p className={`${s.caps} text-(--ink)`}>Sample interview</p>
                <p className={`${s.figures} flex items-center gap-2 text-sm text-(--ink)/70`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />24:38</p>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <Orb speaking={call} size={48} />
                <Caption text={REPORT.closing} lit={wordCount(REPORT.closing)} className="text-lg font-medium leading-snug" />
              </div>
            </div>
          </div>
        </div>
        <div className={`${s.reveal} flex min-h-0 flex-1 flex-col`} data-on={!call}>
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Feedback report</p>
            <p className="text-xs text-(--ink)/65">Fresh Basket · 24 min</p>
          </div>
          <ol aria-label="Stages" className="relative mt-3 flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:justify-between sm:gap-0">
            <span aria-hidden="true" className={`${s.drawX} absolute inset-x-2 top-1/2 hidden h-px bg-(--cobalt) sm:block`} data-on={scene >= 2} />
            {REPORT.stages.map((st, i) => (
              <li key={st} className={`${s.reveal} relative rounded-full border border-(--cobalt)/50 bg-(--white) px-2 py-0.5 text-xs font-medium sm:px-2.5 sm:text-xs`} data-on={scene >= 2} style={d(i * 140)}>{st}</li>
            ))}
          </ol>
          {/* The 8 skills, called out quietly: a label and a thin bracket that draws down beside the rows. */}
          <div className="relative mt-3 pl-3">
            <span aria-hidden="true" className={`${s.draw} absolute top-1 bottom-1 left-0 w-px bg-(--cobalt)`} data-on={!call} style={d(200)} />
            <p className={`${s.reveal} flex items-baseline gap-2 text-xs font-semibold text-(--cobalt)`} data-on={!call}>
              <span className={`${s.figures} rounded-full bg-(--sky) px-1.5 py-0.5 text-(--ink)`}>8</span>The 8 skills top firms hire for
            </p>
          <ul className="mt-1 divide-y divide-(--ink)/8">
            {REPORT.rows.map((r, i) => (
              <li key={r.skill} className={`${s.reveal} flex items-center justify-between gap-2 py-1.5 text-sm`} data-on={!call} style={d(150 + i * 110)}>
                <span>{r.skill}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RATING[r.rating]}`}>{r.rating}</span>
              </li>
            ))}
          </ul>
          </div>
          <div className="pt-4">
            <p className={`${s.reveal} inline-block rounded-[6px] bg-(--sky) px-2 py-1 text-sm italic`} data-on={scene >= 3}>“{REPORT.quote}”</p>
            <div className="ml-4"><span aria-hidden="true" className={`${s.draw} block h-6 w-px bg-(--cobalt)`} data-on={scene >= 3} style={d(250)} /></div>
            <div className={`${s.reveal} rounded-[10px] border border-(--ink)/12 p-3`} data-on={scene >= 3} style={d(450)}>
              <p className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--cobalt)" />{REPORT.point.label}</p>
              <p className="mt-1 text-sm text-(--ink)/80">{REPORT.point.text}</p>
            </div>
          </div>
        </div>
      </div>
    </ChapterLayout>
  );
}

// ---------- 06 · Plan updates ----------

export function AdaptChapter() {
  const { track, scene } = useScenes(4);
  return (
    <ChapterLayout copy={CHAPTERS.adapt} n={4} track={track}>
      {/* data-loop tells the rail to light Your plan: the cycle repeats. */}
      <div data-loop={scene === 3} className={`${PANEL} ${H.adapt} p-4 sm:p-6`}>
        {/* The cycle repeats: a line from the new row up the left edge, toward the rail's Your plan. */}
        <span aria-hidden="true" className={`${s.draw} absolute top-0 left-2.5 block h-[calc(100%-3rem)] max-h-[13rem] w-px origin-bottom bg-(--cobalt)`} data-on={scene >= 3} />
        <svg aria-hidden="true" viewBox="0 0 10 6" className={`${s.reveal} absolute top-0 left-[5px] h-1.5 w-2.5 rotate-180 fill-(--cobalt)`} data-on={scene >= 3}><path d="M0 0h10L5 6z" /></svg>
        <p className={`${s.reveal} flex items-center gap-1 pl-2 text-xs font-semibold text-(--cobalt)`} data-on={scene >= 3} style={d(400)}>
          <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />Back to Your plan
        </p>
        <div className={s.grow} data-on={scene === 0}>
          <div>
            <div className="mt-3 rounded-[10px] border border-(--ink)/12 p-3.5">
              <p className="text-xs font-semibold text-(--cobalt)">From your feedback report</p>
              <p className="mt-1 text-sm font-semibold">{ADAPT.point.label}</p>
              <p className="mt-0.5 text-sm text-(--ink)/80">{ADAPT.point.text}</p>
            </div>
          </div>
        </div>
        <section className="mt-3 rounded-[10px] border border-(--ink)/12 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-medium">Today’s workout</h3>
            <span className={`${s.figures} text-sm text-(--ink)/65`}>{scene >= 1 ? 'About 10 min · 2 sets' : 'About 4 min · 1 set'}</span>
          </div>
          <ol className="mt-1">
            <li className={`${s.grow} -mx-2 rounded-md transition-colors duration-700 ${scene >= 1 ? 'bg-(--sky)' : ''}`} data-on={scene >= 1}><div><Row {...ADAPT.newRow} /></div></li>
            {ADAPT.rows.map(r => <li key={r.drill} className="-mx-2"><Row {...r} /></li>)}
          </ol>
        </section>
        <div className="mt-5">
          <p className="text-sm font-medium">Skill map</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 sm:gap-2">
            {ADAPT.skills.map((sk, i) => (
              <li key={sk.name} className={`${s.level} flex items-center justify-between gap-2 rounded-[6px] px-3 py-1.5 text-sm font-medium sm:py-2`} data-on={scene >= 2} data-end={sk.end} style={d(i * 320)}>
                <span className="truncate">{sk.name}</span>
                <span className="flex-none">{scene >= 2 ? (sk.end === 'mastered' ? 'Mastered' : 'Practiced') : 'Learning'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChapterLayout>
  );
}
