// The filler toggle on the interview screen (item 3, 17 Oct): rendered on the
// server as on (the browser's own setting is read after hydration).
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('livekit-client', () => ({ Room: class {}, RoomEvent: {}, Track: { Kind: { Audio: 'audio' } } }));
const { VoiceRoom } = await import('@/components/voice-room');

describe('the interview screen', () => {
  it('shows one toggle for the thinking sounds, on, pressed, before the session starts', () => {
    const html = renderToStaticMarkup(createElement(VoiceRoom, { sessionId: 's1', casePrompt: null }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>Thinking sounds: <!-- -->on<\/button>|>Thinking sounds: on</);
    expect(html.match(/Thinking sounds:/g)).toHaveLength(1);
    expect(html).toMatch(/Applies from the next turn/);
  });
});

// Lorenzo, 19 Oct (c): the headphones hint is its own clear line above Start
// (the small grey one beside the state badge is gone).
describe('the headphones hint', () => {
  it('stands above Start as its own line, once', () => {
    const html = renderToStaticMarkup(createElement(VoiceRoom, { sessionId: 's1', casePrompt: null }));
    const hint = html.indexOf('Headphones work best');
    expect(hint).toBeGreaterThan(-1);
    expect(hint).toBeLessThan(html.indexOf('>Start<'));
    expect(html.match(/headphones/gi)).toHaveLength(1);
  });
});
