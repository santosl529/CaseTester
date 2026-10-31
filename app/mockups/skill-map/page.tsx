import { Header, Hero, ProductRow, Stats, TechSection } from './sections';
import { Spine } from './spine';
import s from './skill-map.module.css';

// Concept 3: The Skill Map.
export default function SkillMapMockup() {
  return (
    <div data-mockup className="flex-1 bg-(--paper)">
      <Header />
      <Spine className={s.main} spineClass={s.spine}>
        <Hero />
        <Stats />
        <ProductRow />
        <TechSection />
      </Spine>
    </div>
  );
}
