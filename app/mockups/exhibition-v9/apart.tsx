'use client';
import { memo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DIAGNOSTIC_HREF } from '../_shared/copy';
import { APART, PRODUCT_HREF, SCREENS, type ScreenId } from './content';
import { seg, useScrub, useViewProgress } from './motion';
import { Laptop, Phone, Screen, StoryCaption, VOICE_STEPS } from './screens';
import s from './exhibition.module.css';

// What sets us apart (Matt's brief, 24 Oct 2026): between the loop and the
// technology, on White. Desktop: one laptop pinned on the right while the
// three blocks scroll past on the left; its screen follows the block being
// read (block 3 has two), scrubbed by scroll like the chapters (useScrub:
// down advances, up reverses, the scroll itself is never touched).
//
// Phones and reduced motion: no pin. Each block shows its own static device
// (block 3 both screens). Those copies also carry the screens as text for
// screen readers when the pinned laptop is showing (it is aria-hidden).
// Block 1's screen is the live voice interview, its conversation scrubbed
// word by word with the block.

const ORDER: ScreenId[] = ['interview', 'workout', 'lesson', 'drill'];
// Where each screen takes over, as track progress. The blocks are 140, 100
// and 150 viewport heights (exhibition.module.css, .apartBlock), so the track
// scrolls 290. Block 1's text holds in the middle for its first 60 while the
// conversation plays (CONVERSATION); the workout takes over halfway between
// block 1's text leaving and block 2's arriving (100 / 290), the lesson as
// block 3's text comes up past block 2's (it is drawn half its height above
// its place: 177 / 290). Block 3's text then holds in the middle while its
// two screens play; the drill takes over halfway through that hold (240 / 290).
const TAKEOVER = [0.34, 0.61, 0.83];
const CONVERSATION = [0.005, 0.2] as const;
const screenAt = (p: number) => ORDER[TAKEOVER.filter(t => p >= t).length];
const stepAt = (q: number) => Math.floor(q * VOICE_STEPS.total);

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';

// A block's own device: a laptop from 1024px, a phone below. Unpinned, the
// interview plays as its device comes up the screen (reduced motion: its
// last state).
function StaticDevice({ id, step, figureRef }: { id: ScreenId; step?: number; figureRef?: React.Ref<HTMLElement> }) {
  return (
    <figure ref={figureRef} data-reveal="media" aria-label={`${SCREENS[id].label}, a sample screen`} className="min-w-0">
      <div className="hidden lg:block"><Laptop><Screen id={id} step={step} /></Laptop></div>
      <div className="lg:hidden"><Phone><Screen id={id} step={step} compact /></Phone></div>
      <figcaption><StoryCaption id={id} className="mx-auto mt-4 max-w-[20rem] lg:mt-6 lg:max-w-none" /></figcaption>
    </figure>
  );
}

function InterviewDevice() {
  const { ref, q } = useViewProgress<HTMLElement>();
  return <StaticDevice id="interview" step={stepAt(q)} figureRef={ref} />;
}

// The blocks and their own devices never change with the scroll; the pinned
// laptop changes only when its screen does. Memoized, so a scroll frame
// re-renders nothing else (the 4x-CPU phone check).
const Blocks = memo(function Blocks() {
  return (
    <ol className={s.apartBlocks}>
      {APART.blocks.map(b => (
        <li key={b.id} id={b.id} className={s.apartBlock}>
          <div className="max-w-[30rem]">
            <h3 data-reveal="text" className="t-card font-semibold tracking-[-0.015em] text-balance">{b.title}</h3>
            <p data-reveal="text" className="t-body mt-4 text-(--ink)/70">{b.body}</p>
          </div>
          <div className={s.apartStatic}>
            {b.screens.map(id => (id === 'interview' ? <InterviewDevice key={id} /> : <StaticDevice key={id} id={id} />))}
          </div>
        </li>
      ))}
    </ol>
  );
});

// Desktop with motion: the one laptop. Its screens cross-fade; the frame
// never moves while pinned.
const PinnedDevice = memo(function PinnedDevice({ current, step }: { current: ScreenId; step: number }) {
  return (
    <div aria-hidden="true" className={s.apartPinCol}>
      <div className={s.apartPin}>
        <div data-reveal="media" className="w-full">
          <Laptop>
            {ORDER.map(id => <div key={id} className={s.apartScreen} data-active={id === current}><Screen id={id} step={id === 'interview' ? step : undefined} /></div>)}
          </Laptop>
          <div className="relative mt-6 h-12">
            {ORDER.map(id => <div key={id} className={`${s.apartScreen} ${s.apartCaption}`} data-active={id === current}><StoryCaption id={id} /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
});

export function ApartSection() {
  const { track, p } = useScrub();
  const current = screenAt(p);
  const step = stepAt(seg(p, ...CONVERSATION));
  return (
    <section id="apart" aria-labelledby="apart-h" data-shot="apart" className="border-t border-(--ink)/12 bg-(--white) pt-24 pb-24 lg:pt-36 lg:pb-36">
      <div className={WRAP}>
        <p data-reveal="text" className={`${s.caps} t-label text-(--cobalt)`}>{APART.eyebrow}</p>
        <h2 id="apart-h" data-reveal="text" className={`${s.display} t-section mt-4 max-w-[20ch] text-balance`}>{APART.headline}</h2>
      </div>

      <div ref={track} className={`${s.apartTrack} ${WRAP}`}>
        <Blocks />
        <PinnedDevice current={current} step={step} />
      </div>

      <div className={`${WRAP} mt-16 flex flex-wrap items-center gap-x-8 gap-y-5 lg:mt-12`}>
        <div data-reveal="text"><Link href={DIAGNOSTIC_HREF} className="btn-primary">{APART.primary}</Link></div>
        <div data-reveal="text">
          <Link href={PRODUCT_HREF} className="link t-body inline-flex items-center gap-2">{APART.tour}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}
