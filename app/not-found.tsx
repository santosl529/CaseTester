import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusScreen } from '@/components/views/status';

export const metadata: Metadata = { title: 'Page not found' };

// Any missing page, or an interview or report that isn't yours or doesn't exist (8 Nov; was Next's bare 404), in the
// site's style (UI unification, Matt).
export default function NotFound() {
  return (
    <StatusScreen code="404" title="Page not found." body="This page doesn’t exist, or it belongs to a different account. Check the link, or start from your home page.">
      <Link href="/home" className={buttonVariants({ size: 'lg' })}>Go to home</Link>
      <Link href="/" className="link t-body">CasePace main page</Link>
    </StatusScreen>
  );
}
