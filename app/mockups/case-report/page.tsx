import { Colophon, ExhibitRow, Findings, Hero, Masthead, TechChapter } from './sections';

// Concept 1: The Case Report. `?type=sans` sets the headlines in Geist for the
// serif-versus-sans comparison the brief asks for.
export default async function CaseReportMockup({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const serif = (await searchParams).type !== 'sans';
  return (
    <div data-mockup className="flex-1 bg-(--paper)">
      <Masthead />
      <main>
        <Hero serif={serif} />
        <Findings serif={serif} />
        <ExhibitRow serif={serif} />
        <TechChapter serif={serif} />
      </main>
      <Colophon />
    </div>
  );
}
