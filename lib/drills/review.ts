// Content review in the app (local development only): it writes review
// decisions into the files in the repo, which only exist on a developer's
// machine.
export const lessonReviewEnabled = () => process.env.NODE_ENV !== 'production';
export const LESSON_REVIEWER = process.env.DRILLS_REVIEWER ?? 'Matthew Santos';

// The pilot reports page (local development only, Matt 2026-10-17): it reads
// every student's data from the database the dev server points at.
export const reportsPageEnabled = () => process.env.NODE_ENV !== 'production';
