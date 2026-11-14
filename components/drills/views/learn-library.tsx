import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StepDot } from '@/components/brand/progress';
import { AppPage } from '@/components/brand/page';
import { DRILLS_CONFIG, getSkill } from '@/lib/drills/config';
import { FOR_YOU_REASON, type ForYouReason } from '@/lib/drills/learn-page';
import type { IntroLesson } from '@/lib/drills/lessons';

// The Learn library's screen; app/drills/learn/page.tsx loads its data. One
// job, reading a lesson (Matt, 13 Nov): For you this week, Start here, then
// each skill area, with links to jump to an area. Where a lesson is practised
// is on the lesson itself.
export function LearnLibrary({ available, intro, read, introRead, forYou }: {
  available: Set<string>;
  intro: IntroLesson | null;
  // Skills whose lesson the student has read, and the intro.
  read: Set<string>;
  introRead: boolean;
  forYou: { skill_id: string; reason: ForYouReason }[];
}) {
  const areas = DRILLS_CONFIG.taxonomy.areas
    .map(a => ({ ...a, skills: DRILLS_CONFIG.taxonomy.skills.filter(s => s.area === a.code && available.has(s.id)) }))
    .filter(a => a.skills.length > 0);
  const introRow = intro && (
    <Row href="/drills/learn/intro" title={intro.title} line="The four stages of a case, what interviewers look for in each, and the skills each one uses." read={introRead} />
  );
  return (
    <AppPage className="space-y-10">
      <header className="space-y-3">
        <h1 className="t-title">Learn</h1>
        <p className="t-body max-w-[65ch] text-ink/70">Short lessons, a few minutes each: the idea, a pattern to follow, worked examples and the usual mistakes.</p>
        {areas.length > 1 && (
          <nav aria-label="Skill areas" className="t-small flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {areas.map(a => <a key={a.code} href={`#area-${a.code}`} className="link">{a.name}</a>)}
          </nav>
        )}
      </header>
      {forYou.length > 0 && (
        <section aria-labelledby="for-you" className="space-y-2">
          <h2 id="for-you" className="t-label font-semibold text-ink/70">For you this week</h2>
          <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {forYou.map(f => (
              <li key={f.skill_id}><Row href={`/drills/learn/${encodeURIComponent(f.skill_id)}`} title={getSkill(f.skill_id).name} line={FOR_YOU_REASON[f.reason]} read={read.has(f.skill_id)} /></li>
            ))}
          </ul>
        </section>
      )}
      {intro && (
        <section aria-labelledby="start-here" className="space-y-2">
          <h2 id="start-here" className="t-label font-semibold text-ink/70">Start here</h2>
          {/* Until it's been read, the intro is the page's highlight; then it's an ordinary row. */}
          {introRead
            ? <ul className="overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet"><li>{introRow}</li></ul>
            : (
              <Link href="/drills/learn/intro" className="group flex items-center gap-4 rounded-panel bg-sky/60 p-5 transition-colors hover:bg-sky motion-reduce:transition-none">
                <span className="t-small flex-1">
                  <span className="t-body block font-semibold">{intro.title}</span>
                  <span className="block text-ink/75">The four stages of a case, what interviewers look for in each, and the skills each one uses.</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 flex-none text-ink/60 group-hover:text-cobalt" />
              </Link>
            )}
        </section>
      )}
      {areas.length === 0 && !intro && <p className="t-body">Lessons are on their way.</p>}
      {areas.map(a => (
        <section key={a.code} id={`area-${a.code}`} aria-labelledby={`area-${a.code}-h`} className="scroll-mt-20 space-y-2">
          <h2 id={`area-${a.code}-h`} className="t-label font-semibold text-ink/70">{a.name}</h2>
          <ul className="divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {a.skills.map(s => (
              <li key={s.id}><Row href={`/drills/learn/${encodeURIComponent(s.id)}`} title={s.name} line={s.description} read={read.has(s.id)} /></li>
            ))}
          </ul>
        </section>
      ))}
    </AppPage>
  );
}

// A lesson row: the title, its line in gray under it, then Read ✓ and the chevron.
function Row({ href, title, line, read }: { href: string; title: string; line: string; read: boolean }) {
  return (
    <Link href={href} className="group t-small flex items-center gap-4 p-4 transition-colors hover:bg-paper motion-reduce:transition-none">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold group-hover:text-cobalt">{title}</span>
        <span className="block text-ink/70">{line}</span>
      </span>
      {read && (
        <span className="t-label inline-flex flex-none items-center gap-1.5 font-semibold text-ink">Read<StepDot state="done" /></span>
      )}
      <ChevronRight aria-hidden="true" className="size-4 flex-none text-ink/40 group-hover:text-cobalt" />
    </Link>
  );
}
