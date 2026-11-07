import { cn } from '@/lib/utils';

// The homepage's window (Matt's exhibition design): a thin border, a light
// title bar with three dots, a 10px radius. The public site's screens and the
// app's case material (exhibits, data tables, charts) both sit in it.
export function WindowFrame({ title, className, children }: { title?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-window border border-ink/15 bg-white shadow-window', className)}>
      <div className="relative flex h-7 flex-none items-center gap-1.5 border-b border-ink/10 bg-paper px-2.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink/15" /><span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink/15" /><span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink/15" />
        {title && <span className="t-label absolute left-1/2 -translate-x-1/2 font-semibold text-ink/70">{title}</span>}
      </div>
      {children}
    </div>
  );
}

// An exhibit: its label above the window ("Exhibit 2 · Revenue by region"),
// as on the homepage's slides.
export function Exhibit({ label, title, className, children }: { label?: string; title?: string; className?: string; children: React.ReactNode }) {
  return (
    <figure className={cn('min-w-0', className)}>
      {(label || title) && (
        <figcaption className="t-label mb-2">
          {label && <span className="font-semibold">{label}</span>}
          {title && <span className="text-ink/70">{label ? ' · ' : ''}{title}</span>}
        </figcaption>
      )}
      <WindowFrame>{children}</WindowFrame>
    </figure>
  );
}
