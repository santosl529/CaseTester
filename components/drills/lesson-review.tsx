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
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm">
        <span className="font-medium">Status: {status === 'live' ? 'Approved' : status === 'in_review' ? 'Changes requested' : 'Draft'}</span>
        {notes && <span className="block text-muted-foreground">Your notes: {notes}</span>}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => send(true)} disabled={busy || status === 'live'}>Approve</Button>
        <Button variant="outline" onClick={() => setOpen(o => !o)} disabled={busy}>Request changes</Button>
      </div>
      {open && (
        <div className="space-y-2">
          <label htmlFor={`notes-${lessonId}`} className="block text-sm font-medium">What should change?</label>
          <textarea id={`notes-${lessonId}`} value={text} onChange={e => setText(e.target.value)} rows={3}
            className="w-full rounded-md border bg-background p-2 text-sm" />
          <Button onClick={() => send(false)} disabled={busy || !text.trim()}>Send</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
