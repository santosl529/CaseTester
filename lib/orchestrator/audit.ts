export type AuditResult = {
  passed: boolean;
  unexplainedNumbers: string[];
};

function extractNumbers(text: string): string[] {
  // Extract digit sequences (strips commas for comparison).
  // Use a lookahead/lookbehind-free approach: match digits possibly prefixed by
  // currency symbols or other non-digit chars. The regex \b doesn't work well
  // with $480M because $ is not a word char, so we match digits anywhere and
  // strip surrounding non-numeric noise.
  const matches = text.matchAll(/\d[\d,]*\.?\d*/g);
  return [...matches].map(m => m[0].replace(/,/g, ''));
}

export function auditTurn(
  spokenText: string,
  revealed: Record<string, string>,
): AuditResult {
  const spoken = extractNumbers(spokenText);
  const allowed = new Set(Object.values(revealed).flatMap(v => extractNumbers(v)));
  const unexplained = spoken.filter(n => !allowed.has(n));
  return { passed: unexplained.length === 0, unexplainedNumbers: unexplained };
}
