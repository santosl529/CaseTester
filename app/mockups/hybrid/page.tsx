import { ExhibitRow, Findings, Hero, Masthead, headlineClass } from '../case-report/sections';
import { TechSection, controlRoomStyles as cr } from '../control-room/sections';
import report from '../case-report/case-report.module.css';

// Hybrid (Matt's leaning, 21 Oct 2026): the Case Report's masthead, hero,
// findings slide and exhibit row; the technology chapter in the Control
// Room's dark style, keeping the report's chapter number and serif headline so
// it reads as chapter 04 of the same document.
export default function HybridMockup() {
  return (
    <div data-mockup className="flex-1 bg-(--paper)">
      <Masthead />
      <main>
        <Hero serif />
        <Findings serif />
        <ExhibitRow serif />
        <div data-on-ink className={`${cr.band} overflow-x-clip border-t border-(--ink)`}>
          <TechSection className="lg:pt-14"
            headlineClassName={`${headlineClass(true)} text-(--white)`}
            titleClassName={`${headlineClass(true)} text-[1.5rem]`}
            glow
            chapter={<p aria-hidden="true" className={`${report.chapterNumber} mb-6 text-[1.75rem] text-(--sky) lg:mb-0 lg:text-[2.75rem]`}>04</p>}
          />
        </div>
      </main>
    </div>
  );
}
