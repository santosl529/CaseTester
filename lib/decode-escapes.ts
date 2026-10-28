// Literal \uXXXX in the interviewer's text. The model sometimes writes a
// double-escaped "\\u2013" in its JSON, so JSON.parse leaves the six
// characters – in the string. Decoded at the parse, before any guard
// reads the text: "–" holds the digits 2013, which the provenance check
// could read as a figure (Lorenzo, 19 Oct; batch 28 Owen 4e94b924 t12,
// batch 32 6e5a1c90 t10/t24, batch 22 27c2d0fb t6). Only a backslash, "u" and
// exactly four hex digits; anything else is left as written.

export function decodeLiteralEscapes(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// The same, applied to every string inside a parsed JSON value.
export function decodeLiteralEscapesDeep<T>(v: T): T {
  if (typeof v === 'string') return decodeLiteralEscapes(v) as T;
  if (Array.isArray(v)) return v.map(decodeLiteralEscapesDeep) as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decodeLiteralEscapesDeep(x)])) as T;
  }
  return v;
}
