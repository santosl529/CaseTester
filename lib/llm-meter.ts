// fetch wrapper for the Anthropic client (lib/anthropic-client.ts). With a run
// budget installed (lib/llm-budget.ts) it checks the budget before each
// Messages call and records the call's usage from the response itself — JSON
// bodies and SSE streams. A stream aborted before its final usage event (an
// interviewer attempt cut at an unknown id, a guard-B restart) is recorded
// from message_start's input counts plus an output estimate (characters / 3,
// on the high side) and flagged. Without a budget it is a plain pass-through.
import { activeRunBudget, type MeterEntry } from './llm-budget';

type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

const entry = (model: string, u: Usage, outputEstimated = false, outputOverride?: number): MeterEntry => ({
  model,
  inputTokens: u.input_tokens ?? 0,
  outputTokens: outputOverride ?? u.output_tokens ?? 0,
  cacheReadTokens: u.cache_read_input_tokens ?? 0,
  cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  outputEstimated,
});

function requestModel(init?: RequestInit): string | null {
  if (typeof init?.body !== 'string') return null;
  try { return (JSON.parse(init.body) as { model?: string }).model ?? null; } catch { return null; }
}

async function meterSse(stream: ReadableStream<Uint8Array>, fallbackModel: string) {
  const budget = activeRunBudget();
  if (!budget) return;
  let model = fallbackModel, start: Usage | null = null, final: Usage | null = null, chars = 0, buf = '';
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    let ev: { type?: string; message?: { model?: string; usage?: Usage }; usage?: Usage; delta?: { text?: string; partial_json?: string; thinking?: string } };
    try { ev = JSON.parse(line.slice(5)); } catch { return; }
    if (ev.type === 'message_start') { model = ev.message?.model ?? model; start = ev.message?.usage ?? null; }
    else if (ev.type === 'message_delta' && ev.usage) final = { ...start, ...ev.usage };
    else if (ev.type === 'content_block_delta') chars += (ev.delta?.text ?? ev.delta?.partial_json ?? ev.delta?.thinking ?? '').length;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      lines.forEach(take);
    }
    take(buf);
  } catch { /* aborted: record what arrived */ } finally {
    // (assigned in take(); TypeScript can't see through the closure)
    const done = final as Usage | null, begun = start as Usage | null;
    if (done) budget.record(entry(model, done));
    else if (begun) budget.record(entry(model, begun, true, Math.max(begun.output_tokens ?? 0, Math.ceil(chars / 3))));
  }
}

export function meteredFetch(base: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const budget = activeRunBudget();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const model = /\/v1\/messages(\?|$)/.test(url) ? requestModel(init) : null;
    if (!budget || !model) return base(input, init);
    budget.check(model);
    const res = await base(input, init);
    if (!res.ok || !res.body) return res;
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const [toCaller, toMeter] = res.body.tee();
      void meterSse(toMeter, model);
      return new Response(toCaller, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    const json = await res.clone().json().catch(() => null) as { model?: string; usage?: Usage } | null;
    if (json?.usage) budget.record(entry(json.model ?? model, json.usage));
    return res;
  }) as typeof fetch;
}
