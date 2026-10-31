'use client';
import { useState } from 'react';
import { ArrowUp, Pause, Play } from 'lucide-react';
import { HERO_CALL, HERO_STEPS } from './content';
import { Caption, Orb, Waveform, wordCount } from './call';
import { useClock, useOnScreen, useReducedMotion } from './motion';
import { ThreadMark } from './thread';
import s from './exhibition.module.css';

// The hero's product demo (Matt's brief, 23 Oct 2026, v2): a live voice
// interview first (the interviewer asks, the candidate answers), then the
// gap is caught, then today's workout gains a row and the skill moves. One
// clock drives it (~12 s, looping) and stops when paused or off screen. Reduced motion: the last step, still,
// with the step rail to look at each step by hand.

const STARTS = HERO_STEPS.reduce<number[]>((acc, _, i) => [...acc, i === 0 ? 0 : acc[i - 1] + HERO_STEPS[i - 1].ms], []);
const TOTAL = HERO_STEPS.reduce((n, st) => n + st.ms, 0);
const ASK = { from: 300, per: 240, n: wordCount(HERO_CALL.ask) };
const ANSWER = { from: 1900, per: 270, n: wordCount(HERO_CALL.answer) };
const lit = (t: number, w: { from: number; per: number; n: number }) => Math.max(0, Math.min(w.n, Math.floor((t - w.from) / w.per) + 1));
const clock = (t: number) => { const sec = 4 * 60 + 12 + Math.floor(t / 1000); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };

