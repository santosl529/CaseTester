import { LEVELS } from './content';

// "Why it works" (homepage brief §3): Recognize → Generate → Perform, left to
// right with arrows on desktop, stacked with arrows down on phones.
export function LevelsDiagram() {
  return (
    <ol className="grid gap-10 md:grid-cols-3 md:gap-12">
      {LEVELS.map((level, i) => (
        <li key={level.name} className="relative flex flex-col gap-3 rounded-[10px] border border-foreground/20 bg-background p-5">
          <p className="text-lg font-semibold leading-snug">
            {level.name}
            <span className="sr-only">{`, level ${i + 1} of ${LEVELS.length}`}</span>
          </p>
          <p className="text-base leading-relaxed text-neutral-700">{level.description}</p>
          {level.example && (
            <p className="mt-1 border-t border-foreground/15 pt-3 text-sm leading-relaxed text-neutral-700">
              <span className="font-medium text-foreground">Example: </span>“{level.example}”
            </p>
          )}
          {i < LEVELS.length - 1 && (
            <svg
              aria-hidden="true"
              viewBox="0 0 40 12"
              className="absolute -bottom-[1.625rem] left-1/2 h-3 w-8 -translate-x-1/2 rotate-90 fill-foreground stroke-foreground md:top-1/2 md:-right-10 md:bottom-auto md:left-auto md:translate-x-0 md:-translate-y-1/2 md:rotate-0"
            >
              <path d="M0 6h33" fill="none" strokeWidth="1.5" />
              <path d="M32 1l8 5-8 5z" stroke="none" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}
