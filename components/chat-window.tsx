'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';

type Message = { role: 'interviewer' | 'candidate'; text: string };

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-neutral-100 rounded-lg px-4 py-3 flex items-center gap-1">
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
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendTurn(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'candidate', text }]);
    setLoading(true);
    const res = await fetch(`/api/channel/${sessionId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      setMessages(m => [...m, { role: 'interviewer', text: 'Something went wrong. Please try again.' }]);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setMessages(m => [...m, { role: 'interviewer', text: data.interviewerText }]);
    setLoading(false);
    if (data.ended) {
      setEnded(true);
      window.location.href = `/case/${sessionId}/report`;
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
                <div className="prose prose-sm max-w-none prose-p:my-1 prose-strong:font-semibold">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendTurn} className="border-t p-4 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your response…"
          disabled={loading || ended}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || ended}>Send</Button>
      </form>
    </div>
  );
}
