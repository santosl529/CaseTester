import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { DIAGNOSTIC_HREF, HERO, SKILLS } from '../_shared/copy';
import { TechSection, controlRoomStyles as cr } from '../control-room/sections';
import { MiniDiagnostic } from './diagnostic';
import { Replay } from './replay';
import { LOOP, STATS_LINE } from './content';
import s from './interactive.module.css';

// The interactive homepage mockup (Matt's brief, 22 Oct 2026): try the
// diagnostic, watch an annotated interview, then the method, the 8 skills,
// the technology and the close. Hardcoded; nothing is sent or stored.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';
const MUTED = 'text-(--ink)/75';
const BUTTON = 'inline-flex h-12 items-center rounded-[4px] bg-(--cobalt) px-6 text-base font-medium text-(--white) transition-colors hover:bg-(--ink)';

export default function InteractiveMockup() {
  return (
    <div data-mockup className="flex-1 bg-(--paper)">
      <header className={`${WRAP} flex h-16 items-center justify-between`}>
        <Link href="/mockups" className="text-lg font-semibold tracking-[-0.01em]">CaseTester</Link>
        <Link href="/sign-in" className="text-sm font-medium text-(--cobalt) underline-offset-4 hover:underline">Sign in</Link>
      </header>

      <main>
        {/* 1. Hero + mini diagnostic */}
        <section aria-labelledby="in-hero" className="border-t border-(--ink)">
          <div className={`${WRAP} grid items-start gap-12 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16 lg:pt-20 lg:pb-28`}>
            <div className="lg:pt-6">
              <h1 id="in-hero" className={`${s.display} text-balance text-[clamp(2.5rem,4.3vw,3.9rem)] leading-[1.04]`}>{HERO.headline}</h1>
              <p className={`mt-6 max-w-[32rem] text-lg leading-relaxed ${MUTED}`}>{HERO.subhead}</p>
              <a href="#replay" className="mt-8 inline-flex items-center gap-2 text-base font-medium text-(--cobalt) underline-offset-4 hover:underline">
                {HERO.secondary}<ArrowDown aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            <div className="mx-auto w-full max-w-[34rem] lg:mr-0">
              <MiniDiagnostic />
              <p className={`${s.figures} mt-4 text-sm ${MUTED}`}>{STATS_LINE.join(' · ')}</p>
            </div>
          </div>
        </section>

        {/* 2. Annotated interview replay */}
        <section id="replay" aria-labelledby="in-replay" className="scroll-mt-4 border-t border-(--ink)">
          <div className={`${WRAP} py-20 lg:py-28`}>
            <p className={`${s.caps} text-(--cobalt)`}>See it in action</p>
            <h2 id="in-replay" className={`${s.display} mt-4 max-w-[48rem] text-balance text-[clamp(2.1rem,3.6vw,3.1rem)] leading-[1.06]`}>An AI interviewer that plays it like the real thing</h2>
            <p className={`mt-5 max-w-[40rem] text-lg leading-relaxed ${MUTED}`}>Watch a sample interview. Notes appear as the interviewer probes, pushes back, and builds your feedback.</p>
            <div className="mt-12">
              <Replay />
            </div>
          </div>
        </section>

        {/* 3. Why it works + the 8 skills */}
        <section aria-labelledby="in-why" className="border-t border-(--ink)">
          <div className={`${WRAP} py-20 lg:py-28`}>
            <h2 id="in-why" className={`${s.display} max-w-[48rem] text-[clamp(2.1rem,3.6vw,3.1rem)] leading-[1.06]`}>Built on how experts actually learn</h2>
            <p className={`mt-5 max-w-[40rem] text-lg leading-relaxed ${MUTED}`}>
              Doing case after case feels productive, but it rarely fixes what’s actually holding you back. A case interview is eight skills at once, and practicing them all together lets weak spots hide. We isolate each skill, train it to mastery, then prove it in a full case, so your improvement is real and lasts under pressure.
            </p>
            <div className="mt-12">
              <p className="sr-only">The loop: Free diagnostic, then Your plan, Learn, Drill, Mock interview and Plan updates, which leads back to Your plan.</p>
              <div className="relative">
                <ol className={s.loop}>
                  {LOOP.map(step => <li key={step}>{step}</li>)}
                </ol>
                <span aria-hidden="true" className={s.loopReturn} />
              </div>
            </div>

            <div className="mt-20 border-t border-(--ink)/15 pt-12">
              <h3 className={`${s.display} text-[clamp(1.6rem,2.6vw,2.1rem)] leading-tight`}>The 8 skills top firms hire for</h3>
              <p className={`mt-3 max-w-[40rem] text-base leading-relaxed ${MUTED}`}>Interviewers at McKinsey, BCG, Bain, and the Big 4 evaluate the same core abilities. We train every one of them.</p>
              <ul className="mt-8 grid gap-px border border-(--ink)/15 bg-(--ink)/15 sm:grid-cols-2 lg:grid-cols-4">
                {SKILLS.map(sk => (
                  <li key={sk.name} className="bg-(--white) p-5">
                    <h4 className="text-base font-semibold">{sk.name}</h4>
                    <p className={`mt-1.5 text-sm leading-relaxed ${MUTED}`}>{sk.line}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4. The technology (dark) */}
        <div data-on-ink className={`${cr.band} overflow-x-clip`}>
          <TechSection headlineClassName={`${s.display} text-(--white)`} titleClassName={`${s.display} text-[1.5rem]`} glow cobaltEdges />
        </div>

        {/* 5. Final call to action */}
        <section aria-labelledby="in-close" className="border-b border-(--ink)">
          <div className={`${WRAP} grid items-end gap-8 py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:py-28`}>
            <div>
              <h2 id="in-close" className={`${s.display} text-balance text-[clamp(2.3rem,4vw,3.5rem)] leading-[1.04]`}>Find out where you stand. It’s free.</h2>
              <p className={`mt-4 max-w-[36rem] text-lg leading-relaxed ${MUTED}`}>Take the diagnostic and get a personalized training plan in minutes.</p>
            </div>
            <Link href={DIAGNOSTIC_HREF} className={BUTTON}>Take the free diagnostic</Link>
          </div>
        </section>
      </main>

      <footer className={`${WRAP} py-8`}>
        <p className="font-semibold">CaseTester</p>
        <p className={`mt-3 max-w-[48rem] text-xs leading-relaxed ${MUTED}`}>
          CaseTester is not affiliated with or endorsed by McKinsey &amp; Company, Boston Consulting Group, Bain &amp; Company, or any other firm named on this site.
        </p>
      </footer>
    </div>
  );
}
