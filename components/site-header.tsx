'use client';
import Link from 'next/link';
import { signOut } from '@/app/actions/auth';

// The shared header on /home, the case, report and voice pages and drills
// (site flow, 19 Oct). On a case page, leaving asks first: an interview still
// going stops there and isn't scored.
const LEAVE_CASE = 'Leave this page? If the interview is still going, it stops here and won’t be scored.';

export function SiteHeader({ inCase = false }: { inCase?: boolean }) {
  const confirmLeave = (e: React.SyntheticEvent) => {
    if (inCase && !window.confirm(LEAVE_CASE)) e.preventDefault();
  };
  const link = 'rounded-md px-2 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900';
  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-2xl items-center gap-1 px-4 py-2 text-sm">
        <Link href="/home" onClick={confirmLeave} className="mr-auto font-semibold text-neutral-900">Case Practice</Link>
        <Link href="/home" onClick={confirmLeave} className={link}>Home</Link>
        <Link href="/drills" onClick={confirmLeave} className={link}>Drills</Link>
        <form action={signOut} onSubmit={confirmLeave}>
          <button type="submit" className={link}>Sign out</button>
        </form>
      </nav>
    </header>
  );
}
