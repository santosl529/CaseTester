'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Approve / request changes for one lesson on the review page.
export function LessonReviewButtons({ lessonId, status, notes }: { lessonId: string; status: string; notes: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(approve: boolean) {
    setBusy(true);
    setError('');
    const res = await fetch('/api/drills/review/lessons', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(approve ? { lesson_id: lessonId, approve } : { lesson_id: lessonId, approve, notes: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.message ?? 'Could not save.'); return; }
    setOpen(false);
    setText('');
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-panel bg-sky/50 p-5">
      <p className="t-small">
        <span className="font-medium">Status: {status === 'live' ? 'Approved' : status === 'in_review' ? 'Changes requested' : 'Draft'}</span>
        {notes && <span className="block text-ink/70">Your notes: {notes}</span>}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => send(true)} disabled={busy || status === 'live'}>Approve</Button>
        <Button variant="outline" onClick={() => setOpen(o => !o)} disabled={busy}>Request changes</Button>
      </div>
      {open && (
        <div className="space-y-2">
          <label htmlFor={`notes-${lessonId}`} className="block t-small font-medium">What should change?</label>
          <textarea id={`notes-${lessonId}`} value={text} onChange={e => setText(e.target.value)} rows={3}
            className="w-full rounded-field border border-ink/20 bg-white p-3 t-small hover:border-ink/35 focus-visible:border-cobalt" />
          <Button onClick={() => send(false)} disabled={busy || !text.trim()}>Send</Button>
        </div>
      )}
      {error && <p role="alert" className="t-small text-alert">{error}</p>}
    </div>
  );
}
