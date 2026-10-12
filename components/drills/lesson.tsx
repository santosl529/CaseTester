import ReactMarkdown from 'react-markdown';

export interface LessonContent {
  title: string;
  skill_name: string;
  idea: string;
  why: string;
  pattern: string;
  worked_example: string;
  mistakes: { tag: string; label: string; line: string }[];
}

// Markdown inside a lesson: paragraphs, lists, bold and code, styled to match.
function Md({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

// A lesson as students see it (docs/prd-drills.md "Lessons"): the idea, why
// interviewers care, the pattern, a worked example and the common mistakes.
// The review page renders the same component.
export function LessonBody({ lesson }: { lesson: LessonContent }) {
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{lesson.skill_name} · 3-minute lesson</p>
        <h1 className="text-xl font-semibold">{lesson.title}</h1>
      </header>
      <section aria-labelledby="idea" className="space-y-2">
        <h2 id="idea" className="sr-only">The idea</h2>
        <div className="rounded-lg border-l-4 border-foreground/70 bg-muted/40 p-4 text-base font-medium"><ReactMarkdown>{lesson.idea}</ReactMarkdown></div>
      </section>
      <section aria-labelledby="why" className="space-y-2">
        <h2 id="why" className="font-medium">Why interviewers care</h2>
        <Md>{lesson.why}</Md>
      </section>
      <section aria-labelledby="pattern" className="space-y-2">
        <h2 id="pattern" className="font-medium">The pattern</h2>
        <Md>{lesson.pattern}</Md>
      </section>
      <section aria-labelledby="example" className="space-y-2 rounded-lg border p-4">
        <h2 id="example" className="font-medium">Worked example</h2>
        <Md>{lesson.worked_example}</Md>
      </section>
      <section aria-labelledby="mistakes" className="space-y-2">
        <h2 id="mistakes" className="font-medium">Common mistakes</h2>
        <ul className="space-y-2 text-sm">
          {lesson.mistakes.map(m => (
            <li key={m.tag}><span className="font-medium">{m.label[0].toUpperCase() + m.label.slice(1)}:</span> {m.line}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
