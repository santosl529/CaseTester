'use client';
import Link from 'next/link';
import type { ComponentProps } from 'react';

// A link whose click is logged as next_step_clicked (a case report's next steps; Matt, 15 Nov).
export function TrackedLink({ track, ...props }: ComponentProps<typeof Link> & { track: Record<string, unknown> }) {
  return <Link {...props} onClick={() => navigator.sendBeacon?.('/api/drills/next-steps', new Blob([JSON.stringify(track)], { type: 'application/json' }))} />;
}
