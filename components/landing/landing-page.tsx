import { getImageProps } from 'next/image';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoopDiagram } from './loop-diagram';
import { LevelsDiagram } from './levels-diagram';
import { LoopVideo } from './loop-video';
import { DIAGNOSTIC_HREF, HERO_MEDIA, POINTS, ROWS, SKILLS, STATS, TECH, type Media, type ProductRow } from './content';
import styles from './landing.module.css';

// The public homepage (Matt's final brief, 21 Oct 2026): hero, stats bar, how
// it works (the loop), why it works, the 8 skills, six product rows, the
// technology, the close, the footer. Built in the app's own world (DESIGN.md).

const WRAP = 'mx-auto w-full max-w-6xl px-6';
const BIG = 'h-11 px-5 text-base';
const H2 = 'text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em]';

function DiagnosticButton({ className = '', tone = 'ink' }: { className?: string; tone?: 'ink' | 'paper' }) {
  return (
    <Link
      href={DIAGNOSTIC_HREF}
      className={cn(
        buttonVariants({ size: 'lg' }),
        BIG,
        tone === 'paper' && 'bg-background text-foreground hover:bg-background/90 focus-visible:ring-background/60 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground',
        className,
      )}
    >
      Take the free diagnostic
    </Link>
  );
}

// Each capture's shape, so the box is right before the image loads (phones
// get the narrow capture's).
const aspect = (m: Media) => ({ '--ar-wide': `${m.width} / ${m.height}`, '--ar-narrow': `${m.mobile.width} / ${m.mobile.height}` }) as React.CSSProperties;

// A product screen: a flat plate on a Mist field.
function Plate({ media, priority = false, sizes }: { media: Media; priority?: boolean; sizes: string }) {
  const id = `media-${media.src.replace(/\W+/g, '-')}`;
  if (media.kind === 'video') {
    return (
      <>
        <LoopVideo media={media} descriptionId={id} className={styles.art} style={aspect(media)} />
        <p id={id} className="sr-only">{media.alt}</p>
      </>
    );
  }
  // Art direction: the narrow capture below 1024px (phones and tablets, where
  // rows stack), the full one above.
  const { props: { srcSet: narrow } } = getImageProps({ alt: '', src: media.mobile.src, width: media.mobile.width, height: media.mobile.height, sizes: '448px', priority });
  const { props: { srcSet: wide, ...img } } = getImageProps({ alt: media.alt, src: media.src, width: media.width, height: media.height, sizes, priority });
  return (
    <div className="overflow-hidden rounded-[14px] bg-background ring-1 ring-foreground/10">
      <picture>
        <source media="(max-width: 1023px)" srcSet={narrow} />
        <source media="(min-width: 1024px)" srcSet={wide} />
        <img {...img} src={img.src} alt={media.alt} className={cn(styles.art, 'block h-auto w-full')} style={aspect(media)} />
      </picture>
    </div>
  );
}

// Text left, media right on desktop (Matt, 21 Oct); media on top below 1024px.
function Row({ row }: { row: ProductRow }) {
  return (
    <section id={row.id} aria-labelledby={`${row.id}-h`} className={cn(styles.row, 'grid items-center gap-8 lg:grid-cols-2 lg:gap-16 xl:gap-20')}>
      <div className="rounded-2xl bg-muted p-3 sm:p-5 lg:order-2">
        <div className="mx-auto max-w-md lg:max-w-none">
          <Plate media={row.media} sizes="(min-width: 1152px) 528px, (min-width: 1024px) 46vw, 448px" />
        </div>
      </div>
      <div className="max-w-[34rem]">
        {/* The step marker mirrors its loop box and links back to it. */}
        <a href={`#loop-${row.id}`} className={cn(styles.step, 'inline-block rounded-[10px] border border-foreground/20 px-3 py-1.5 text-sm font-medium outline-none hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2')}>
          {row.step}<span className="sr-only">: back to How it works</span>
        </a>
        <h3 id={`${row.id}-h`} className="mt-5 text-balance text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-[1.15] tracking-[-0.02em]">{row.headline}</h3>
        <p className="mt-3 text-lg leading-relaxed text-neutral-700">{row.body}</p>
        <ul className={cn(styles.bullets, 'mt-5 space-y-2 text-base leading-relaxed')}>
          {row.bullets.map(b => <li key={b}>{b}</li>)}
        </ul>
      </div>
    </section>
  );
}

