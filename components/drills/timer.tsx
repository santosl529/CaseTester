'use client';
import { useEffect, useRef, useState } from 'react';

// Visible countdown with screen-reader announcements at 50%, 25% and 10
// seconds left (docs/prd-drills.md "Accessibility"). The server enforces the
// limit; this only shows it and fires onExpire so the item auto-submits.
export function Timer({ deadline, totalMs, onExpire }: { deadline: number; totalMs: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(new Set<string>());
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    announced.current = new Set();
    expired.current = false;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const remaining = Math.max(0, deadline - now);
  const seconds = Math.ceil(remaining / 1000);

  useEffect(() => {
    const marks: [string, boolean][] = [
      ['half', remaining <= totalMs / 2],
      ['quarter', remaining <= totalMs / 4],
      ['ten', remaining <= 10_000],
    ];
    for (const [mark, hit] of marks) {
      if (hit && remaining > 0 && !announced.current.has(mark)) {
        // Announce only the latest mark passed, once.
        for (const [m, h] of marks) if (h) announced.current.add(m);
        setAnnouncement(`${seconds} seconds left`);
        break;
      }
    }
    if (remaining === 0 && !expired.current) {
      expired.current = true;
      setAnnouncement('Time is up');
      onExpireRef.current();
    }
  }, [remaining, totalMs, seconds]);

  const share = totalMs > 0 ? remaining / totalMs : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>Time left</span>
        <span role="timer" aria-live="off" className={`font-mono tabular-nums ${seconds <= 10 ? 'text-destructive' : ''}`}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-muted" aria-hidden="true">
        <div className={`h-full ${seconds <= 10 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${share * 100}%` }} />
      </div>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
