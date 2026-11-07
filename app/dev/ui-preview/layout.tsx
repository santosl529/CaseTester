import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PreviewNotes } from './_lib/guard';

// UI previews (Matt, 7 Nov 2026): every app screen with sample data, for the
// design pass's before-and-after screenshots. Development only: a 404 in any
// production build. Nothing here reads or writes the database (ESLint keeps
// the database and Supabase clients out of this folder), and the guard in
// _lib/guard.tsx answers the screens' requests from sample data and refuses
// the rest. Remove the folder when the pass is done.
export const metadata: Metadata = { title: 'UI preview', robots: { index: false, follow: false } };

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <>
      {children}
      <PreviewNotes />
    </>
  );
}
