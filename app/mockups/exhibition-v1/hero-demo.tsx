'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowUp, Check, Pause, Play, X } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { DEMO, HERO, QUESTION, STEPS } from './content';
import s from './exhibition.module.css';

// The hero's product demo (Matt's brief, 23 Oct 2026): a framework is typed,
// the gap is caught, today's workout gains a row, the skill improves. About
// 10 seconds, looping, only while on screen; Pause stops it, the step rail
// jumps to any step. Reduced motion: the last step, still, with the rail to
// step through by hand. "Try a question" swaps in one live question.
const REDUCE = '(prefers-reduced-motion: reduce)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(REDUCE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

// Typing delays for the four buckets, one after another.
const TYPE_MS = 22;
const DELAYS = DEMO.buckets.reduce<number[]>((acc, b, i) => [...acc, i === 0 ? 300 : acc[i - 1] + DEMO.buckets[i - 1].length * TYPE_MS + 220], []);

export function HeroDemo() {
  // The server (and reduced motion) render the final step, still.
  const motion = !useSyncExternalStore(subscribe, () => window.matchMedia(REDUCE).matches, () => true);
  const [chosenStep, setStep] = useState<number | null>(null);
  const step = chosenStep ?? (motion ? 0 : STEPS.length - 1);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [trying, setTrying] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !motion) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [motion]);

  const running = motion && !paused && visible && !trying;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      if (step === STEPS.length - 1) { setCycle(c => c + 1); setStep(0); } else setStep(step + 1);
    }, STEPS[step].ms);
    return () => clearTimeout(t);
  }, [running, step, cycle]);

  const jump = useCallback((i: number) => { setStep(i); if (i === 0) setCycle(c => c + 1); }, []);

  return (
    <div ref={root}>
      {trying ? (
        <TryQuestion onBack={() => setTrying(false)} />
      ) : (
        <>
          {/* Phones: full-bleed and tall enough for the skill map; from sm, a card. */}
          <div className={`${s.stage} ${s.stageBleed} relative -mx-6 h-[31.5rem] overflow-hidden sm:mx-0 sm:h-[30rem]`}>
            <FrameworkView active={step <= 1} gap={step >= 1} cycle={cycle} motion={motion} />
            <WorkoutView active={step >= 2} row={step >= 2} progress={step >= 3} />
          </div>

          {/* The step rail: what's playing, and a way to any step. */}
          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
            {motion && (
              <button type="button" onClick={() => setPaused(p => !p)} className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full border border-(--ink)/20 bg-(--white) px-3 text-sm font-medium hover:border-(--ink)">
                {paused ? <Play aria-hidden="true" className="h-3.5 w-3.5" /> : <Pause aria-hidden="true" className="h-3.5 w-3.5" />}
                {paused ? 'Play' : 'Pause'}<span className="sr-only"> demo</span>
              </button>
            )}
            <ol aria-label="Demo steps" className="grid w-full flex-1 grid-cols-4 gap-2">
              {STEPS.map((st, i) => (
                <li key={st.label}>
                  <button type="button" onClick={() => jump(i)} aria-current={i === step ? 'step' : undefined}
                    className={`w-full rounded-sm pt-1 text-left text-xs leading-tight whitespace-nowrap ${i === step ? 'font-semibold text-(--ink)' : 'text-(--ink)/65 hover:text-(--ink)'}`}>
                    <span className={s.railBar} style={{ display: 'block' }}>
                      <span
                        key={`${cycle}-${i}-${step}`}
                        className={s.railFill}
                        style={{ display: 'block', '--ms': `${st.ms}ms` } as React.CSSProperties}
                        data-state={!motion ? (i <= step ? 'still' : 'todo') : i < step ? 'done' : i === step ? 'current' : 'todo'}
                        data-paused={!running}
                      />
                    </span>
                    <span className="mt-2 block">{st.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={() => setTrying(true)} className="mt-5 text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">{HERO.tryLink}</button>
        </>
      )}
    </div>
  );
}

// Step 1–2: the Framework builder drill, recreated.
function FrameworkView({ active, gap, cycle, motion }: { active: boolean; gap: boolean; cycle: number; motion: boolean }) {
  return (
    <div className={`${s.view} p-5 sm:p-7`} data-active={active} aria-hidden={!active} data-gap={gap}>
      <div className="flex items-baseline justify-between text-sm text-(--ink)/65">
        <span>{DEMO.drill}</span>
        <span className={s.figures}>Item 1 of 4</span>
      </div>
      <p className="mt-4 text-base font-medium leading-relaxed">{DEMO.prompt}</p>
      <p className="mt-5 text-sm font-medium">Your structure</p>
      <ol key={cycle} className={`${motion ? s.typing : ''} mt-2 grid gap-2`}>
        {DEMO.buckets.map((b, i) => {
          const d = DELAYS[i];
          return (
            <li key={b} className={`${s.bucket} flex items-center gap-3 px-3 py-2 text-sm`} style={{ '--delay': `${d}ms` } as React.CSSProperties}>
              <span className={`${s.figures} text-(--ink)/60`}>{i + 1}</span>
              <span className={s.typed} style={{ '--delay': `${d}ms`, '--dur': `${b.length * TYPE_MS}ms`, '--n': b.length } as React.CSSProperties}>{b}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-2">
        <div className={`${s.slot} flex items-center gap-3 px-3 py-2 text-sm text-(--cobalt)`}>
          <span className={s.figures}>5</span><span className="text-(--ink)/45">&nbsp;</span>
        </div>
        <div className="ml-6"><div className={s.drawLine} /></div>
        <p className={`${s.chip} inline-flex items-center gap-2 rounded-full bg-(--sky) px-3 py-1.5 text-sm font-medium`}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--cobalt)" />{DEMO.gap}
        </p>
      </div>
    </div>
  );
}

// Step 3–4: Today's workout and the skill map, recreated from the drills home.
function WorkoutView({ active, row, progress }: { active: boolean; row: boolean; progress: boolean }) {
  return (
    <div className={`${s.view} p-5 sm:p-7`} data-active={active} aria-hidden={!active} data-row={row} data-progress={progress}>
      <p className="text-sm text-(--ink)/65">{DEMO.week}</p>
      <section className="mt-3 rounded-[8px] border border-(--ink)/12 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-medium">Today’s workout</h3>
          <span className={`${s.figures} text-sm text-(--ink)/65`}>{row ? 'About 17 min · 3 sets' : 'About 11 min · 2 sets'}</span>
        </div>
        <ol className="mt-2">
          <li className={`${s.newRow} ${row ? s.newRowFresh : ''} -mx-2 rounded-md`}>
            <div><Row {...DEMO.newRow} /></div>
          </li>
          {DEMO.rows.map(r => <li key={r.drill} className="-mx-2"><Row {...r} /></li>)}
        </ol>
        <span className="mt-2 inline-flex h-9 items-center rounded-[6px] bg-(--cobalt) px-4 text-sm font-medium text-(--white)">Start today’s workout</span>
      </section>
      <p className="mt-5 text-sm font-medium">Skill map</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        <li className="flex items-center justify-between rounded-[6px] bg-(--mastery) px-3 py-2 text-sm font-medium text-(--ink)">MECE structure <span>Mastered</span></li>
        <li className={`${s.tile} flex items-center justify-between rounded-[6px] px-3 py-2 text-sm font-medium ${progress ? 'bg-(--cobalt) text-(--white)' : 'bg-(--sky) text-(--ink)'}`}>
          {DEMO.skill}
          <span className="flex items-center gap-1.5">
            {progress ? 'Practiced' : 'Learning'}
            <span aria-hidden="true" className={`${s.rise} flex h-4 w-4 items-center justify-center rounded-full bg-(--mastery) text-(--ink)`}><ArrowUp className="h-3 w-3" strokeWidth={3} /></span>
          </span>
        </li>
      </ul>
    </div>
  );
}

function Row({ slot, drill, reason, minutes }: { slot: string; drill: string; reason: string; minutes: string }) {
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
    <div className={`${s.stage} p-5 sm:p-7`}>
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
