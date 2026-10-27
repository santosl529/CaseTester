// Speech normalization for the arithmetic checker (Phase 1, switch
// `speechNormalization`; Lorenzo's brief of 27 Oct).
//
// Stream 3 task 6 measured the candidate-math path over the 131 recorded voice
// candidate turns in `Case Interview Runs/voice-live/` and found it blind:
// **0 claims parsed**, against 32.3 per 100 turns on the same case's typed
// turns. Nothing is wrong with the grammar — the operands and the result are
// both there — but STT hands over the disfluencies, and the commas Deepgram
// puts around them end the expression:
//
//   "So fifty eight divided by four, um, gives us around, um, sorry, uh,
//    fourteen point five."        58 / 4 = 14.5, neither verified nor flagged.
//
// So this is a text pre-pass, not a second grammar: it rewrites the four
// disfluency shapes the recordings actually contain and hands the sentence to
// the same reader the typed corpus goes through. Everything downstream — the
// bands, the self-correction pass, the reading enumerator — is untouched.
//
// The risk profile is the opposite of every other Phase 1 guard: this makes the
// engine *raise* claims on speech it used to ignore, and a claim read wrong is a
// false flag spoken at the candidate. So each transform below is bounded to a
// shape that cannot occur in written text, and the whole pass is checked to be a
// byte-for-byte no-op over the typed corpus before it is allowed anywhere near a
// preset. What it cannot read unambiguously it leaves alone, and an operand
// chain whose result is only a guess stays unparsed rather than flagged.

// ---------------------------------------------------------------------------
// 1. Disfluency runs.
//
// A filler and the commas around it, mid-sentence, between two parts of one
// chain: "four, um, gives us", "is, yes, like, thirty eight". The run collapses
// to the comma that was there when it follows a figure, and to nothing when it
// follows an operator, an equals word or a hedge — so "= 10, um, plus 0.75 ×
// 37.5 = 28.1" keeps its comma and stays two claims, exactly as the typed form
// does. A filler that opens or closes a sentence is left alone: "Sorry." is how
// a candidate marks a correction, and the self-correction pass reads it.
//
// After a figure the comma is doing work — it is what keeps "= 10, plus 0.75 ×
// 37.5 = 28.1" two claims — so there the run must carry a filler nobody writes
// (`HARD`) before it may be read through. A written "yes" or "sorry" after a
// figure is left exactly as it is: ben cc3d1581 t10's "43.3 / 31.5 is about
// 1.37, yes, 37%" keeps its sentence unchanged.
const HARD = 'um|uh|uhm|erm|hmm|mhm|you know';
const SOFT = 'i mean|sorry|yeah|yes';
const FILLER = `${HARD}|${SOFT}`;
const HAS_HARD = new RegExp(`(?<![a-z'])(?:${HARD})(?![a-z'])`, 'i');
const NUMBER_WORD = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion';
const ENDS_IN_FIGURE = new RegExp(`(?:\\d|%|\\b(?:${NUMBER_WORD}))$`, 'i');
// What the run must be followed by: the figure it is getting out of the way of,
// reached through any number of the reader's own lead-in words. "I'm sorry, I
// really don't know" and "MECE, yes, that part is fine" are not disfluencies in
// a chain — they are sentences — and a filler before a word that cannot begin an
// operand is left exactly as written.
const LEAD = "about|roughly|around|approximately|approx|nearly|almost|like|basically|ish|call it|say|maybe|equals|is|are|gives us|gives you|gives|comes to|gets you|that's|that’s|thats|which is|plus|minus|times|multiplied by|divided by|over";
const FIGURE_AHEAD = `(?:(?:${LEAD}|${FILLER})(?![a-z'])\\s*,?\\s*)*(?:\\$?\\d|(?:${NUMBER_WORD})(?![a-z']))`;
// A figure that closes its clause — the shape a *result* takes, as against a
// figure that opens a fresh calculation ("$1,660 / 64 ≈ $26", "108 times 0.96").
// Transforms 3 and 4 below only fire in front of one.
const UNIT = "%|percent|points?|pts|pp|dollars?|cents?|million|billion|thousand|bucks";
const FIGURE_THEN_END =
  // `(?![\d,.])` keeps a thousands separator out of the clause-end punctuation:
  // without it "$1,660 / 64" would read as the figure "$1" and a closing comma.
  `(?:\\$?\\d[\\d,]*(?:\\.\\d+)?(?![\\d,.])|(?:${NUMBER_WORD})(?![a-z'])(?:\\s+(?:${NUMBER_WORD}|point)(?![a-z']))*)` +
  `(?:\\s*(?:${UNIT})(?![a-z']))?\\s*(?:[.,;:!?)]|$)`;
