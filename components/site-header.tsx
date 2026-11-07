'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/actions/auth';

// The shared header on /home, the case, report and voice pages and drills
// (site flow, 19 Oct), in the homepage header's style (UI unification, 7 Nov).
// On a case page, leaving asks first: an interview still going stops there
// and isn't scored.
const LEAVE_CASE = 'Leave this page? If the interview is still going, it stops here and won’t be scored.';

export function SiteHeader({ inCase = false }: { inCase?: boolean }) {
  const path = usePathname() ?? '';
  const confirmLeave = (e: React.SyntheticEvent) => {
    if (inCase && !window.confirm(LEAVE_CASE)) e.preventDefault();
  };
  const link = 'link t-small aria-[current=page]:text-cobalt aria-[current=page]:decoration-2';
  return (
    <header className="sticky top-0 z-40 h-(--hdr) border-b border-ink/14 bg-paper/88 backdrop-blur-[10px]">
      <nav aria-label="Site" className="mx-auto flex h-full w-full max-w-[1240px] items-center gap-5 px-6 lg:px-12">
        <Link href="/home" onClick={confirmLeave} className="t-card mr-auto font-semibold tracking-[-0.02em] text-ink">CasePace</Link>
        <Link href="/home" onClick={confirmLeave} aria-current={path === '/home' ? 'page' : undefined} className={link}>Home</Link>
        <Link href="/drills" onClick={confirmLeave} aria-current={path.startsWith('/drills') ? 'page' : undefined} className={link}>Drills</Link>
        <form action={signOut} onSubmit={confirmLeave}>
          <button type="submit" className={`${link} cursor-pointer`}>Sign out</button>
        </form>
      </nav>
    </header>
  );
}
