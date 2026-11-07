// The longest message a candidate can send in one turn (security audit, 6 Nov). Shared by the turn route's check
// (lib/orchestrator/turn-claim.ts) and the chat box, so it holds no server-only import.
// A typed answer runs to a few hundred characters; a long spoken one to ~1,500.
export const MAX_TURN_CHARS = 4_000;
