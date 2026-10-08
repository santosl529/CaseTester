import { it, expect } from 'vitest';
import { parseClientMessage } from '@/lib/voice/protocol';

it('accepts the browser’s four messages and nothing else', () => {
  expect(parseClientMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
  expect(parseClientMessage('{"type":"audio_blocked"}')).toEqual({ type: 'audio_blocked' });
  expect(parseClientMessage('{"type":"exhibit_shown","turnSeq":3,"exhibitId":"exhibit-a"}')).toEqual({ type: 'exhibit_shown', turnSeq: 3, exhibitId: 'exhibit-a' });
  expect(parseClientMessage('{"type":"timing","turnSeq":3,"clientFirstSoundMs":812}')).toEqual({ type: 'timing', turnSeq: 3, clientFirstSoundMs: 812 });
  expect(parseClientMessage('{"type":"exhibit_shown","turnSeq":"3"}')).toBeNull();
  expect(parseClientMessage('{"type":"run_turn"}')).toBeNull();
  expect(parseClientMessage('not json')).toBeNull();
});
