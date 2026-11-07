import Link from 'next/link';
import { AREAS, SCREENS } from './_lib/screens';

// The list of preview screens.
export default function PreviewIndex() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">UI preview</h1>
        <p className="text-sm text-muted-foreground">Every screen of the app with sample data. Nothing is sent: requests get sample answers, and links stay here. Development only.</p>
      </header>
      {AREAS.map(area => {
        const list = SCREENS.filter(s => s.area === area);
        if (!list.length) return null;
        return (
          <section key={area} aria-labelledby={`a-${area}`} className="space-y-2">
            <h2 id={`a-${area}`} className="text-sm font-semibold">{area}</h2>
            <ul className="divide-y rounded-lg border text-sm">
              {list.map(s => (
                <li key={s.slug} className="flex items-baseline justify-between gap-3 p-3">
                  <Link href={`/dev/ui-preview/${s.slug}`} className="underline underline-offset-4">{s.title}</Link>
                  {s.pilot && <span className="text-xs text-muted-foreground">Pilot</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
