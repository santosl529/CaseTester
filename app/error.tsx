'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/components/views/status';

// A page that failed to render, in the site's style (UI unification, 7 Nov).
// "Try again" re-renders the page (Next's reset); nothing else changes.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen code="Error" title="Something went wrong." body="This page didn’t load. Try again, or go back to the homepage.">
      <Button size="lg" onClick={() => reset()}>Try again</Button>
      <Link href="/" className="link t-body">Go to the homepage</Link>
    </StatusScreen>
  );
}
