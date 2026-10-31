'use client';
import { useState, type ReactNode } from 'react';
import { CONTACT } from './content';

// "Take the free diagnostic" for now (Matt, 27 Oct 2026): every such button
// on the mockup stays on the page and, once clicked, reads "Contact our team
// to learn more!" instead. A button, not a link, since it goes nowhere; the
// new label is announced (aria-live).
export function DiagnosticCta({ children, className, id }: { children: ReactNode; className: string; id?: string }) {
  const [asked, setAsked] = useState(false);
  return (
    <button type="button" id={id} className={className} data-asked={asked} onClick={() => setAsked(true)}>
      <span aria-live="polite">{asked ? CONTACT : children}</span>
    </button>
  );
}