// Stats bar: five across on desktop, 3 + 2 on tablet, one column on phones.
// Each item's dividers follow its place in those grids.
function statClass(i: number) {
  return cn(
    'flex flex-col-reverse justify-end gap-2 border-foreground/10 py-6 sm:px-6 lg:col-span-1 lg:border-t-0',
    i > 0 && 'border-t',
    i < 3 ? 'sm:col-span-2 sm:border-t-0' : 'sm:col-span-3 sm:border-t',
    (i === 1 || i === 2 || i === 4) && 'sm:border-l',
    i === 3 && 'lg:border-l',
    i === 0 && 'sm:pl-0',
    i === 3 && 'sm:pl-0 lg:pl-6',
  );
}

const NAV_LINK = 'rounded-md px-3 py-2 text-neutral-700 hover:bg-muted hover:text-foreground';
const CAPS = 'text-xs font-medium uppercase tracking-[0.08em]';

export function LandingPage() {
  return (
    <div data-landing className={cn(styles.page, 'flex min-h-full flex-col bg-background text-foreground')}>
      <a href="#main" className="sr-only rounded-md bg-foreground px-3 py-2 text-sm text-background focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50">Skip to content</a>

      <header>
        <nav aria-label="Main" className={cn(WRAP, 'flex h-16 items-center gap-1 text-sm')}>
          <Link href="/" className="mr-auto text-lg font-semibold tracking-[-0.01em]">CaseTester</Link>
          <a href="#how-it-works" className={NAV_LINK}>How it works</a>
          <a href="#technology" className={cn(NAV_LINK, 'hidden sm:inline-block')}>The technology</a>
          <Link href="/sign-in" className="rounded-md px-3 py-2 font-medium hover:bg-muted">Sign in</Link>
        </nav>
      </header>

      <main id="main" className="flex-1">
        {/* 1. Hero */}
        <section aria-labelledby="hero-h" className="overflow-x-clip">
          <div className={cn(WRAP, 'grid items-center gap-10 pt-10 pb-16 md:pt-16 md:pb-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16')}>
            <div>
              <h1 id="hero-h" className="text-balance text-[clamp(2.25rem,4.2vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
                A complete case interview training program, built around you.
              </h1>
              <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-neutral-700">
                Diagnostic, lessons, skill drills, and AI mock interviews, all in one comprehensive, personalized plan that adapts as you improve.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <DiagnosticButton />
                <a href="#how-it-works" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), BIG)}>See how it works</a>
              </div>
            </div>
            <div className="relative">
              <div aria-hidden="true" className={cn(styles.heroField, 'absolute -inset-y-6 -left-6 -right-6 rounded-2xl bg-muted lg:-inset-y-10 lg:-left-10 lg:rounded-r-none')} />
              {/* Below 1024px the narrow capture stays near its own size, centred on the Mist field. */}
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <Plate media={HERO_MEDIA} priority sizes="(min-width: 1152px) 640px, (min-width: 1024px) 56vw, 448px" />
              </div>
            </div>
          </div>
        </section>

        {/* 2. Stats bar */}
        <section aria-labelledby="stats-h" className={WRAP}>
          <h2 id="stats-h" className="sr-only">CaseTester at a glance</h2>
          <dl className="grid border-y border-foreground/10 sm:grid-cols-6 lg:grid-cols-5">
            {STATS.map((st, i) => (
              <div key={st.label} className={statClass(i)}>
                <dt className="max-w-[17rem] text-balance text-sm leading-snug text-neutral-700">{st.label}</dt>
                <dd className="text-[clamp(2.25rem,3.6vw,3rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">{st.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 3. How it works */}
        <section id="how-it-works" aria-labelledby="how-h" className="scroll-mt-6 py-20 md:py-28">
          <div className={WRAP}>
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="how-h" className={H2}>A training system, not a case library</h2>
              <p className="mt-4 text-lg leading-relaxed text-neutral-700">
                Most prep tools give you generic drills and a library of cases. That’s not nearly enough. We take a different approach, inspired by how elite performers train: diagnose weaknesses, master concepts, practice with purpose, perform under pressure, and repeat until you’re ready.
              </p>
            </div>
            <div className="mt-12 md:mt-16">
              <LoopDiagram />
            </div>
            <div className="mt-12 flex justify-center">
              <DiagnosticButton />
            </div>
          </div>
        </section>

        {/* 4. Why it works */}
        <section aria-labelledby="why-h" className="bg-muted py-20 md:py-28">
          <div className={WRAP}>
            <div className="max-w-3xl">
              <h2 id="why-h" className={H2}>Built on how experts actually learn</h2>
              <p className="mt-5 max-w-[65ch] text-lg leading-relaxed text-neutral-700">
                Doing case after case feels productive, but it rarely fixes what’s actually holding you back. A case interview is eight skills at once, and practicing them all together lets weak spots hide. We isolate each skill, train it to mastery, then prove it in a full case, so your improvement is real and lasts under pressure.
              </p>
            </div>
            <div className="mt-12 md:mt-14">
              <LevelsDiagram />
            </div>
            <div className="mt-14 grid gap-8 md:mt-16 md:grid-cols-2 md:gap-x-12 md:gap-y-10">
              {POINTS.map(p => (
                <div key={p.title} className="border-t-[1.5px] border-foreground pt-4">
                  <h3 className="text-lg font-semibold">{p.title}</h3>
                  <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-neutral-700">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. The 8 skills */}
        <section aria-labelledby="skills-h" className="py-20 md:py-28">
          <div className={WRAP}>
            <div className="max-w-3xl">
              <h2 id="skills-h" className={H2}>The 8 skills top firms hire for</h2>
              <p className="mt-4 text-lg leading-relaxed text-neutral-700">Interviewers at McKinsey, BCG, Bain, and the Big 4 evaluate the same core abilities. We train every one of them.</p>
            </div>
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SKILLS.map(sk => (
                <li key={sk.name} className="rounded-[10px] border border-foreground/15 p-5">
                  <h3 className="text-base font-semibold leading-snug">{sk.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700">{sk.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Inside the product */}
        <section aria-labelledby="see-h" className="border-t border-foreground/10 py-20 md:py-28">
          <div className={WRAP}>
            <h2 id="see-h" className={cn(H2, 'text-center')}>See it in action</h2>
            <div className="mt-14 space-y-20 md:mt-20 md:space-y-28">
              {ROWS.map(row => <Row key={row.id} row={row} />)}
            </div>
          </div>
        </section>

        {/* 7. The technology */}
        <section id="technology" aria-labelledby="tech-h" className="scroll-mt-6 bg-muted py-20 md:py-28">
          <div className={WRAP}>
            <div className="max-w-3xl">
              <p className={cn(CAPS, 'text-neutral-600')}>The technology</p>
              <h2 id="tech-h" className={cn(H2, 'mt-3')}>Engineered, not improvised.</h2>
              <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-neutral-700">
                General AI chatbots make up numbers, lose track of the case, and grade on vibes. Ours runs on specialized AI agents, code-enforced interview rules, and verification at every step, so the interviewer behaves like a real consultant and the feedback holds up.
              </p>
            </div>
            <ul className="mt-12 grid gap-4 md:grid-cols-2">
              {TECH.map(t => (
                <li key={t.n} className="flex flex-col rounded-[14px] bg-background p-6 ring-1 ring-foreground/10 md:p-8">
                  <p className={cn(CAPS, 'text-neutral-600')}><span className="tabular-nums">{t.n}</span> · {t.label}</p>
                  <h3 className="mt-4 text-xl font-semibold leading-snug tracking-[-0.01em]">{t.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-700">{t.body}</p>
                  <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-2 pt-6">
                    {t.tags.map(tag => <li key={tag} className={cn(CAPS, 'rounded-full border border-foreground/20 px-3 py-1 tracking-[0.06em]')}>{tag}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 8. Final call to action */}
        <section aria-labelledby="close-h" className="bg-foreground py-20 text-background md:py-28">
          <div className={cn(WRAP, 'text-center')}>
            <h2 id="close-h" className={cn(H2, 'mx-auto max-w-3xl')}>Find out where you stand. It’s free.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-background/80">Take the diagnostic and get a personalized training plan in minutes.</p>
            <DiagnosticButton tone="paper" className="mt-8" />
          </div>
        </section>
      </main>

      {/* 9. Footer */}
      <footer className="border-t border-foreground/10">
        <div className={cn(WRAP, 'py-8 text-sm')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <p className="font-semibold">CaseTester</p>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-neutral-700 sm:ml-6">
              <a href="#how-it-works" className="underline-offset-4 hover:text-foreground hover:underline">How it works</a>
              <a href="#technology" className="underline-offset-4 hover:text-foreground hover:underline">The technology</a>
              <Link href="/sign-in" className="underline-offset-4 hover:text-foreground hover:underline">Sign in</Link>
            </nav>
            <p className="text-neutral-600 sm:ml-auto">© 2026 CaseTester</p>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-neutral-600">
            CaseTester is not affiliated with or endorsed by McKinsey &amp; Company, Boston Consulting Group, Bain &amp; Company, or any other firm named on this site.
          </p>
        </div>
      </footer>
    </div>
  );
}
