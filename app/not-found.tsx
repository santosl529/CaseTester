import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

// Any missing page, or an interview or report that isn't yours or doesn't exist (8 Nov; was Next's bare 404).
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-neutral-600">This page doesn’t exist, or it belongs to a different account. Check the link, or start from your home page.</p>
      <div className="flex gap-2">
        <Link href="/home" className={buttonVariants()}>Go to home</Link>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>CasePace main page</Link>
      </div>
    </main>
  );
}
