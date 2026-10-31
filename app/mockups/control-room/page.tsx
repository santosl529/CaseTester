import { Header, Hero, ProductRow, Stats, TechSection, controlRoomStyles as s } from './sections';

// Concept 2: The Control Room.
export default function ControlRoomMockup() {
  return (
    <div data-mockup data-on-ink className={`${s.page} flex-1`}>
      <Header />
      <main>
        <Hero />
        <Stats />
        <ProductRow />
        <TechSection className="border-t border-(--sky)/12" />
      </main>
    </div>
  );
}
