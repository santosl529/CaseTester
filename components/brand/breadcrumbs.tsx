'use client';
import Link from 'next/link';

// The trail above a deeper page's title (Matt, 13 Nov 2026): a lesson, a drill
// set, a skill's progress, a case report. Never on the six main pages. Every
// part but the last is a link; `confirm`, while timed work is running, asks
// before leaving (as the bar's Exit does).
export function Breadcrumbs({ trail, confirm }: { trail: { label: string; href?: string }[]; confirm?: string }) {
  const onClick = (e: React.MouseEvent) => {
    if (confirm && !window.confirm(confirm)) e.preventDefault();
  };
  return (
    <nav aria-label="Breadcrumb">
      <ol className="t-small flex flex-wrap items-center gap-x-2 gap-y-1 text-ink/70">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-2">
              {last || !c.href
                ? <span aria-current={last ? 'page' : undefined} className={last ? 'text-ink' : undefined}>{c.label}</span>
                : <Link href={c.href} onClick={onClick} className="underline-offset-4 transition-colors hover:text-cobalt hover:underline motion-reduce:transition-none">{c.label}</Link>}
              {!last && <span aria-hidden="true" className="text-ink/40">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
