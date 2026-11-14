'use client';
import { useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { postJson } from '@/lib/site/fetch-json';
import { reportFailure } from '@/lib/site/failure-messages';
import { PROBLEM_REPORT_MAX } from '@/lib/site/problem-report';

// "Report a problem" (Lorenzo, 14 Nov) on the interview screens, the report and /account: a native <dialog> with
// one box; Send emails it to the founders (POST /api/report-problem), who reply by email. `sessionId` names the
// interview it's about. Send is disabled while sending, and a second click before that renders is ignored.
export function ReportProblemButton({ sessionId }: { sessionId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);
  const page = usePathname();
  const id = useId();

  function open() {
    setError('');
    setSent(false);
    ref.current?.showModal();
  }
  function close() {
    ref.current?.close();
    if (sent) setText('');
  }

  async function send() {
    if (!text.trim() || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    const res = await postJson('/api/report-problem', { message: text, sessionId, page });
    if (res.ok) { setSent(true); setText(''); }
    else setError(reportFailure(res.status, res.data));
    setSending(false);
    inFlight.current = false;
  }

  return (
    <>
      <button type="button" onClick={open} className="t-small cursor-pointer text-ink/70 underline underline-offset-4 hover:text-cobalt">Report a problem</button>
      <dialog ref={ref} aria-labelledby={`${id}-title`} onClose={() => { if (sent) setText(''); }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-ink/12 bg-white p-6 text-ink shadow-panel backdrop:bg-ink/40">
        <h2 id={`${id}-title`} className="t-heading font-semibold">Report a problem</h2>
        {sent ? (
          <div className="mt-3 space-y-4">
            <p role="status" className="t-body">Thanks — your report was sent. We’ll reply by email.</p>
            <Button onClick={close}>Close</Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <label htmlFor={`${id}-text`} className="t-small block text-ink/75">
              What went wrong, or what do you need? Questions, a grade you disagree with, or a request about your data or voice consent. We reply by email.
            </label>
            <textarea id={`${id}-text`} value={text} onChange={e => setText(e.target.value)} maxLength={PROBLEM_REPORT_MAX} rows={6}
              className="t-small w-full rounded-md border border-ink/20 bg-white px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt" />
            {error && <p role="alert" className="t-small text-alert">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={send} disabled={!text.trim() || sending}>{sending ? 'Sending…' : 'Send'}</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
