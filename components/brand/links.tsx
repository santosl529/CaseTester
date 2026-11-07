import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// The homepage's text links: underlined Ink, Cobalt on hover, and an arrow
// drawn as an icon (never part of the words, so labels stay as written).

export function ArrowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn('link inline-flex items-center gap-1.5', className)}>
      {children}<ArrowRight aria-hidden="true" className="size-4 flex-none" />
    </Link>
  );
}

// Back to the page above: quieter, the arrow first.
export function BackLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn('t-small inline-flex items-center gap-1.5 text-ink/70 underline-offset-4 transition-colors hover:text-cobalt hover:underline motion-reduce:transition-none', className)}>
      <ArrowLeft aria-hidden="true" className="size-4 flex-none" />{children}
    </Link>
  );
}
