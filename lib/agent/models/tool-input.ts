import type { ToolIdValidator } from './interface';

export type ToolUseLike = { id: string; name: string; input: unknown };
export type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

// Validate the id-bearing tool calls in one model response. Every tool_use gets
// a tool_result (the Anthropic API requires one per call to continue). A tool
// with a validator whose id doesn't resolve produces an is_error result listing
// the valid options; the caller then asks the model to correct itself. Tools
// with no validator (speak/advance_phase/end_case) always pass.
export function validateToolUses(
  toolUses: ToolUseLike[],
  idValidators: Record<string, ToolIdValidator>,
): { toolResults: ToolResultBlock[]; anyInvalid: boolean } {
  let anyInvalid = false;
  const toolResults = toolUses.map((tu): ToolResultBlock => {
    const validator = idValidators[tu.name];
    if (!validator) return { type: 'tool_result', tool_use_id: tu.id, content: 'ok' };

    const raw = extractToolId(tu.input, validator.idKey);
    const resolved = validator.resolve(raw);
    if (resolved) return { type: 'tool_result', tool_use_id: tu.id, content: `ok (${resolved})` };

    anyInvalid = true;
    const opts = validator.validOptions.length > 0 ? validator.validOptions.join(', ') : '(none available)';
    return {
      type: 'tool_result',
      tool_use_id: tu.id,
      is_error: true,
      content: `"${raw ?? ''}" is not a valid id for ${tu.name}. Valid ids: ${opts}. Call ${tu.name} again using an exact id from that list.`,
    };
  });
  return { toolResults, anyInvalid };
}

// Robustly pull an id out of a tool_use input. The model is inconsistent about
// the shape of reveal_data / show_exhibit args — a live run produced
// `{ "bean_price_change": "bean_price_change" }` (the id as the KEY) instead of
// the expected `{ "item_id": "bean_price_change" }`, which made a naive
// `input.item_id` read `undefined` and crashed the turn downstream. Recover the
// id from whatever shape the model sent.
export function extractToolId(input: unknown, primaryKey: string): string | undefined {
  if (input == null || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;

  // 1. The expected key.
  if (typeof obj[primaryKey] === 'string' && obj[primaryKey].trim()) return (obj[primaryKey] as string).trim();

  // 2. Any string value (handles `{ <id>: <id> }` and `{ id: "x" }`).
  const stringValue = Object.values(obj).find(v => typeof v === 'string' && v.trim());
  if (typeof stringValue === 'string') return stringValue.trim();

  // 3. Last resort: the first key (handles `{ <id>: true }`).
  const firstKey = Object.keys(obj)[0];
  return firstKey && firstKey.trim() ? firstKey.trim() : undefined;
}
