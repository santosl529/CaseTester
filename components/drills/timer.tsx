'use client';
import { useEffect, useRef, useState } from 'react';

// Visible countdown with screen-reader announcements at 50%, 25% and 10
// seconds left (docs/prd-drills.md "Accessibility"). The server enforces the
// limit; this only shows it and fires onExpire so the item auto-submits.
// Hidden (D6 round 2): no countdown, only a warning about 10 seconds before
// time runs out. Paused: the clock stops while a dialog is open, and the
// parent passes the new deadline when it resumes. The parent keys this by
// item and stage, so the marks start over only for a new clock.
export function Timer({ deadline, totalMs, onExpire, hidden = false, paused = false }: {
  deadline: number; totalMs: number; onExpire: () => void; hidden?: boolean; paused?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(new Set<string>());
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    if (paused) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [deadline, paused]);

  const remaining = Math.max(0, deadline - now);
  const seconds = Math.ceil(remaining / 1000);

  useEffect(() => {
    if (paused) return;
    // Hidden: only the 10-second warning.
    const marks: [string, boolean][] = hidden
      ? [['ten', remaining <= 10_000]]
      : [['half', remaining <= totalMs / 2], ['quarter', remaining <= totalMs / 4], ['ten', remaining <= 10_000]];
    for (const [mark, hit] of marks) {
      if (hit && remaining > 0 && !announced.current.has(mark)) {
        // Announce only the latest mark passed, once.
        for (const [m, h] of marks) if (h) announced.current.add(m);
        setAnnouncement(hidden ? 'Less than 10 seconds left' : `${seconds} seconds left`);
        break;
      }
    }
    if (remaining === 0 && !expired.current) {
      expired.current = true;
      setAnnouncement('Time is up');
      onExpireRef.current();
    }
  }, [remaining, totalMs, seconds, hidden, paused]);

  const share = totalMs > 0 ? remaining / totalMs : 0;
  const warn = remaining > 0 && remaining <= 10_000;
  // The last 10 seconds turn the time and its line red (Matt, 7 Nov: a colour
  // change only, no flashing or pulsing).
  return (
    <div className="space-y-1.5">
      {hidden ? (
        <>
          <p className="t-small text-ink/70">{paused ? 'Timer paused' : 'Timer hidden'}</p>
          {warn && !paused && <p className="t-small rounded-field border border-alert/40 bg-white px-3 py-2 font-semibold text-alert">Less than 10 seconds left.</p>}
        </>
      ) : (
        <>
          <div className="t-small flex justify-between">
            <span className="text-ink/70">{paused ? 'Timer paused' : 'Time left'}</span>
            <span role="timer" aria-live="off" className={`font-semibold tabular-nums ${seconds <= 10 ? 'text-alert' : 'text-ink'}`}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
            <div className={`h-full origin-left rounded-full ${seconds <= 10 ? 'bg-alert' : 'bg-cobalt'}`} style={{ transform: `scaleX(${share})` }} />
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
