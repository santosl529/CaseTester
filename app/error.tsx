'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusScreen } from '@/components/views/status';

// Any page that fails on the server (8 Nov: "make everything fail clearly"; Next showed its bare error page), in the
// site's style (UI unification, Matt). Says what happened and gives two ways on: try again (Next's reset), or home.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusScreen code="Error" title="Something went wrong on our side." body="This page couldn’t load. It’s usually temporary: try again in a moment. Your interviews and progress are saved.">
      <Button size="lg" onClick={() => reset()}>Try again</Button>
      <Link href="/home" className="link t-body">Go to home</Link>
      {error.digest && <p className="t-label text-ink/60">Reference: {error.digest}</p>}
    </StatusScreen>
  );
}
