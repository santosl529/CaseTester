// Lorenzo, 13 Oct (Larkspur review, item 6; Marcus 27c2d0fb t22): the
// interviewer never narrates the machinery — "The system will speak the
// lease detail." is withheld like the model's other spoken reasoning.
import { describe, it, expect } from 'vitest';
import { stripMetaLeak } from '@/lib/orchestrator/audit';

describe('process language', () => {
  it.each([
    'Right. The system will speak the lease detail.',
    'The system releases that data next.',
    "The code will share the route figures.",
    'Okay. The orchestrator handles that part.',
  ])('withheld: %s', text => {
    const r = stripMetaLeak(text);
    expect(r.strippedSentences.join(' ')).toMatch(/system|code|orchestrator/i);
    expect(r.cleaned).not.toMatch(/system|code|orchestrator/i);
  });
  it.each([
    'How would the booking system handle a fare change?',
    'Their reservation system will speak to the new routes.',
    'What would the hub system cost?',
  ])('kept — business talk: %s', text => expect(stripMetaLeak(text).strippedSentences).toEqual([]));
});
