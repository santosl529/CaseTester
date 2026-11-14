'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// "How CasePace works" (Matt, 13 Nov): the four parts of the app, each a link
// to its page, on Today in the student's first plan week (isFirstWeek). The
// lines borrow the homepage loop's wording. Got it and × hide it for this
// visit only: remembering it needs storage that doesn't exist yet (awaiting Matt).
const STEPS = [
  { name: 'Plan', href: '/drills/plan', line: 'Your schedule up to your interview, built around your gaps.' },
  { name: 'Learn', href: '/drills/learn', line: 'Short lessons on each skill. No business background required.' },
  { name: 'Drills', href: '/drills/browse', line: 'Quick practice on one skill at a time, until it’s automatic.' },
  { name: 'Cases', href: '/home', line: 'Full mock interviews with an AI interviewer that pushes back like a real consultant.' },
];

export function HowItWorks() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <section aria-labelledby="how-it-works" className="space-y-4 rounded-panel bg-sky/60 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id="how-it-works" className="t-heading font-semibold">How CasePace works</h2>
        <button type="button" aria-label="Dismiss" onClick={() => setHidden(true)}
          className="-mt-1 -mr-1 flex size-8 flex-none cursor-pointer items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-white/70 hover:text-ink motion-reduce:transition-none">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.name} className="t-small flex gap-3">
            <span aria-hidden="true" className="t-label flex size-6 flex-none items-center justify-center rounded-full bg-white font-semibold tabular-nums">{i + 1}</span>
            <span>
              <Link href={s.href} className="link inline-flex items-center gap-1 font-semibold">{s.name}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
              <span className="block text-ink/80">{s.line}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button variant="outline" size="sm" onClick={() => setHidden(true)}>Got it</Button>
    </section>
  );
}
