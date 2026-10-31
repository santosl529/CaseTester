'use client';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ADAPT, BRAND, SCREENS, type ScreenId } from './content';
import { AnswerBox, Chip, SkillLevels, TimerRing, Workout } from './chapters';
import { ThreadMark } from './thread';
import { useRecent, useReducedMotion } from './motion';
import { CallControls, CaptionLine, ExhibitPanel, Presence, VoiceTopBar, stepState, wordSteps } from './voice-call';
import s from './exhibition.module.css';

// The device in "What sets us apart" (Matt's brief, 24 Oct 2026): a laptop on
// desktop, a phone below 1024px, and four screens recreated from the product
// with sample data. Nothing on a screen is interactive: the buttons and links
// are pictures of controls, so the page's tab order skips them.

// ---------- Frames ----------

// The laptop's screen is laid out at a fixed 720 × 450 and scaled to fit its
// column, so it reads like a screenshot at every width.
const SCREEN_W = 720;
const SCREEN_H = 450;

export function Laptop({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(el.clientWidth / SCREEN_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="w-full">
      <div className={`${s.bezel} rounded-[18px] p-[9px]`}>
        <div ref={box} className="relative overflow-hidden rounded-[7px] bg-(--white)" style={{ aspectRatio: `${SCREEN_W} / ${SCREEN_H}` }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${k})` }}>{children}</div>
        </div>
      </div>
      {/* The base: a thin slab, a little wider than the lid, with the thumb notch. */}
      <div aria-hidden="true" className={`${s.base} relative mx-[-5%] h-3 rounded-b-[12px]`}>
        <span className="absolute top-0 left-1/2 h-1.5 w-[14%] -translate-x-1/2 rounded-b-[6px] bg-(--ink)/15" />
      </div>
    </div>
  );
}

// The phone: the top of a phone, cut off by a fade, so a screen reads at its
// real size without a full-height device per block.
export function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${s.phoneCrop} mx-auto w-full max-w-[20rem]`}>
      <div className={`${s.bezel} rounded-t-[38px] px-[9px] pt-[9px]`}>
        <div className="relative h-[36rem] overflow-hidden rounded-t-[30px] bg-(--white)">
          <span aria-hidden="true" className="absolute top-2 left-1/2 z-10 h-[1.375rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-(--ink)" />
          <div className="h-full pt-9">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- The app's chrome ----------

// The shared header on the case and drills pages (components/site-header.tsx).
function AppBar() {
  return (
    <div className="flex items-center gap-4 border-b border-(--ink)/10 px-4 py-2.5">
      <span className="t-small mr-auto font-semibold">{BRAND}</span>
      <span className="t-label text-(--ink)/70">Home</span>
      <span className="t-label text-(--ink)/70">Drills</span>
      <span className="t-label hidden text-(--ink)/70 @[24rem]:inline">Sign out</span>
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
          <CaptionLine who={l.who} text={l.text} lit={st.started[i] ? st.lit[i] : 99} newest={i === st.newest} className={compact ? 't-small' : 't-card'} />
        </li>
      ))}
    </ol>
  );
  const exhibit = <div className={`${s.reveal} ${compact ? '' : s.revealX}`} data-on={st.started[0]}><ExhibitPanel compact={compact} /></div>;
  const presence = <Presence who={who} pulse={moving} size={compact ? 32 : 52} />;
  return (
    // Phones: the controls follow the captions, clear of the phone's fade.
    <div className={`flex flex-col ${compact ? '' : 'h-full'}`}>
      <VoiceTopBar name={VOICE.case} stage="Analysis" time={VOICE.time} compact={compact} />
      {compact ? (
        <div className="flex flex-col gap-3 px-4 pt-3 pb-3">{presence}{exhibit}{captions}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden px-5 pt-4">{presence}{captions}</div>
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
      <AppBar />
      <div className="space-y-3 p-4">
        <p className="t-small hidden @[30rem]:block"><span className="font-semibold">Week 2 of 6</span> <span className="text-(--ink)/65">· Hypotheses and exhibits</span></p>
        <Workout rows={[ADAPT.newRow, ...ADAPT.rows]} on={() => true} highlight={0} minutes="About 20 min · 3 sets" />
        <div>
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
      <AppBar />
      <div className="space-y-3 px-5 py-4 @[30rem]:px-8">
        <div>
          <p className="t-label flex items-center gap-1.5 text-(--ink)/65"><BookOpen aria-hidden="true" className="h-3.5 w-3.5" />Today’s workout · Weak spot · {sc.meta}</p>
          <p className="t-card mt-1 font-semibold tracking-[-0.02em]">{sc.title} <span className="font-normal text-(--ink)/65">· {sc.minutes}</span></p>
        </div>
        <p className="t-small rounded-[6px] border-l-2 border-(--ink)/70 bg-(--ink)/[0.04] px-3.5 py-2.5 font-medium">{sc.idea}</p>
        <div className="rounded-[8px] border border-(--ink)/12 px-3.5 py-2.5">
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
      <AppBar />
      <div className="space-y-3 px-5 py-4 @[30rem]:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="t-label text-(--ink)/65">{sc.meta}</p>
          <TimerRing left={31} />
        </div>
        <p className="t-body font-medium">{sc.prompt}</p>
        <div className="flex flex-wrap items-center gap-2.5">
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

// One screen's content, sized by its frame (container queries pick the
// phone or laptop composition; the interview takes `compact` for the phone).
// `step` drives the interview only. Memoized: while block 1 plays, only the
// interview re-renders.
export const Screen = memo(function Screen({ id, step = VOICE_STEPS.total, compact = false }: { id: ScreenId; step?: number; compact?: boolean }) {
  if (id === 'interview') return <div className="@container h-full"><InterviewScreen step={step} compact={compact} /></div>;
  const Body = SCREEN[id];
  return <div className="@container h-full"><Body /></div>;
});

// Lorenzo's thread under the device: the day and the beat, in words.
export function StoryCaption({ id, className = '' }: { id: ScreenId; className?: string }) {
  const { day, line } = SCREENS[id].story;
  return (
    <p className={`t-small flex items-start gap-2 ${className}`}>
      <ThreadMark className="mt-[0.45em]" />
      <span><span className="font-semibold text-(--cobalt)">{day}</span><span className="text-(--ink)/70"> · Sample student · </span><span className="font-medium">{line}</span></span>
    </p>
  );
}
