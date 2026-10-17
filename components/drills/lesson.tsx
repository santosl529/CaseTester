import ReactMarkdown from 'react-markdown';

export interface LessonContent {
  title: string;
  skill_name: string;
  idea: string;
  why: string;
  pattern: string;
  worked_example: string;
  mistakes: { tag: string; label: string; line: string }[];
  // v2 sections (null on lessons not yet moved to v2).
  why_it_works?: string | null;
  another_example?: string | null;
  tricky_cases?: string | null;
  quick_check?: { question: string; answer: string } | null;
}

// Markdown inside a lesson: paragraphs, lists, bold and code, styled to match.
function Md({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

function Section({ id, title, children, boxed }: { id: string; title: string; children: string; boxed?: boolean }) {
  return (
    <section aria-labelledby={id} className={`space-y-2${boxed ? ' rounded-lg border p-4' : ''}`}>
      <h2 id={id} className="font-medium">{title}</h2>
      <Md>{children}</Md>
    </section>
  );
}

// Everything after the idea and the pattern: the part a summary card folds away.
function Rest({ lesson }: { lesson: LessonContent }) {
  return (
    <>
      <Section id="example" title="Worked example" boxed>{lesson.worked_example}</Section>
      {lesson.another_example && <Section id="another-example" title="Another example" boxed>{lesson.another_example}</Section>}
      {lesson.tricky_cases && <Section id="tricky" title="Tricky cases">{lesson.tricky_cases}</Section>}
      <section aria-labelledby="mistakes" className="space-y-2">
        <h2 id="mistakes" className="font-medium">Common mistakes</h2>
        <ul className="space-y-2 text-sm">
          {lesson.mistakes.map(m => (
            <li key={m.tag}><span className="font-medium">{m.label[0].toUpperCase() + m.label.slice(1)}:</span> {m.line}</li>
          ))}
        </ul>
      </section>
      {lesson.quick_check && (
        <section aria-labelledby="quick-check" className="space-y-2 rounded-lg bg-muted/40 p-4">
          <h2 id="quick-check" className="font-medium">Quick check</h2>
          <Md>{lesson.quick_check.question}</Md>
          {/* Not graded: the answer is revealed on request, with no AI call. */}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium underline-offset-4 hover:underline">Show answer</summary>
            <div className="pt-2"><Md>{lesson.quick_check.answer}</Md></div>
          </details>
        </section>
      )}
    </>
  );
}

// A lesson as students see it (docs/prd-drills.md "Lessons"). Foundations
// students get the full lesson; other tracks get a summary card (the idea and
// the pattern) with "Read full lesson" to expand the rest (Matt, 2026-10-16).
// The review page renders the same component.
// `embedded` (inside another page, such as set results) titles it with an h2.
export function LessonBody({ lesson, mode = 'full', embedded = false }: { lesson: LessonContent; mode?: 'full' | 'summary'; embedded?: boolean }) {
  const Title = embedded ? 'h2' : 'h1';
  const head = (
    <>
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{lesson.skill_name} · {mode === 'summary' ? 'lesson summary' : 'short lesson'}</p>
        <Title className="text-xl font-semibold">{lesson.title}</Title>
      </header>
      <section aria-labelledby="idea" className="space-y-2">
        <h2 id="idea" className="sr-only">The idea</h2>
        <div className="rounded-lg border-l-4 border-foreground/70 bg-muted/40 p-4 text-base font-medium"><ReactMarkdown>{lesson.idea}</ReactMarkdown></div>
      </section>
    </>
  );
  if (mode === 'summary') {
    return (
      <article className="space-y-6">
        {head}
        <Section id="pattern" title="The pattern">{lesson.pattern}</Section>
        <details className="space-y-6">
          <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">Read full lesson</summary>
          <div className="space-y-6 pt-4">
            <Section id="why" title="Why interviewers care">{lesson.why}</Section>
            {lesson.why_it_works && <Section id="why-it-works" title="Why it works">{lesson.why_it_works}</Section>}
            <Rest lesson={lesson} />
          </div>
        </details>
      </article>
    );
  }
  return (
    <article className="space-y-6">
      {head}
      <Section id="why" title="Why interviewers care">{lesson.why}</Section>
      {lesson.why_it_works && <Section id="why-it-works" title="Why it works">{lesson.why_it_works}</Section>}
      <Section id="pattern" title="The pattern">{lesson.pattern}</Section>
      <Rest lesson={lesson} />
    </article>
  );
}

export interface IntroLessonContent {
  title: string;
  idea: string;
  sections: { heading: string; body: string; skills: string[] | null }[];
}

// "How a case interview works", the Foundations intro: the four stages of a
// case, each with the skills it uses. A skill links to its lesson when
// `skills` gives it an href; one with no lesson is marked as practiced in
// full cases.
export function IntroLessonBody({ lesson, skills }: { lesson: IntroLessonContent; skills: Record<string, { name: string; href: string | null }> }) {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Start here · short lesson</p>
        <h1 className="text-xl font-semibold">{lesson.title}</h1>
      </header>
      <div className="rounded-lg border-l-4 border-foreground/70 bg-muted/40 p-4 text-base font-medium"><ReactMarkdown>{lesson.idea}</ReactMarkdown></div>
      {lesson.sections.map((s, i) => (
        <section key={s.heading} aria-labelledby={`intro-${i}`} className={`space-y-2${s.skills ? ' rounded-lg border p-4' : ''}`}>
          <h2 id={`intro-${i}`} className="font-medium">{s.heading}</h2>
          <Md>{s.body}</Md>
          {s.skills && (
            <p className="text-sm">
              <span className="font-medium">Skills: </span>
              {s.skills.map((id, j) => (
                <span key={id}>
                  {j > 0 && ' · '}
                  {skills[id]?.href ? <a href={skills[id].href!} className="underline underline-offset-4">{skills[id].name}</a> : <>{skills[id]?.name ?? id} <span className="text-muted-foreground">(practiced in full cases)</span></>}
                </span>
              ))}
            </p>
          )}
        </section>
      ))}
    </article>
  );
}