const DISFLUENCY = new RegExp(
  `(?<=[\\w%])(?:` +
  `\\s*,\\s*(?:${FILLER})(?![a-z'])` +      // a comma, then the filler
  `|\\s+(?:${FILLER})(?![a-z'])\\s*,` +     // or the filler, then a comma
  `)(?:\\s*,?\\s*(?:${FILLER})(?![a-z']))*\\s*,?\\s*(?=${FIGURE_AHEAD})`,
  'gi',
);

function collapseDisfluencies(text: string): string {
  return text.replace(DISFLUENCY, (m: string, ...rest) => {
    const offset = rest[rest.length - 2] as number;
    if (!ENDS_IN_FIGURE.test(text.slice(0, offset))) return ' ';
    return HAS_HARD.test(m) ? ', ' : m;
  });
}

// ---------------------------------------------------------------------------
// 2. A decimal spoken with no whole part: "point seven five" is 0.75.
//
// `normalizeNumberWords` reads "fourteen point five" because its runs start on
// a digit or tens word, so a bare "point …" stays words and the figure is lost.
// Only where the reading is forced: the words before must be neither a figure
// nor a comma, so "around ten, uh, point five" — 10.5 as spoken, but a guess
// once the comma is there — is left alone rather than read as 0.5.
const DIGIT_WORD = 'zero|one|two|three|four|five|six|seven|eight|nine';
const SPOKEN_DECIMAL = new RegExp(`\\bpoint\\s+((?:${DIGIT_WORD})(?:\\s+(?:${DIGIT_WORD}))*)(?![a-z'])`, 'gi');
const BEFORE_DECIMAL = new RegExp(`(?:\\d|%|,|\\b(?:${NUMBER_WORD}))\\s*$`, 'i');
const DIGITS: Record<string, string> = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

function spokenDecimals(text: string): string {
  return text.replace(SPOKEN_DECIMAL, (m, words: string, offset: number) => {
    if (BEFORE_DECIMAL.test(text.slice(0, offset))) return m;
    return `0.${words.toLowerCase().split(/\s+/).map(w => DIGITS[w]).join('')}`;
  });
}

// ---------------------------------------------------------------------------
// 3. "something like" is the spoken "about".
//
// It is already two tokens the reader throws away ("something" is an unknown
// word, so it ends the expression; "like" is an approximate marker), which is
// why "375 divided by 4 is something like 93" raises nothing. As "about" it is
// the hedge it means, and the band widens the way any approximate result does.
// Only where it introduces the result the sentence just worked out: a figure
// that closes the clause, after an equals word. Everywhere else in the corpus it
// introduces a figure the candidate is proposing ("revise it to something like
// 10% traffic", "phase it: something like 8–10% now") or opens a fresh chain
// ("the fare drop is something like $1,660 / 64 ≈ $26"), and rewriting those
// would change text the reader already reads correctly.
const SOMETHING_LIKE = new RegExp(
  `\\b(equals|is|are|gives us|gives you|gives|comes to|gets you|that'?s|which is)\\s+something like(?![a-z'])(?=\\s*${FIGURE_THEN_END})`,
  'gi',
);

// ---------------------------------------------------------------------------
// 4. A comma between a result-introducer and the figure it introduces.
//
// Speech puts a pause where writing would not: "is, thirty eight percent",
// "around, fourteen point five", "like, 38%". The reader already allows the
// mirror image — a comma *before* the introducer ("16 divided by 18, that's
// about 1.6%") — and a comma on this side carries no more meaning. Only before a
// figure that closes the clause, so a comma before a fresh chain is kept:
// marcus 51056656 t20's "Roughly, 108 times 0.96 is about 104" is unchanged.
const INTRODUCERS = "about|roughly|around|approximately|approx|nearly|almost|like|basically|ish|equals|is|are|gives us|gives you|gives|comes to|gets you|that's|that’s|thats|which is";
const COMMA_BEFORE_FIGURE = new RegExp(`\\b(${INTRODUCERS})\\s*,\\s*(?=${FIGURE_THEN_END})`, 'gi');

// ---------------------------------------------------------------------------
export function normalizeSpeech(text: string): string {
  return spokenDecimals(collapseDisfluencies(text))
    .replace(SOMETHING_LIKE, '$1 about')
    .replace(COMMA_BEFORE_FIGURE, '$1 ');
}
