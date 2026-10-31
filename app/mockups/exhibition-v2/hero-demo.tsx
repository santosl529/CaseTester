'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Check, Pause, Play, X } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { HERO, HERO_CALL, HERO_STEPS, QUESTION } from './content';
import { Caption, Orb, Waveform, wordCount } from './call';
import { useClock, useOnScreen, useReducedMotion } from './motion';
import s from './exhibition.module.css';

// The hero's product demo (Matt's brief, 23 Oct 2026, v2): a live voice
// interview first (the interviewer asks, the candidate answers), then the
// gap is caught, then today's workout gains a row and the skill moves. One
// clock drives it (~12 s, looping) and stops when paused, off screen or
// swapped for the try-it question. Reduced motion: the last step, still,
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
  const [trying, setTrying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [still, setStill] = useState<number | null>(null);
  const { ref, on } = useOnScreen<HTMLDivElement>(0.2);
  const ms = useClock('hero', !paused && on && !trying, 0);
  // Reduced motion shows a step's end state; otherwise the clock runs the loop.
  const t = reduced ? (still ?? TOTAL - 1) : (ms + offset) % TOTAL;
  const step = STARTS.findLastIndex(st => t >= st);

  const jump = (i: number) => {
    if (reduced) setStill(STARTS[i] + HERO_STEPS[i].ms - 1);
    else setOffset(STARTS[i] - (ms % TOTAL) + TOTAL);
  };

  return (
    <div ref={ref}>
      {trying ? <TryQuestion onBack={() => setTrying(false)} /> : (
        <>
          <div data-paused={paused || !on} className={`${s.panel} ${s.bleed} relative -mx-6 h-[33rem] overflow-hidden sm:mx-0 sm:h-[30rem]`}>
            <CallView active={step <= 1} t={t} gap={step >= 1} />
            <WorkoutView active={step === 2} t={t - STARTS[2]} />
          </div>
          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
            {!reduced && (
              <button type="button" onClick={() => setPaused(p => !p)} className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full border border-(--ink)/20 bg-(--white) px-3 text-sm font-medium hover:border-(--ink)">
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
                      className={`w-full rounded-sm pt-1 text-left text-xs leading-tight whitespace-nowrap ${i === step ? 'font-semibold text-(--ink)' : 'text-(--ink)/65 hover:text-(--ink)'}`}>
                      <span className={s.railBar}><span className={s.railFill} style={{ transform: `scaleX(${reduced ? (i <= step ? 1 : 0) : fill})` }} /></span>
                      <span className="mt-2 block">{st.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <button type="button" onClick={() => setTrying(true)} className="mt-5 text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">{HERO.tryLink}</button>
        </>
      )}
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
        <p className={`${s.caps} text-(--ink)`}>Sample interview</p>
        <p className={`${s.figures} flex items-center gap-2 text-sm text-(--ink)/70`}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />{clock(Math.min(t, 4999))}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-6 sm:px-7">
        <div className="flex items-center gap-3">
          <Orb speaking={asking} size={52} />
          <div>
            <p className="text-sm font-semibold">Interviewer</p>
            <p className="text-xs text-(--ink)/65">{HERO_CALL.context}</p>
          </div>
        </div>
        <Caption text={HERO_CALL.ask} lit={lit(t, ASK)} className="mt-5 text-xl font-medium leading-snug tracking-[-0.01em]" />
        <div className="mt-6">
          <p className="text-xs font-semibold tracking-[0.04em] text-(--ink)/65">You</p>
          <Caption text={HERO_CALL.answer} lit={lit(t, ANSWER)} className="mt-1.5 text-lg leading-relaxed" />
          <div className="ml-4"><div className={`${s.draw} h-7 w-px bg-(--cobalt)`} data-on={gap} style={{ '--delay': '150ms' } as React.CSSProperties} /></div>
          <p className={`${s.reveal} inline-flex items-center gap-2 rounded-full bg-(--sky) px-3 py-1.5 text-sm font-medium`} data-on={gap} style={{ '--delay': '550ms' } as React.CSSProperties}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />{HERO_CALL.gap}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-(--ink)/10 px-5 py-3.5 sm:px-6">
        <span className="text-xs font-semibold text-(--ink)/65">You</span>
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
      <p className="text-sm text-(--ink)/65">{HERO_CALL.week}</p>
      <section className="mt-3 rounded-[8px] border border-(--ink)/12 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-medium">Today’s workout</h3>
          <span className={`${s.figures} text-sm text-(--ink)/65`}>{row ? 'About 17 min · 3 sets' : 'About 11 min · 2 sets'}</span>
        </div>
        <ol className="mt-2">
          <li className={`${s.grow} -mx-2 rounded-md ${row ? 'bg-(--sky)/70' : ''}`} data-on={row}>
            <div><Row {...HERO_CALL.newRow} /></div>
          </li>
          {HERO_CALL.rows.map(r => <li key={r.drill} className="-mx-2"><Row {...r} /></li>)}
        </ol>
        <span className="mt-2 inline-flex h-9 items-center rounded-[6px] bg-(--cobalt) px-4 text-sm font-medium text-(--white)">Start today’s workout</span>
      </section>
      <p className="mt-5 text-sm font-medium">Skill map</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        <li className="flex items-center justify-between rounded-[6px] bg-(--mastery) px-3 py-2 text-sm font-medium text-(--ink)">MECE structure <span>Mastered</span></li>
        <li className={`${s.tile} flex items-center justify-between rounded-[6px] px-3 py-2 text-sm font-medium ${progress ? 'bg-(--cobalt) text-(--white)' : 'bg-(--sky) text-(--ink)'}`}>
          {HERO_CALL.skill}
          <span className="flex items-center gap-1.5">
            {progress ? 'Practiced' : 'Learning'}
            <span aria-hidden="true" className={`${s.reveal} flex h-4 w-4 items-center justify-center rounded-full bg-(--mastery) text-(--ink)`} data-on={progress} style={{ '--delay': '500ms' } as React.CSSProperties}><ArrowUp className="h-3 w-3" strokeWidth={3} /></span>
          </span>
        </li>
      </ul>
    </div>
  );
}

export function Row({ slot, drill, reason, minutes }: { slot: string; drill: string; reason: string; minutes: string }) {
  return (
    <div className="space-y-0.5 px-2 py-2 text-sm">
      <p className="flex items-baseline justify-between gap-2">
        <span><span className="text-(--ink)/65">{slot} · </span><span className="font-medium">{drill}</span></span>
        <span className={`${s.figures} text-(--ink)/65`}>{minutes}</span>
      </p>
      <p className="text-(--ink)/65">{reason}</p>
    </div>
  );
}

// "Or try a question yourself": one live question, scored here, nothing sent.
function TryQuestion({ onBack }: { onBack: () => void }) {
  const [answer, setAnswer] = useState<number | null>(null);
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const chosen = answer === null ? null : QUESTION.options[answer];
  return (
    <div className={`${s.panel} p-5 sm:p-7`}>
      <p className="text-sm text-(--ink)/65">Quantitative rigor</p>
      <p ref={heading} tabIndex={-1} className="mt-3 text-lg font-medium leading-snug outline-none">{QUESTION.prompt}</p>
      <div role="group" aria-label="Answers" className="mt-5 grid grid-cols-2 gap-2">
        {QUESTION.options.map((o, i) => {
          const result = answer === null ? undefined : o.correct ? 'correct' : i === answer ? 'chosen' : 'dim';
          return (
            <button key={o.text} type="button" aria-disabled={answer !== null} aria-pressed={answer !== null ? i === answer : undefined}
              onClick={() => { if (answer === null) setAnswer(i); }}
              className={`flex items-center gap-2 rounded-[6px] border px-4 py-3 text-left text-base font-medium transition-colors ${
                result === 'correct' ? 'border-(--mastery) shadow-[inset_0_0_0_1px_var(--mastery)]' : result === 'chosen' ? 'border-(--ink) shadow-[inset_0_0_0_1px_var(--ink)]' : result === 'dim' ? 'border-(--ink)/15 text-(--ink)/65' : 'border-(--ink)/20 hover:border-(--cobalt)'}`}>
              {result === 'correct' && <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-(--mastery) text-(--white)"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
              {result === 'chosen' && <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-(--ink) text-(--white)"><X className="h-3.5 w-3.5" strokeWidth={3} /></span>}
              <span className={s.figures}>{o.text}</span>
              {result === 'correct' && <span className="sr-only"> (correct answer)</span>}
              {result === 'chosen' && <span className="sr-only"> (your answer)</span>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-5 min-h-[3rem] text-sm leading-relaxed">
        {chosen && (chosen.correct
          ? <p><strong className="font-semibold">Correct.</strong> {chosen.explain}</p>
          : <p><strong className="font-semibold">{chosen.mistake}:</strong> {chosen.explain}</p>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
        {chosen && <Link href={DIAGNOSTIC_HREF} className="text-(--cobalt) underline underline-offset-4">{QUESTION.more}</Link>}
        <button type="button" onClick={onBack} className="text-(--ink)/70 underline-offset-4 hover:underline">{QUESTION.back}</button>
      </div>
    </div>
  );
}
