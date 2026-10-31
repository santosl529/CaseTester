'use client';
import { ArrowUp, BookOpen, Check } from 'lucide-react';
import { ADAPT, CHAPTERS, DRILL, LESSON, REPORT, SAMPLE_PLAN, WEEKS, WORKOUT_FROM_SNAPSHOT } from './content';
import { Caption, Orb, wordCount } from './call';
import { seg, useScrub } from './motion';
import { ChapterLayout } from './ride';
import { Snapshot } from './ch-diagnose';
import { Row } from './hero-demo';
import { ThreadMark } from './thread';
import s from './exhibition.module.css';

// Chapters 02–06 (Matt's brief, 23 Oct 2026; scroll-scrubbed in v3). Each
// visual's state is a function of the chapter's scroll progress `p` (0–1):
// scroll down and it advances, scroll up and it reverses. Desktop gets the
// full scene; phones get a visual framed on the chapter's one focal moment.
// 02–04 build steadily; 05–06 resolve, and 06's skills turning green get the
// longest track. Reduced motion: p = 1 (every chapter's last scene).

const d = (ms: number) => ({ '--delay': `${ms}ms` }) as React.CSSProperties;
const PANEL = `${s.panel} ${s.quiet} relative flex flex-col overflow-hidden`;

type WorkoutRow = { slot: string; drill: string; reason: string; minutes: string; thread?: boolean };

export function Workout({ rows, on, highlight = -1, minutes }: { rows: readonly WorkoutRow[]; on: (i: number) => boolean; highlight?: number; minutes: string }) {
  return (
    <section aria-label="Today’s workout" className="rounded-[10px] border border-(--ink)/12 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="t-small font-semibold">Today’s workout</h3>
        <span className={`${s.figures} t-small text-(--ink)/65`}>{minutes}</span>
      </div>
      <ol className="mt-1">
        {rows.map((r, i) => (
          <li key={r.drill} className={`${s.grow} -mx-2 rounded-md transition-colors duration-500 ${i === highlight && on(i) ? 'bg-(--sky)' : ''}`} data-on={on(i)}><div><Row {...r} /></div></li>
        ))}
      </ol>
    </section>
  );
}

// ---------- 02 · Your plan (steady build) ----------

function PlanHeader() {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="t-small"><span className="font-semibold">{SAMPLE_PLAN.owner}</span> <span className="text-(--ink)/65">· {SAMPLE_PLAN.track} · Sample</span></p>
      <p className="t-small font-medium text-(--cobalt)">{SAMPLE_PLAN.interview}</p>
    </div>
  );
}

