import Link from 'next/link';
import { AREAS, SCREENS } from './_lib/screens';

// The list of preview screens.
export default function PreviewIndex() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="t-title">UI preview</h1>
        <p className="t-small text-ink/70">Every screen of the app with sample data. Nothing is sent: requests get sample answers, and links stay here. Development only.</p>
      </header>
      {AREAS.map(area => {
        const list = SCREENS.filter(s => s.area === area);
        if (!list.length) return null;
        return (
          <section key={area} aria-labelledby={`a-${area}`} className="space-y-2">
            <h2 id={`a-${area}`} className="t-label font-semibold text-ink/70">{area}</h2>
            <ul className="t-small divide-y divide-ink/10 rounded-panel border border-ink/12 bg-white">
              {list.map(s => (
                <li key={s.slug} className="flex items-baseline justify-between gap-3 p-3">
                  <Link href={`/dev/ui-preview/${s.slug}`} className="link">{s.title}</Link>
                  {s.pilot && <span className="t-label text-ink/70">Pilot</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