export function HeroDemo() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [offset, setOffset] = useState(0);
  const [still, setStill] = useState<number | null>(null);
  const { ref, on } = useOnScreen<HTMLDivElement>(0.2);
  const ms = useClock('hero', !paused && on, 0);
  // Reduced motion shows a step's end state; otherwise the clock runs the loop.
  const t = reduced ? (still ?? TOTAL - 1) : (ms + offset) % TOTAL;
  const step = STARTS.findLastIndex(st => t >= st);

  const jump = (i: number) => {
    if (reduced) setStill(STARTS[i] + HERO_STEPS[i].ms - 1);
    else setOffset(STARTS[i] - (ms % TOTAL) + TOTAL);
  };

  return (
    <div ref={ref}>
      <div data-paused={paused || !on} className={`${s.panel} ${s.bleed} relative -mx-6 h-[33rem] overflow-hidden sm:mx-0 sm:h-[30rem]`}>
        <CallView active={step <= 1} t={t} gap={step >= 1} />
        <WorkoutView active={step === 2} t={t - STARTS[2]} />
      </div>
      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        {!reduced && (
          <button type="button" onClick={() => setPaused(p => !p)} className="btn-secondary flex-none">
            {paused ? <Play aria-hidden="true" className="h-3.5 w-3.5" /> : <Pause aria-hidden="true" className="h-3.5 w-3.5" />}
            {paused ? 'Play' : 'Pause'}<span className="sr-only"> demo</span>
          </button>
        )}
        <ol aria-label="Demo steps" className="grid w-full flex-1 grid-cols-3 gap-2">
          {HERO_STEPS.map((st, i) => {
            const fill = Math.min(1, Math.max(0, (t - STARTS[i]) / st.ms));
            return (
              <li key={st.label}>
                <button type="button" onClick={() => jump(i)} aria-current={i === step ? 'step' : undefined}
                  className={`t-label w-full rounded-sm pt-1 text-left whitespace-nowrap transition-colors ${i === step ? 'font-semibold text-(--ink)' : 'text-(--ink)/65 hover:text-(--cobalt)'}`}>
                  <span className={s.railBar}><span className={s.railFill} style={{ transform: `scaleX(${reduced ? (i <= step ? 1 : 0) : fill})` }} /></span>
                  <span className="mt-2 block">{st.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// Steps 1–2: the voice interview window, recreated from the product's voice page.
function CallView({ active, t, gap }: { active: boolean; t: number; gap: boolean }) {
  const asking = t >= ASK.from && t < ASK.from + ASK.n * ASK.per + 300;
  const answering = t >= ANSWER.from && t < ANSWER.from + ANSWER.n * ANSWER.per + 300;
  return (
    <div className={`${s.view} flex flex-col`} data-active={active} aria-hidden={!active}>
      <div className="flex items-center justify-between border-b border-(--ink)/10 px-5 py-3.5 sm:px-6">
        <p className={`${s.caps} t-label text-(--ink)`}>Sample interview</p>
        <p className={`${s.figures} t-small flex items-center gap-2 text-(--ink)/70`}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />{clock(Math.min(t, 4999))}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-6 sm:px-7">
        <div className="flex items-center gap-3">
          <Orb speaking={asking} size={52} />
          <div>
            <p className="t-small font-semibold">Interviewer</p>
            <p className="t-label text-(--ink)/65">{HERO_CALL.context}</p>
          </div>
        </div>
        <Caption text={HERO_CALL.ask} lit={lit(t, ASK)} className="t-card mt-5 font-medium tracking-[-0.01em]" />
        <div className="mt-6">
          <p className="t-label font-semibold tracking-[0.04em] text-(--ink)/65">Lorenzo</p>
          <Caption text={HERO_CALL.answer} lit={lit(t, ANSWER)} className="t-body mt-1.5" />
          <div className="ml-4"><div className={`${s.draw} h-7 w-px bg-(--cobalt)`} data-on={gap} style={{ '--delay': '150ms' } as React.CSSProperties} /></div>
          <p className={`${s.reveal} inline-flex items-center gap-2 rounded-full bg-(--sky) px-3 py-1.5 t-small font-medium`} data-on={gap} style={{ '--delay': '550ms' } as React.CSSProperties}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />{HERO_CALL.gap}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-(--ink)/10 px-5 py-3.5 sm:px-6">
        <span className="t-label font-semibold text-(--ink)/65">Lorenzo</span>
        <Waveform speaking={answering} className="h-8 flex-1 overflow-hidden" />
      </div>
    </div>
  );
}

// Step 3: Today's workout and the skill map, recreated from the drills home.
function WorkoutView({ active, t }: { active: boolean; t: number }) {
  const row = active && t >= 300;
  const progress = active && t >= 1700;
  return (
    <div className={`${s.view} p-5 sm:p-7`} data-active={active} aria-hidden={!active}>
      <p className="t-small text-(--ink)/65">{HERO_CALL.week}</p>
      <section className="mt-3 rounded-[8px] border border-(--ink)/12 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="t-body font-medium">Today’s workout</h3>
          <span className={`${s.figures} t-small text-(--ink)/65`}>{row ? 'About 20 min · 3 sets' : 'About 12 min · 2 sets'}</span>
        </div>
        <ol className="mt-2">
          <li className={`${s.grow} -mx-2 rounded-md ${row ? 'bg-(--sky)/70' : ''}`} data-on={row}>
            <div><Row {...HERO_CALL.newRow} /></div>
          </li>
          {HERO_CALL.rows.map(r => <li key={r.drill} className="-mx-2"><Row {...r} /></li>)}
        </ol>
        <span className="mt-2 inline-flex h-9 items-center rounded-[6px] bg-(--cobalt) px-4 t-small font-medium text-(--white)">Start today’s workout</span>
      </section>
      <p className="t-small mt-5 font-medium">Skill map</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        <li className="flex items-center justify-between rounded-[6px] border border-(--mastery) bg-(--mastery) px-3 py-2 t-small font-medium text-(--ink)">MECE structure <span>Mastered</span></li>
        {/* Lorenzo's weak spot joins the skill map: Not started → Learning. */}
        <li className={`${s.tile} flex items-center justify-between rounded-[6px] border px-3 py-2 t-small font-medium ${progress ? 'border-(--sky) bg-(--sky) text-(--ink)' : 'border-(--ink)/20 bg-(--white) text-(--ink)'}`}>
          <span className="flex items-center gap-2"><ThreadMark />{HERO_CALL.skill}</span>
          <span className="flex items-center gap-1.5">
            {progress ? 'Learning' : 'Not started'}
            <span aria-hidden="true" className={`${s.reveal} flex h-4 w-4 items-center justify-center rounded-full bg-(--mastery) text-(--ink)`} data-on={progress} style={{ '--delay': '500ms' } as React.CSSProperties}><ArrowUp className="h-3 w-3" strokeWidth={3} /></span>
          </span>
        </li>
      </ul>
    </div>
  );
}

// `thread`: the row belongs to Lorenzo's weak spot, so it carries its mark.
export function Row({ slot, drill, reason, minutes, thread }: { slot: string; drill: string; reason: string; minutes: string; thread?: boolean }) {
  return (
    <div className="t-small space-y-0.5 px-2 py-2">
      <p className="flex items-baseline justify-between gap-2">
        <span>{thread && <ThreadMark className="mr-2 -translate-y-px" />}<span className="text-(--ink)/65">{slot} · </span><span className="font-medium">{drill}</span></span>
        <span className={`${s.figures} text-(--ink)/65`}>{minutes}</span>
      </p>
      <p className="text-(--ink)/65">{reason}</p>
    </div>
  );
}
