'use client';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ADAPT, BRAND, SCREENS, type ScreenId } from './content';
import { AnswerBox, Chip, SkillLevels, TimerRing, Workout } from './chapters';
import { useRecent, useReducedMotion } from './motion';
import { CallControls, CaptionLine, ExhibitPanel, Presence, VoiceTopBar, stepState, wordSteps } from './voice-call';
import s from './exhibition.module.css';

// The exhibits in "What sets us apart" (Matt's briefs, 24 Oct 2026): four
// screens recreated from the product with sample data, each in a simple
// browser frame on its slide, at real size. Nothing on a screen is interactive: the buttons
// and links are pictures of controls, so the page's tab order skips them.

// ---------- The frame ----------

// A browser-style frame: a thin border and a small top bar carrying the app's
// name. The screen inside is laid out at real size, never scaled down (scaled
// to fit a slide, its smallest text fell to about 9px). `crop` (desktop
// slides): the frame takes the height its slide gives it and shows the top
// of the screen, its key area, fading out where it is cut; `fill` lets a
// screen that fills its window (the interview) take that height. A screen
// marks its key area with `data-key`; when the frame is too short for it, the
// crop moves up just enough to show it, fading at the cut edges. Otherwise
// (phones) the screen shows whole.
export function BrowserFrame({ crop = false, fill = false, children }: { crop?: boolean; fill?: boolean; children: React.ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ shift: 0, cut: false });
  useLayoutEffect(() => {
    const el = view.current, box = inner.current;
    if (!el || !box || !crop) return;
    const check = () => {
      const key = box.querySelector<HTMLElement>('[data-key]');
      const keyBottom = key ? key.getBoundingClientRect().bottom - box.getBoundingClientRect().top : 0;
      // Clear of the bottom fade (the last 16% of the window), not just the edge.
      const shift = Math.max(0, Math.round(keyBottom + Math.max(14, el.clientHeight * 0.18) - el.clientHeight));
      const cut = box.scrollHeight - shift > el.clientHeight + 1;
      setFit(prev => (prev.shift === shift && prev.cut === cut ? prev : { shift, cut }));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    ro.observe(box);
    return () => ro.disconnect();
  }, [crop]);
  return (
    <div className={`flex flex-col overflow-hidden rounded-[10px] border border-(--ink)/15 bg-(--white) shadow-[0_1px_2px_color-mix(in_srgb,var(--ink)_6%,transparent)] ${crop ? 'h-full min-h-0' : ''}`}>
      <div className="relative flex h-7 flex-none items-center gap-1.5 border-b border-(--ink)/10 bg-(--paper) px-2.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--ink)/15" /><span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--ink)/15" /><span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--ink)/15" />
        <span className="t-label absolute left-1/2 -translate-x-1/2 font-semibold text-(--ink)/70">{BRAND}</span>
      </div>
      {crop ? (
        <div ref={view} data-cut={fit.cut} data-shifted={fit.shift > 0} className={`${s.cropView} ${fill ? s.cropFill : ''} relative min-h-0 flex-1 overflow-hidden`}>
          <div ref={inner} className={fill ? 'h-full' : ''} style={fit.shift ? { transform: `translateY(${-fit.shift}px)` } : undefined}>{children}</div>
        </div>
      ) : children}
    </div>
  );
}

// ---------- 1 · The live voice interview (voice-call.tsx, as chapter 01) ----------

const VOICE = SCREENS.interview;
export const VOICE_STEPS = wordSteps(VOICE.lines);

// `step`: how far the conversation has played, in words (the scroll's). The
// exhibit slides in with the interviewer's first line; the answer appears
// word by word with the waveform moving; then the orb pulses and the
// question appears. The orb and waveform move only while the scroll does.
function InterviewScreen({ step, compact }: { step: number; compact: boolean }) {
  const reduced = useReducedMotion();
  const st = stepState(VOICE_STEPS.spans, step);
  const moving = useRecent(step);
  const who = st.speakingAt >= 0 ? VOICE.lines[st.speakingAt].who : null;
  // Lines not reached yet hold their place unseen (and stay readable to
  // screen readers), so nothing moves as the conversation plays.
  const captions = (
    <ol className={`space-y-2.5 ${compact ? '' : 'mt-auto pb-4'}`}>
      {VOICE.lines.map((l, i) => (
        <li key={i} className={`transition-opacity duration-200 ${st.started[i] ? '' : 'opacity-0'}`}>
          <CaptionLine who={l.who} text={l.text} lit={st.started[i] ? st.lit[i] : 99} newest={i === st.newest} className={compact ? 't-small' : `t-small ${s.voiceCap}`} />
        </li>
      ))}
    </ol>
  );
  const exhibit = <div className={`${s.reveal} ${compact ? '' : s.revealX}`} data-on={st.started[0]}><ExhibitPanel compact={compact} /></div>;
  const presence = <Presence who={who} pulse={moving} size={compact ? 32 : 40} />;
  return (
    // Phones: the controls follow the captions, clear of the phone's fade.
    <div className={`flex flex-col ${compact ? '' : 'h-full'}`}>
      <VoiceTopBar name={VOICE.case} stage="Analysis" time={VOICE.time} compact={compact} />
      {compact ? (
        <div className="flex flex-col gap-3 px-4 pt-3 pb-3">{presence}{exhibit}{captions}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_13rem]">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden px-4 pt-3">{presence}{captions}</div>
          <div className="border-l border-(--ink)/10 p-3">{exhibit}</div>
        </div>
      )}
      <CallControls speaking={moving && who === 'You'} still={reduced} compact={compact} />
    </div>
  );
}

