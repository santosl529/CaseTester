import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { StatusScreen } from '@/components/views/status';

export const metadata: Metadata = { title: 'Page not found' };

// Any page that doesn't exist, in the site's style (UI unification, 7 Nov).
export default function NotFound() {
  return (
    <StatusScreen code="404" title="This page could not be found." body="The link may be out of date, or the page has moved.">
      <Link href="/" className={buttonVariants({ size: 'lg' })}>Go to the homepage</Link>
    </StatusScreen>
  );
}