export function PlanChapter() {
  const { track, p } = useScrub();
  const snapshot = p < 0.42;
  const zoomed = p >= 0.42;
  const themes = WEEKS.map((_, i) => p >= 0.12 + i * 0.045);
  const rows = WORKOUT_FROM_SNAPSHOT.map((_, i) => p >= 0.55 + i * 0.12);
  const rowsMobile = WORKOUT_FROM_SNAPSHOT.map((_, i) => p >= 0.2 + i * 0.22);
  return (
    <ChapterLayout copy={CHAPTERS.plan} len={1.2} track={track} thread="focus"
      desktop={
        // Sized to its tallest scene, so the pinned panel never jumps as it builds.
        <div className={`${PANEL} min-h-[28.25rem] p-6`}>
          {/* The snapshot from chapter 01 hands over to the plan, then the day zooms in. */}
          <div className={s.grow} data-on={snapshot}><div><div className="pb-5"><Snapshot /></div></div></div>
          <PlanHeader />
          <div className="relative mt-4">
            <span aria-hidden="true" className="absolute top-[5px] left-0 h-px bg-(--cobalt)" style={{ width: `${seg(p, 0.1, 0.38) * 100}%` }} />
            <ol className="grid grid-cols-6 gap-x-3">
              {WEEKS.map((theme, i) => {
                const today = i === 0;
                return (
                  <li key={theme} className={s.reveal} data-on={themes[i]}>
                    <span aria-hidden="true" className={`block h-[11px] w-[11px] rounded-full border-2 border-(--white) bg-(--cobalt) ${zoomed && today ? 'ring-4 ring-(--sky)' : ''}`} />
                    <p className={`t-label mt-2 font-semibold whitespace-nowrap ${zoomed && !today ? 'text-(--ink)/65' : ''}`}>Week {i + 1}</p>
                    {today && <p className={`${s.reveal} mt-1`} data-on={zoomed}><span className="t-label rounded-full bg-(--cobalt) px-1.5 py-0.5 font-semibold text-(--white)">Today</span></p>}
                    <p className={`t-label mt-0.5 ${zoomed && !today ? 'text-(--ink)/65' : 'text-(--ink)/75'}`}>{theme}</p>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className={`${s.reveal} mt-5`} data-on={zoomed}>
            <Workout rows={WORKOUT_FROM_SNAPSHOT} on={i => rows[i]} highlight={0} minutes="About 20 min · 3 sets" />
          </div>
        </div>
      }
      mobile={
        // Phones: today's workout building row by row, under a thin progress bar.
        <div className={`${PANEL} p-4`}>
          <PlanHeader />
          <div className="mt-3">
            <p className="t-label flex justify-between gap-2 text-(--ink)/75"><span className="font-semibold text-(--ink)">Week 1 of 6</span><span>{WEEKS[0]}</span></p>
            <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--ink)/10"><div className="h-full w-1/6 rounded-full bg-(--cobalt)" /></div>
          </div>
          <div className="mt-4"><Workout rows={WORKOUT_FROM_SNAPSHOT} on={i => rowsMobile[i]} highlight={0} minutes="About 20 min · 3 sets" /></div>
        </div>
      }
    />
  );
}

// ---------- 03 · Learn (steady build) ----------

// The weak answer: a plain profit tree that could fit any company. Once
// flagged, every node is marked generic.
function ProfitTree({ flagged }: { flagged: boolean }) {
  const mark = `rounded-[4px] px-1 transition-colors duration-300 ${flagged ? 'bg-(--ink)/10 underline decoration-(--ink)/40 decoration-wavy underline-offset-4' : ''}`;
  return (
    <div className="t-small mt-2">
      <p><span className={`${mark} font-medium`}>{LESSON.weak.root}</span></p>
      <ul className="mt-1.5 ml-2 space-y-1.5 border-l border-(--ink)/25 pl-3">
        {LESSON.weak.branches.map(b => (
          <li key={b.name} className="relative">
            <span aria-hidden="true" className="absolute top-[0.75em] -left-3 w-2.5 border-t border-(--ink)/25" />
            <span className={mark}>{b.name}</span> <span className="text-(--ink)/65">· {b.parts}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answers({ p }: { p: number }) {
  const weakFlag = p >= 0.2, weakNote = p >= 0.3;
  const strong = LESSON.strong.buckets.map((_, i) => p >= 0.45 + i * 0.09);
  const strongNote = p >= 0.85;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-[10px] border border-(--ink)/12 p-3.5">
        <p className="t-label font-semibold text-(--ink)/65">{LESSON.weak.label}</p>
        <ProfitTree flagged={weakFlag} />
        <p className={`${s.reveal} t-small mt-3 border-t border-(--ink)/10 pt-2.5 font-medium`} data-on={weakNote}>{LESSON.weak.note}</p>
      </div>
      <div className="rounded-[10px] border border-(--ink)/12 p-3.5">
        <p className="t-label font-semibold text-(--ink)/65">{LESSON.strong.label}</p>
        <ol className="t-small mt-2 space-y-1.5">
          {LESSON.strong.buckets.map((b, i) => (
            <li key={b} className="flex gap-2"><span className="tabular-nums text-(--ink)/65">{i + 1}</span>
              <span className={`rounded-[4px] px-1 transition-colors duration-300 ${strong[i] ? 'bg-(--sky)' : ''}`}>{b}</span></li>
          ))}
        </ol>
        <p className={`${s.reveal} t-small mt-3 flex items-center gap-2 border-t border-(--ink)/10 pt-2.5 font-medium`} data-on={strongNote}>
          <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />{LESSON.strong.note}
        </p>
      </div>
    </div>
  );
}

// Phones: the weak profit tree stacked above the strong answer, so the pair
// fits a 360 × 740 screen under the header.
function AnswersStacked({ p }: { p: number }) {
  const weakFlag = p >= 0.2, weakNote = p >= 0.3;
  const strong = LESSON.strong.buckets.map((_, i) => p >= 0.45 + i * 0.09);
  const strongNote = p >= 0.85;
  return (
    <div className="space-y-2.5">
      <div className="rounded-[10px] border border-(--ink)/12 p-3">
        <p className="t-label font-semibold text-(--ink)/65">{LESSON.weak.label}</p>
        <ProfitTree flagged={weakFlag} />
        <p className={`${s.reveal} t-small mt-1.5 font-medium`} data-on={weakNote}>{LESSON.weak.note}</p>
      </div>
      <div className="rounded-[10px] border border-(--ink)/12 p-3">
        <p className="t-label font-semibold text-(--ink)/65">{LESSON.strong.label}</p>
        <ol className="t-small mt-1.5 space-y-1">
          {LESSON.strong.buckets.map((b, i) => (
            <li key={b} className="flex gap-2"><span className="tabular-nums text-(--ink)/65">{i + 1}</span>
              <span className={`rounded-[4px] px-1 transition-colors duration-300 ${strong[i] ? 'bg-(--sky)' : ''}`}>{b}</span></li>
          ))}
        </ol>
        <p className={`${s.reveal} t-small mt-2 flex items-center gap-2 font-medium`} data-on={strongNote}>
          <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-(--cobalt)" />{LESSON.strong.note}
        </p>
      </div>
    </div>
  );
}

export function LearnChapter() {
  const { track, p } = useScrub();
  const head = (
    <>
      <p className="t-label flex items-center gap-1.5 text-(--ink)/65"><BookOpen aria-hidden="true" className="h-3.5 w-3.5" />{LESSON.meta}<ThreadMark className="ml-1" /></p>
      <h3 className="t-card mt-1.5 font-semibold tracking-[-0.02em]">{LESSON.title}</h3>
      <p className="t-small mt-3 border-l-2 border-(--ink)/15 pl-3 text-(--ink)/80">{LESSON.prompt}</p>
    </>
  );
  return (
    <ChapterLayout copy={CHAPTERS.learn} len={1.1} track={track} thread="learning"
      desktop={<div className={`${PANEL} p-6`}>{head}<div className="mt-5"><Answers p={p} /></div></div>}
      mobile={
        <div className={`${PANEL} p-4`}>
          <p className="t-label flex items-center gap-1.5 text-(--ink)/65"><BookOpen aria-hidden="true" className="h-3.5 w-3.5" />{LESSON.meta}<ThreadMark className="ml-1" /></p>
          <h3 className="t-card mt-1 font-semibold tracking-[-0.02em]">{LESSON.title}</h3>
          <p className="t-small mt-1.5 text-(--ink)/80">{LESSON.prompt}</p>
          <div className="mt-3"><AnswersStacked p={p} /></div>
        </div>
      } />
  );
}

// ---------- 04 · Drill (steady build) ----------

export function TimerRing({ left }: { left: number }) {
  const C = 2 * Math.PI * 18;
  return (
    <span className="relative flex h-12 w-12 flex-none items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeWidth="3" />
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--cobalt)" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / 60)} />
      </svg>
      <span className={`${s.figures} t-label font-semibold`}><span className="sr-only">Time left </span>0:{String(left).padStart(2, '0')}</span>
    </span>
  );
}

export function Chip({ correct, children }: { correct: boolean; children: React.ReactNode }) {
  return (
    <span className={`t-small inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors duration-300 ${correct ? 'bg-(--mastery) text-(--ink)' : 'bg-(--ink) text-(--white)'}`}>
      {correct && <Check aria-hidden="true" className="h-3.5 w-3.5 flex-none" strokeWidth={3} />}{children}
    </span>
  );
}

function FollowUp({ on }: { on: boolean }) {
  return (
    <div className={`${s.reveal} ${s.revealX} rounded-[10px] border border-(--cobalt)/60 bg-(--white) p-4`} data-on={on}>
      <p className="t-label font-semibold text-(--ink)/65">{DRILL.followup.meta}</p>
      <p className="t-body mt-1.5 font-medium">{DRILL.followup.text}</p>
      <p className="t-small mt-3 rounded-[6px] border border-(--ink)/15 px-3 py-2 text-(--ink)/65">Your reply · up to 60 words</p>
    </div>
  );
}

export function AnswerBox({ answer, correct, struck = false }: { answer: string; correct: boolean; struck?: boolean }) {
  return (
    <span className={`${s.figures} t-body flex h-11 w-24 flex-none items-center rounded-[8px] border px-3 font-medium ${correct ? 'border-(--mastery) shadow-[inset_0_0_0_1px_var(--mastery)]' : 'border-(--ink)/40 text-(--ink)/70'}`}>
      {struck ? <s>{answer}</s> : answer}
    </span>
  );
}

export function DrillChapter() {
  const { track, p } = useScrub();
  const left = Math.round(48 - seg(p, 0, 0.5) * 26);
  const first = p >= 0.18, second = p >= 0.45, follow = p >= 0.7;
  const head = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="t-small flex items-center gap-2 text-(--ink)/65"><ThreadMark />{DRILL.meta}</p>
        <TimerRing left={left} />
      </div>
      <p className="t-card mt-3 font-medium">{DRILL.prompt}</p>
    </>
  );
  return (
    <ChapterLayout copy={CHAPTERS.drill} len={1.1} track={track} thread={second ? 'practiced' : 'learning'}
      desktop={
        <div className={`${PANEL} p-6`}>
          {head}
          {/* First try, then the second: the named mistake stays on screen. */}
          <div className="mt-5 space-y-3">
            <div className={`${s.reveal} flex items-center gap-3`} data-on={first}><AnswerBox answer={DRILL.wrong.answer} correct={false} struck={second} /><Chip correct={false}>{DRILL.wrong.chip}</Chip></div>
            <div className={`${s.reveal} flex items-center gap-3`} data-on={second}><AnswerBox answer={DRILL.right.answer} correct /><Chip correct>{DRILL.right.chip}</Chip></div>
          </div>
          <div className="mt-5"><FollowUp on={follow} /></div>
        </div>
      }
      mobile={
        // Phones: one answer and one chip that turns from the mistake's name to green Correct.
        <div className={`${PANEL} p-4`}>
          {head}
          <div className="mt-4"><AnswerBox answer={second ? DRILL.right.answer : first ? DRILL.wrong.answer : '—'} correct={second} /></div>
          <div className={`${s.reveal} mt-3`} data-on={first} aria-live="off"><Chip correct={second}>{second ? DRILL.right.chip : DRILL.wrong.chip}</Chip></div>
          <div className="mt-4"><FollowUp on={follow} /></div>
        </div>
      }
    />
  );
}

// ---------- 05 · Mock interview (calm resolution) ----------

const RATING: Record<string, string> = {
  Strong: 'bg-(--mastery) text-(--ink)',
  Adequate: 'bg-(--sky) text-(--ink)',
  'Needs work': 'bg-(--cobalt) text-(--white)',
};
const DOT: Record<string, string> = {
  Strong: 'bg-(--mastery)',
  Adequate: 'bg-(--sky) ring-1 ring-(--ink)/30',
  'Needs work': 'bg-(--cobalt)',
};

function Point({ quoteOn, pointOn }: { quoteOn: boolean; pointOn: boolean }) {
  return (
    <div>
      <p className={`${s.reveal} t-small flex items-start gap-2 rounded-[6px] bg-(--sky) px-2 py-1 italic`} data-on={quoteOn}><ThreadMark className="mt-1.5" /><span>“{REPORT.quote}”</span></p>
      <div className="ml-4"><span aria-hidden="true" className={`${s.draw} block h-6 w-px bg-(--mastery)`} data-on={pointOn} /></div>
      <div className={`${s.reveal} rounded-[10px] border border-(--ink)/12 p-3`} data-on={pointOn} style={d(200)}>
        <p className="t-small flex items-center gap-2 font-semibold"><span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-(--mastery)" />{REPORT.point.label}</p>
        <p className="t-small mt-1 text-(--ink)/80">{REPORT.point.text}</p>
      </div>
    </div>
  );
}

function EightLabel({ on }: { on: boolean }) {
  return (
    <p className={`${s.reveal} t-label flex items-baseline gap-2 font-semibold text-(--cobalt)`} data-on={on}>
      <span className={`${s.figures} rounded-full bg-(--sky) px-1.5 py-0.5 text-(--ink)`}>8</span>The 8 skills top firms hire for
    </p>
  );
}

export function MockChapter() {
  const { track, p } = useScrub();
  const call = p < 0.18;
  const rows = REPORT.rows.map((_, i) => p >= 0.18 + i * 0.04);
  const stages = p >= 0.58, quote = p >= 0.7, point = p >= 0.8;
  const rowsMobile = REPORT.rows.map((_, i) => p >= 0.08 + i * 0.035);
  return (
    <ChapterLayout copy={CHAPTERS.mock} len={1.25} track={track} thread={p >= 0.7 ? 'passed' : 'practiced'}
      desktop={
        <div className={`${PANEL} p-5`}>
          {/* The same interviewer, near the end of a full case, then the report it
              produced, in the same place (stacked, so the panel never changes size). */}
          <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
            <div className={`${s.reveal} self-center`} data-on={call}>
              <div className="rounded-[10px] border border-(--ink)/12 p-4">
                <div className="flex items-center justify-between">
                  <p className={`${s.caps} t-label text-(--ink)`}>Sample interview</p>
                  <p className={`${s.figures} t-small flex items-center gap-2 text-(--ink)/70`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />24:38</p>
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <Orb speaking={call} size={48} />
                  <Caption text={REPORT.closing} lit={wordCount(REPORT.closing)} className="t-body font-medium" />
                </div>
              </div>
            </div>
            <div className={s.reveal} data-on={!call}>
              <div className="flex items-baseline justify-between">
                <p className="t-small font-semibold">Feedback report</p>
                <p className="t-label text-(--ink)/65">{REPORT.case} · Day 12 · 24 min</p>
              </div>
              <ol aria-label="Stages" className="relative mt-3 flex items-center justify-between">
                <span aria-hidden="true" className="absolute inset-x-2 top-1/2 h-px bg-(--cobalt) transition-opacity duration-300" style={{ opacity: stages ? 1 : 0 }} />
                {REPORT.stages.map((st, i) => (
                  <li key={st} className={`${s.reveal} t-label relative rounded-full border border-(--cobalt)/50 bg-(--white) px-2.5 py-0.5 font-medium`} data-on={stages} style={d(i * 80)}>{st}</li>
                ))}
              </ol>
              <div className="relative mt-3 pl-3">
                <span aria-hidden="true" className="absolute top-1 bottom-1 left-0 w-px bg-(--cobalt) transition-opacity duration-300" style={{ opacity: rows[0] ? 1 : 0 }} />
                <EightLabel on={rows[0]} />
                <ul className="mt-1 divide-y divide-(--ink)/8">
                  {REPORT.rows.map((r, i) => (
                    <li key={r.skill} className={`${s.reveal} t-small flex items-center justify-between gap-2 py-1.5 ${r.thread ? '-mx-2 rounded-md bg-(--sky)/50 px-2' : ''}`} data-on={rows[i]}>
                      <span className="flex items-center gap-2">{r.thread && <ThreadMark />}{r.skill}{r.was && <span className="t-label text-(--ink)/65">{r.was}</span>}</span>
                      <span className={`t-label rounded-full px-2 py-0.5 font-semibold ${RATING[r.rating]}`}>{r.rating}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-4"><Point quoteOn={quote} pointOn={point} /></div>
            </div>
          </div>
        </div>
      }
      mobile={
        // Phones: a compact list of the 8 skills above one feedback point and its quote.
        <div className={`${PANEL} p-4`}>
          <div className="flex items-baseline justify-between">
            <p className="t-small font-semibold">Feedback report</p>
            <p className="t-label text-(--ink)/65">{REPORT.case} · Day 12</p>
          </div>
          <div className="mt-2"><EightLabel on={rowsMobile[0]} /></div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {REPORT.rows.map((r, i) => (
              <li key={r.skill} className={`${s.reveal} t-label flex min-w-0 items-baseline gap-1.5`} data-on={rowsMobile[i]}>
                <span aria-hidden="true" className={`h-2 w-2 flex-none translate-y-px rounded-full ${DOT[r.rating]}`} />
                <span className={r.thread ? 'font-semibold' : ''}>{r.skill}{r.thread && <ThreadMark className="ml-1.5" />}</span>
                <span className="sr-only">: {r.rating}</span>
              </li>
            ))}
          </ul>
          <p aria-hidden="true" className={`${s.reveal} t-label mt-2.5 flex flex-wrap gap-x-3 text-(--ink)/65`} data-on={rowsMobile[REPORT.rows.length - 1]}>
            {Object.keys(DOT).map(k => <span key={k} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${DOT[k]}`} />{k}</span>)}
          </p>
          <div className="mt-4"><Point quoteOn={p >= 0.62} pointOn={p >= 0.7} /></div>
        </div>
      }
    />
  );
}

// ---------- 06 · Plan updates (the payoff: slowest, most room) ----------

const LEVEL = {
  learning: { label: 'Learning', cls: 'bg-(--sky) text-(--ink)' },
  practiced: { label: 'Practiced', cls: 'bg-(--cobalt) text-(--white)' },
  mastered: { label: 'Mastered', cls: 'bg-(--mastery) text-(--ink)' },
};

type Level = keyof typeof LEVEL;

// The other chips climb first, in turn (Learning → Practiced → Mastered, each
// capped at its own end); then Lorenzo's Math setup, already Practiced from
// his drills, turns green last and slowest: the story's payoff.
const THREAD_FROM = 0.6, THREAD_TO = 0.9;
function levelOf(sk: (typeof ADAPT.skills)[number], j: number, p: number, from: number, span: number): Level {
  if (sk.thread) return seg(p, THREAD_FROM, THREAD_TO) < 0.6 ? 'practiced' : 'mastered';
  const t = seg(p, from + j * span * 0.6, from + j * span * 0.6 + span);
  const raw: Level = t < 0.4 ? 'learning' : t < 0.85 ? 'practiced' : 'mastered';
  const order: Level[] = ['learning', 'practiced', 'mastered'];
  return order[Math.min(order.indexOf(raw), order.indexOf(sk.end))];
}
const threadLevel = (p: number) => levelOf(ADAPT.skills[0], 0, p, 0, 1);

// `names` shows only those skills, in that order (the homepage's device).
export function SkillLevels({ p, from, span, stacked = false, names }: { p: number; from: number; span: number; stacked?: boolean; names?: string[] }) {
  const others = ADAPT.skills.filter(sk => !sk.thread);
  const shown = names ? names.map(n => ADAPT.skills.find(sk => sk.name === n)!) : ADAPT.skills;
  return (
    <ul className={`grid gap-2 ${stacked ? '' : 'grid-cols-2'}`}>
      {shown.map(sk => {
        const level = levelOf(sk, others.indexOf(sk), p, from, span);
        return (
          <li key={sk.name} className={`${s.level} t-small flex items-center justify-between gap-2 rounded-[6px] px-3 py-2 font-medium ${LEVEL[level].cls} ${sk.thread ? 'ring-2 ring-(--ink) ring-offset-2 ring-offset-(--white)' : ''}`}>
            <span className="flex min-w-0 items-center gap-2">{sk.thread && <ThreadMark />}<span className="truncate">{sk.name}</span></span>
            <span className="flex-none">{LEVEL[level].label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function AdaptChapter() {
  const { track, p } = useScrub();
  const pointOn = p < 0.14;
  const row = p >= 0.14;
  const back = p >= 0.94;
  return (
    <ChapterLayout copy={CHAPTERS.adapt} len={1.5} track={track} thread={threadLevel(p) === 'mastered' ? 'mastered' : 'passed'}
      desktop={
        <div data-loop={back} className={`${PANEL} min-h-[29.625rem] p-6`}>
          {/* The cycle repeats: a line from the new row up the left edge, toward the rail's Your plan. */}
          <span aria-hidden="true" className={`${s.draw} absolute top-0 left-2.5 block h-[11rem] w-px origin-bottom bg-(--cobalt)`} data-on={back} />
          <p className={`${s.reveal} t-label flex items-center gap-1 pl-2 font-semibold text-(--cobalt)`} data-on={back}>
            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />Back to Your plan: the next weak spot starts the loop again
          </p>
          <div className={s.grow} data-on={pointOn}>
            <div>
              <div className="mt-3 rounded-[10px] border border-(--ink)/12 p-3.5">
                <p className="t-label font-semibold text-(--cobalt)">From his Day 12 feedback report</p>
                <p className="t-small mt-1 font-semibold">{ADAPT.point.label}</p>
                <p className="t-small mt-0.5 text-(--ink)/80">{ADAPT.point.text}</p>
              </div>
            </div>
          </div>
          <div className="mt-3"><Workout rows={[ADAPT.newRow, ...ADAPT.rows]} on={i => i > 0 || row} highlight={0} minutes={row ? 'About 20 min · 3 sets' : 'About 12 min · 2 sets'} /></div>
          <p className="t-small mt-5 font-medium">Skill map</p>
          <div className="mt-2"><SkillLevels p={p} from={0.2} span={0.14} /></div>
        </div>
      }
      mobile={
        // Phones: the skill chips alone, stacked, climbing; Math setup turns green last.
        <div data-loop={back} className={`${PANEL} p-4`}>
          <p className="t-small font-semibold">Skill map</p>
          <p className="t-label mt-0.5 text-(--ink)/65">Learning · Practiced · Mastered</p>
          <div className="mt-3"><SkillLevels p={p} from={0.08} span={0.16} stacked /></div>
          <p className={`${s.reveal} t-label mt-4 flex items-center gap-1 font-semibold text-(--cobalt)`} data-on={back}>
            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />Back to Your plan: next up, Percentages
          </p>
        </div>
      }
    />
  );
}