// ---------- 2 · Today's workout and the skill map ----------

function WorkoutScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-4">
        <Workout rows={[ADAPT.newRow, ...ADAPT.rows]} on={() => true} highlight={0} minutes="About 20 min · 3 sets" />
        <div data-key>
          <p className="t-small font-semibold">Skill map</p>
          {/* The two that carry the story first: Day 1's slip, mastered; the new weak spot.
              A phone shows only those two. */}
          <div className="mt-2 @max-[30rem]:[&_li]:py-1.5 @max-[30rem]:[&_li:nth-child(n+3)]:hidden @max-[30rem]:[&_ul]:grid-cols-1"><SkillLevels p={1} from={0} span={0.1} names={['Math setup', 'Percentages', 'MECE structure', 'Chart takeaway']} /></div>
        </div>
      </div>
    </div>
  );
}

// ---------- 3 · The lesson ----------

function LessonScreen() {
  const sc = SCREENS.lesson;
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-5 py-4 @[30rem]:px-8">
        <div>
          <p className="t-label flex items-center gap-1.5 text-(--ink)/65"><BookOpen aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden @[30rem]:inline">Today’s workout · Weak spot · </span>{sc.meta}</p>
          <p className="t-card mt-1 font-semibold tracking-[-0.02em]">{sc.title} <span className="font-normal text-(--ink)/65">· {sc.minutes}</span></p>
        </div>
        <p className="t-small rounded-[6px] border-l-2 border-(--ink)/70 bg-(--ink)/[0.04] px-3.5 py-2.5 font-medium">{sc.idea}</p>
        <div data-key className="rounded-[8px] border border-(--ink)/12 px-3.5 py-2.5">
          <p className="t-small font-semibold">Worked example</p>
          <p className="t-small mt-1">{sc.example.setup}</p>
          <p className="t-small mt-0.5"><span className="rounded-[4px] bg-(--sky) px-1">{sc.example.answer}</span></p>
        </div>
        <div>
          <p className="t-small font-semibold">Common mistakes</p>
          <p className="t-small mt-1"><span className="font-medium">{sc.mistake.label}:</span> {sc.mistake.line}</p>
        </div>
        <span aria-hidden="true" className="t-small inline-flex h-9 items-center rounded-[6px] bg-(--ink) px-4 font-medium text-(--white)">Try it</span>
      </div>
    </div>
  );
}

// ---------- 4 · The drill on the same mistake ----------

function DrillScreen() {
  const sc = SCREENS.drill;
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-5 py-4 @[30rem]:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="t-label text-(--ink)/65">{sc.meta}</p>
          <TimerRing left={31} />
        </div>
        <p className="t-body font-medium">{sc.prompt}</p>
        <div data-key className="flex flex-wrap items-center gap-2.5">
          <AnswerBox answer={sc.answer} correct={false} />
          <Chip correct={false}>{sc.chip}</Chip>
        </div>
        <div className="rounded-[10px] border border-(--cobalt)/60 p-3.5">
          <p className="t-label font-semibold text-(--ink)/65">{sc.followup.meta}</p>
          <p className="t-small mt-1 font-medium">{sc.followup.text}</p>
          <p aria-hidden="true" className="t-label mt-2.5 rounded-[6px] border border-(--ink)/15 px-3 py-2 text-(--ink)/60">Your reply · up to 60 words</p>
        </div>
      </div>
    </div>
  );
}

const SCREEN: Record<Exclude<ScreenId, 'interview'>, () => React.ReactElement> = {
  workout: WorkoutScreen,
  lesson: LessonScreen,
  drill: DrillScreen,
};

// One screen's content, laid out at its frame's width (container queries pick
// the narrow or wide composition; the interview takes `compact` for phones).
// `step` drives the interview only. Memoized: while block 1 plays, only the
// interview re-renders.
export const Screen = memo(function Screen({ id, step = VOICE_STEPS.total, compact = false }: { id: ScreenId; step?: number; compact?: boolean }) {
  if (id === 'interview') return <div className="@container h-full"><InterviewScreen step={step} compact={compact} /></div>;
  const Body = SCREEN[id];
  return <div className="@container h-full"><Body /></div>;
});
