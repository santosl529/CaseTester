'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import { ExhibitTable } from '@/components/exhibit-table';
import { CaseEndPanel, type EndReport } from '@/components/case-end-panel';
import { MAX_TURN_CHARS } from '@/lib/turn-limits';

type ExhibitDisplay = {
  id: string;
  title: string;
  chartType: string;
  data: Record<string, unknown>[];
  notes?: string;
};

type Message =
  | { role: 'interviewer' | 'candidate'; text: string; exhibit?: ExhibitDisplay };

function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex justify-start">
      {/* A soft pulse while the interviewer replies (opacity only; still under reduced motion). */}
      <div className="flex items-center gap-1 rounded-[14px] rounded-tl-md border border-ink/10 bg-white px-4 py-3">
        {label && <span className="t-small mr-2 text-ink/70">{label}</span>}
        <span className="size-1.5 rounded-full bg-ink/40 motion-safe:animate-pulse [animation-delay:-0.3s]" />
        <span className="size-1.5 rounded-full bg-ink/40 motion-safe:animate-pulse [animation-delay:-0.15s]" />
        <span className="size-1.5 rounded-full bg-ink/40 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

export function ChatWindow({ sessionId, initialMessage }: { sessionId: string; initialMessage: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'interviewer', text: initialMessage },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'waiting' | 'closed'>('idle');
  // The end screen (site flow, 19 Oct): shown once the case ends; `report`
  // absent when the case ended with no report.
  const [ended, setEnded] = useState<{ report?: EndReport } | null>(null);
  const scoring = useRef(false);
  // A second Send that lands before the disabled state renders (CLAUDE.md: never charge twice).
  const sending = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status !== 'idle';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, ended]);

  // Scoring starts as soon as the case ends; the end screen's "Get my report"
  // opens once it lands (site flow, 19 Oct — it no longer jumps to the report).
  async function prepareReport() {
    if (scoring.current) return; // a double click on "Try again"
    scoring.current = true;
    setStatus('closed');
    setEnded({ report: 'preparing' });
    // A math check still running on the last message reaches the report (…/finalize waits for it, ≤30s).
    await fetch(`/api/channel/${sessionId}/finalize`, { method: 'POST' }).catch(() => null);
    // The score endpoint is idempotent, so one retry on failure is safe
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`/api/channel/${sessionId}/score`, { method: 'POST' }).catch(() => null);
      if (res?.ok) {
        scoring.current = false;
        setEnded({ report: 'ready' });
        return;
      }
    }
    scoring.current = false;
    setEnded({ report: 'failed' });
  }

  // Rule 18A: the candidate can end the interview at any time. With work done,
  // they get a report on what was covered; with none, no report.
  async function endInterview() {
    if (busy || !window.confirm('End the interview now? You\'ll get feedback on what you covered so far.')) return;
    setStatus('waiting');
    const res = await fetch(`/api/channel/${sessionId}/end`, { method: 'POST' });
    const data = res.ok ? await res.json() as { status: string; report: boolean } : null;
    if (data?.report) {
      await prepareReport();
      return;
    }
    setMessages(m => [...m, {
      role: 'interviewer',
      text: data ? 'The interview has ended. We hadn\'t got into the case, so there\'s no report this time — start a new case whenever you like.' : 'Something went wrong ending the interview. Please try again.',
    }]);
    setStatus(data ? 'closed' : 'idle');
    if (data) setEnded({});
  }

  async function sendTurn(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy || sending.current) return;
    sending.current = true;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'candidate', text }]);
    setStatus('waiting');
    const res = await fetch(`/api/channel/${sessionId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).finally(() => { sending.current = false; });
    if (!res.ok) {
      setMessages(m => [...m, { role: 'interviewer', text: 'Something went wrong. Please try again.' }]);
      setStatus('idle');
      return;
    }
    const data = await res.json();
    // Render the turn if there's text OR an exhibit — an exhibit-only turn (the
    // model showed a chart without speaking) must not be dropped.
    if (data.interviewerText || data.exhibit) {
      setMessages(m => [...m, { role: 'interviewer', text: data.interviewerText ?? '', exhibit: data.exhibit }]);
    }
    if (data.ended && data.scoringSuppressed) {
      // Session ended without a score (conduct termination or accepted pause).
      // No report — the end screen without one.
      setStatus('closed');
      setEnded({});
    } else if (data.ended) {
      await prepareReport();
    } else {
      setStatus('idle');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Focusable, so the conversation can be scrolled from the keyboard. */}
      <div role="region" aria-label="Conversation" tabIndex={0} className="flex-1 overflow-y-auto space-y-4 px-6 py-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex animate-enter motion-reduce:animate-none ${m.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            <div className={`t-small max-w-[85%] sm:max-w-[75%] px-4 py-3 ${
              m.role === 'candidate'
                ? 'rounded-[14px] rounded-tr-md bg-cobalt text-white'
                : 'rounded-[14px] rounded-tl-md border border-ink/10 bg-white text-ink'
            }`}>
              {m.role === 'interviewer' ? (
                <>
                  {m.text && (
                    <div className="space-y-2 [&_strong]:font-semibold">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  )}
                  {m.exhibit && <ExhibitTable exhibit={m.exhibit} />}
                </>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        {status === 'waiting' && <TypingIndicator />}
        {ended && <CaseEndPanel sessionId={sessionId} report={ended.report} onRetry={prepareReport} />}
        <div ref={bottomRef} />
      </div>
      {!ended && <form onSubmit={sendTurn} className="flex gap-2 border-t border-ink/12 bg-paper px-6 py-4">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your response…"
          disabled={busy}
          maxLength={MAX_TURN_CHARS}
          className="flex-1"
        />
        <Button type="submit" disabled={busy}>Send</Button>
        <Button type="button" variant="outline" onClick={endInterview} disabled={busy}>End</Button>
      </form>}
    </div>
  );
}
