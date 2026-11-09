'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';

// Any page that fails on the server (8 Nov: "make everything fail clearly"; Next showed its bare error page).
// Says what happened and gives two ways on: try again, or home.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong on our side</h1>
      <p className="text-sm text-neutral-600">This page couldn’t load. It’s usually temporary: try again in a moment. Your interviews and progress are saved.</p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/home" className={buttonVariants({ variant: 'outline' })}>Go to home</Link>
      </div>
      {error.digest && <p className="text-xs text-neutral-400">Reference: {error.digest}</p>}
    </main>
  );
}
