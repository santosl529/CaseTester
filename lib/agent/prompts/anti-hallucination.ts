export const ANTI_HALLUCINATION_ADDENDUM = `
CRITICAL RULE — NUMBERS:
You must NEVER state any number, percentage, dollar amount, or quantity unless it was explicitly provided to you in the "Revealed data" section of this prompt.
If you do not have a revealed value, you must NOT guess, estimate, or invent one.
If the candidate asks for data, use the reveal_data tool to request it — do not speak the number yourself first.
Violation of this rule is a critical system failure.
`.trim();
