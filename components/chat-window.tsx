'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import { ExhibitTable } from '@/components/exhibit-table';

type ExhibitDisplay = {
  id: string;
  title: string;
  chartType: string;
  data: Record<string, unknown>[];
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
  const [status, setStatus] = useState<'idle' | 'waiting' | 'evaluating' | 'closed'>('idle');
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status !== 'idle';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  async function scoreAndRedirect() {
    setStatus('evaluating');
    // The score endpoint is idempotent, so one retry on failure is safe
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`/api/channel/${sessionId}/score`, { method: 'POST' });
      if (res.ok) {
        window.location.href = `/case/${sessionId}/report`;
        return;
      }
    }
    setMessages(m => [...m, {
      role: 'interviewer',
      text: 'The case ended, but generating your report hit an error. Reload this page to retry.',
    }]);
  }

  async function sendTurn(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'candidate', text }]);
    setStatus('waiting');
    const res = await fetch(`/api/channel/${sessionId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
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
      // No report — just close the input.
      setStatus('closed');
    } else if (data.ended) {
      await scoreAndRedirect();
    } else {
      setStatus('idle');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
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
        {status === 'evaluating' && <TypingIndicator label="Case ended, now evaluating…" />}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendTurn} className="border-t p-4 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your response…"
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" disabled={busy}>Send</Button>
      </form>
    </div>
  );
}
