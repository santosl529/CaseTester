import Link from 'next/link';
import { AppPage } from '@/components/brand/page';

// The not-found and error pages (app/not-found.tsx, app/error.tsx), in the
// homepage's style: the wordmark home, a title, one line, the way on.
export function StatusScreen({ code, title, body, children }: { code: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="h-(--hdr) border-b border-ink/14">
        <div className="mx-auto flex h-full w-full max-w-[1240px] items-center px-6 lg:px-12">
          <Link href="/" className="t-card font-semibold tracking-[-0.02em] transition-colors hover:text-cobalt motion-reduce:transition-none">CasePace</Link>
        </div>
      </header>
      <AppPage width="narrow" className="flex flex-1 flex-col justify-center space-y-5 pb-32">
        <p className="t-label font-semibold text-ink/70 tabular-nums">{code}</p>
        <h1 className="t-title text-balance">{title}</h1>
        <p className="t-body text-ink/75">{body}</p>
        <div className="flex flex-wrap items-center gap-4 pt-2">{children}</div>
      </AppPage>
    </div>
  );
}
