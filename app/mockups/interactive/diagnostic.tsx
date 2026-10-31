'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { CostChart } from './chart';
import { DIAGNOSTIC_INTRO, QUESTIONS, RESULTS } from './content';
import s from './interactive.module.css';

// The hero's mini diagnostic (Matt's brief, 22 Oct 2026): intro, three
// single-choice questions with instant named feedback, then a skill snapshot
// and the plan it would start. Scored here in the browser; nothing is sent or
// stored. Focus moves to each new step; feedback is announced (aria-live).
type Step = { kind: 'intro' } | { kind: 'question'; index: number } | { kind: 'results' };

const BUTTON = 'inline-flex h-11 items-center justify-center rounded-[4px] px-5 text-base font-medium transition-colors';

export function MiniDiagnostic() {
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // After the first interaction, each new step takes focus (not on page load).
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  const go = (next: Step) => { moved.current = true; setStep(next); };
  const restart = () => { setAnswers(QUESTIONS.map(() => null)); go({ kind: 'intro' }); };

  return (
    <div className="border border-(--ink) bg-(--white) p-6 sm:p-8">
      {step.kind === 'intro' && (
        <div className="flex flex-col lg:min-h-[22rem]">
          <h2 ref={heading} tabIndex={-1} className={`${s.display} text-[1.5rem] leading-tight outline-none`}>{DIAGNOSTIC_INTRO.title}</h2>
          <p className="mt-3 text-base leading-relaxed text-(--ink)/75">{DIAGNOSTIC_INTRO.body}</p>
          {/* Desktop only: what the three questions test, to balance the headline (pending Matt's OK). */}
          <ol aria-label="The three questions" className="mt-6 hidden divide-y lg:block divide-(--ink)/12 border-y border-(--ink)/12">
            {QUESTIONS.map((q, i) => (
              <li key={q.skill} className="flex items-baseline gap-4 py-3 text-sm">
                <span className={`${s.display} ${s.figures} w-5 text-lg text-(--cobalt)`}>{i + 1}</span>
                <span className="font-medium">{q.skill}</span>
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-6 lg:pt-7">
            <button type="button" onClick={() => go({ kind: 'question', index: 0 })} className={`${BUTTON} bg-(--cobalt) text-(--white) hover:bg-(--ink)`}>{DIAGNOSTIC_INTRO.start}</button>
          </div>
        </div>
      )}

      {step.kind === 'question' && (
        <QuestionView
          key={step.index}
          index={step.index}
          heading={heading}
          answer={answers[step.index]}
          onAnswer={i => setAnswers(a => a.map((x, k) => (k === step.index ? i : x)))}
          onNext={() => go(step.index + 1 < QUESTIONS.length ? { kind: 'question', index: step.index + 1 } : { kind: 'results' })}
        />
      )}

      {step.kind === 'results' && <Results heading={heading} answers={answers} onRestart={restart} />}
    </div>
  );
}

function Progress({ index }: { index: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className={`${s.figures} text-sm font-medium`}>{index + 1} of {QUESTIONS.length} · {QUESTIONS[index].skill}</span>
      <span aria-hidden="true" className="flex min-w-24 flex-1 gap-1">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < index ? 'bg-(--ink)' : i === index ? 'bg-(--cobalt)' : 'bg-(--sky)'}`} />
        ))}
      </span>
    </div>
  );
}

function QuestionView({ index, heading, answer, onAnswer, onNext }: { index: number; heading: React.RefObject<HTMLHeadingElement | null>; answer: number | null; onAnswer: (i: number) => void; onNext: () => void }) {
  const q = QUESTIONS[index];
  const answered = answer !== null;
  const chosen = answered ? q.options[answer] : null;
  const last = index === QUESTIONS.length - 1;
  return (
    <div>
      <Progress index={index} />
      <h2 ref={heading} tabIndex={-1} className="mt-5 text-base leading-relaxed outline-none">
        {q.prompt}
      </h2>
      {q.framework && (
        <ol className="mt-3 space-y-1 border-l border-(--ink)/20 pl-4 text-sm">
          {q.framework.map((b, i) => <li key={b} className="flex gap-2"><span className={`${s.figures} text-(--ink)/70`}>{i + 1}.</span>{b}</li>)}
        </ol>
      )}
      {q.chart && <CostChart id={`q${index}-chart`} />}

      <fieldset className="mt-5">
        <legend className="text-base font-semibold">{q.ask}</legend>
        <div className="mt-3 grid gap-2">
          {q.options.map((o, i) => {
            const result = !answered ? undefined : o.correct ? 'correct' : i === answer ? 'chosen' : 'dim';
            return (
              <button
                key={o.text}
                type="button"
                aria-disabled={answered}
                aria-pressed={answered ? i === answer : undefined}
                data-result={result}
                onClick={() => { if (!answered) onAnswer(i); }}
                className={`${s.option} flex w-full items-start gap-3 rounded-[4px] border border-(--ink)/25 bg-(--white) px-4 py-3 text-left text-sm leading-snug ${answered ? 'cursor-default' : ''}`}
              >
                <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${result === 'correct' ? 'border-(--mastery) bg-(--mastery) text-(--white)' : result === 'chosen' ? 'border-(--ink) bg-(--ink) text-(--white)' : 'border-(--ink)/30'}`}>
                  {result === 'correct' && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  {result === 'chosen' && <X className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="flex-1">{o.text}{result === 'correct' && <span className="sr-only"> (correct answer)</span>}{result === 'chosen' && <span className="sr-only"> (your answer)</span>}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Instant feedback: announced when it appears. */}
      <div aria-live="polite" className="mt-5">
        {chosen && (
          <div className="border-t border-(--ink)/15 pt-4">
            {chosen.correct ? (
              <p className="flex items-start gap-2 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-(--mastery) text-(--white)"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                <span><strong className="font-semibold">Correct.</strong> {chosen.explain}</span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-(--ink) text-(--white)"><X className="h-3.5 w-3.5" strokeWidth={3} /></span>
                <span><strong className="font-semibold">Not quite. {chosen.mistake}:</strong> {chosen.explain}</span>
              </p>
            )}
          </div>
        )}
      </div>
      {answered && (
        <button type="button" onClick={onNext} className={`${BUTTON} mt-5 bg-(--cobalt) text-(--white) hover:bg-(--ink)`}>{last ? 'See your results' : 'Next'}</button>
      )}
    </div>
  );
}

function Results({ heading, answers, onRestart }: { heading: React.RefObject<HTMLHeadingElement | null>; answers: (number | null)[]; onRestart: () => void }) {
  const rows = QUESTIONS.map((q, i) => {
    const o = answers[i] === null ? null : q.options[answers[i]!];
    return { skill: q.skill, correct: Boolean(o?.correct), mistake: o && !o.correct ? o.mistake : null };
  });
  const firstMiss = rows.find(r => !r.correct);
  const plan = firstMiss
    ? RESULTS.focusLine(firstMiss.skill, (firstMiss.mistake ?? '').toLowerCase())
    : RESULTS.allCorrect;
  return (
    <div>
      <h2 ref={heading} tabIndex={-1} className={`${s.display} text-[1.5rem] leading-tight outline-none`}>{RESULTS.title}</h2>
      <ul className="mt-5 divide-y divide-(--ink)/12 border-y border-(--ink)/12">
        {rows.map(r => (
          <li key={r.skill} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
            <span className="text-sm font-semibold">{r.skill}</span>
            <span className="flex items-center gap-2">
              {r.mistake && <span className="text-xs text-(--ink)/70">{r.mistake}</span>}
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.correct ? 'bg-(--mastery) text-(--ink)' : 'bg-(--cobalt) text-(--white)'}`}>{r.correct ? RESULTS.strong : RESULTS.focus}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 bg-(--sky) p-4">
        <p className={`${s.caps} text-(--ink)`}>Sample plan</p>
        <p className="mt-2 text-sm leading-relaxed">{plan}</p>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-(--ink)/70">{RESULTS.note}</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href={DIAGNOSTIC_HREF} className={`${BUTTON} bg-(--cobalt) text-(--white) hover:bg-(--ink)`}>{RESULTS.primary}</Link>
        <button type="button" onClick={onRestart} className="text-sm font-medium text-(--cobalt) underline underline-offset-4">{RESULTS.again}</button>
      </div>
    </div>
  );
}
