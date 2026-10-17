'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Source = 'auto' | 'intro' | 'library' | 'low_score' | 'follow_up';

// Logs a lesson view with how long it was open, once: when the student acts,
// or when they leave the page.
function useLessonViewLog(lessonId: string, version: number, source: Source) {
  const opened = useRef(0);
  const logged = useRef(false);
  const log = (skipped: boolean) => {
    if (logged.current) return;
    logged.current = true;
    const body = JSON.stringify({ version, source, skipped, seconds_open: Math.round((Date.now() - opened.current) / 1000) });
    navigator.sendBeacon?.(`/api/drills/lessons/${lessonId}/views`, new Blob([body], { type: 'application/json' }));
  };

  useEffect(() => {
    opened.current = Date.now();
    // Leaving the page counts as a view too.
    const leave = () => log(false);
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return log;
}

// A lesson shown inside another page ("Defending your answer" on the results
// of a student's first follow-up): logs the view, renders nothing.
export function LessonViewLog({ lessonId, version, source }: { lessonId: string; version: number; source: Source }) {
  useLessonViewLog(lessonId, version, source);
  return null;
}

// The intro lesson's one action: log the view, then go on (to the training
// home, or back to the Learn library).
export function IntroLessonActions({ lessonId, version, source, next }: { lessonId: string; version: number; source: Source; next: { href: string; label: string } }) {
  const router = useRouter();
  const log = useLessonViewLog(lessonId, version, source);
  return <Button size="lg" onClick={() => { log(false); router.push(next.href); }}>{next.label}</Button>;
}

// "Try it" (and "Skip" when the lesson opened automatically): logs the view
// with how long the lesson was open, then starts the skill's next set, or
// the workout block that opened the lesson.
export function LessonActions({ lessonId, version, source, start, skippable }: {
  lessonId: string; version: number; source: Source; start: Record<string, unknown>; skippable: boolean;
}) {
  const router = useRouter();
  const log = useLessonViewLog(lessonId, version, source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go(skipped: boolean) {
    log(skipped);
    setBusy(true);
    const res = await fetch('/api/drills/sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(start) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok || data.error === 'set_in_progress') router.push(`/drills/sets/${data.set_id}`);
    else setError(data.message ?? 'Could not start the set.');
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg" onClick={() => go(false)} disabled={busy}>Try it</Button>
      {skippable && <Button variant="ghost" onClick={() => go(true)} disabled={busy}>Skip the lesson</Button>}
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
