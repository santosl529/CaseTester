// "DRILL" / "LESSON" before a drill's or a lesson's name, wherever one is named (Matt, 22 Nov 2026: option A), so a
// student can always tell what a name refers to. Small capitals in a tinted pill: Cobalt for drills, Sky for lessons.
// Not used inside buttons or sentences that already say "set" or "lesson".
export function KindTag({ kind, className = '' }: { kind: 'drill' | 'lesson'; className?: string }) {
  const tone = kind === 'drill' ? 'bg-cobalt/10 text-cobalt' : 'bg-sky text-ink';
  // A real space after the pill, so the label and the name are read as two words.
  return (
    <>
    <span className={`inline-block rounded-full px-1.5 py-px align-[0.12em] text-[0.6875rem] leading-normal font-semibold tracking-wider uppercase ${tone} ${className}`}>
      {kind === 'drill' ? 'Drill' : 'Lesson'}
    </span>{' '}
    </>
  );
}
