'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import { ExhibitTable } from '@/components/exhibit-table';
import { CaseEndPanel, type EndReport } from '@/components/case-end-panel';
import { MAX_TURN_CHARS } from '@/lib/turn-limits';
import { postJson } from '@/lib/site/fetch-json';
import { turnFailure, OFFLINE } from '@/lib/site/failure-messages';
import { runScoring } from '@/lib/site/run-scoring';

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
      <div className="bg-neutral-100 rounded-lg px-4 py-3 flex items-center gap-1">
        {label && <span className="text-sm text-neutral-600 mr-2">{label}</span>}
        <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" />
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
  // What went wrong with the last send or End (8 Nov), shown above the box; cleared on the next try.
  const [notice, setNotice] = useState('');
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
    // finalize, then score; a pass already running elsewhere is waited out, not shown as a failure (run-scoring.ts).
    const result = await runScoring(sessionId);
    scoring.current = false;
    setEnded({ report: result === 'ready' ? 'ready' : 'failed' });
  }

  // Rule 18A: the candidate can end the interview at any time. With work done,
  // they get a report on what was covered; with none, no report.
  async function endInterview() {
    if (busy || !window.confirm('End the interview now? You\'ll get feedback on what you covered so far.')) return;
    setStatus('waiting');
    setNotice('');
    const res = await postJson(`/api/channel/${sessionId}/end`);
    const data = res.ok ? res.data as { status: string; report: boolean } | null : null;
    if (data?.report) {
      await prepareReport();
      return;
    }
    if (!data) {
      setNotice(res.status === 0 ? OFFLINE : 'The interview couldn’t be ended just now. Press End again.');
      setStatus('idle');
      return;
    }
    setMessages(m => [...m, { role: 'interviewer', text: 'The interview has ended. We hadn\'t got into the case, so there\'s no report this time — start a new case whenever you like.' }]);
    setStatus('closed');
    setEnded({});
  }

  async function sendTurn(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy || sending.current) return;
    sending.current = true;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'candidate', text }]);
    setStatus('waiting');
    setNotice('');
    const res = await postJson(`/api/channel/${sessionId}/turn`, { text });
    sending.current = false;
    if (!res.ok || !res.data) {
      // Not sent (or the answer was lost): take the bubble back, say why, and put the text back to send again.
      const failure = turnFailure(res.status, res.data);
      setMessages(m => (m[m.length - 1]?.role === 'candidate' && m[m.length - 1].text === text ? m.slice(0, -1) : m));
      if (failure.restoreInput) setInput(prev => prev || text);
      setNotice(failure.message);
      setStatus('idle');
      return;
    }
    const data = res.data as { interviewerText?: string; exhibit?: ExhibitDisplay; ended?: boolean; scoringSuppressed?: boolean };
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
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-4 py-2 text-sm ${
              m.role === 'candidate'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-100 text-neutral-900'
            }`}>
              {m.role === 'interviewer' ? (
                <>
                  {m.text && (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-strong:font-semibold">
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
      {!ended && notice && <p role="alert" className="border-t px-3 pt-2 sm:px-4 text-sm text-red-600">{notice}</p>}
      {!ended && <form onSubmit={sendTurn} className="border-t p-3 sm:p-4 flex gap-2">
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
