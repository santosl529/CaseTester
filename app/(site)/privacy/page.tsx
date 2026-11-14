import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, List, Section, Table } from '@/components/site/legal';
import { BRAND, PRIVACY_HREF, VOICE_POLICY_HREF } from '@/components/site/content';
import '@/components/site/type.css';

// The Privacy Policy, as Matt wrote it (11 Nov 2026).

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `What ${BRAND} collects, why, and what you control.`,
  alternates: { canonical: PRIVACY_HREF },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 11, 2026">
      <div className="t-body space-y-4 text-(--ink)/85">
        <p>CasePace helps students practice consulting case interviews. This policy explains what we collect, why, and what you control. CasePace is run by its founders and is not yet incorporated; we will update this policy when that changes.</p>
      </div>

      <Section id="collect" title="What we collect">
        <List>
          <li><strong className="font-semibold text-(--ink)">Account:</strong> your email address and club access code.</li>
          <li><strong className="font-semibold text-(--ink)">Your practice work:</strong> interview transcripts, drill answers, and the scores, feedback and progress we generate from them.</li>
          <li><strong className="font-semibold text-(--ink)">Voice audio:</strong> only during voice interviews, and only after you agree. See <a href="#voice" className="link">Voice</a> below.</li>
          <li><strong className="font-semibold text-(--ink)">Feedback you send:</strong> problem reports and grade disputes.</li>
          <li><strong className="font-semibold text-(--ink)">Basic usage data:</strong> pages visited, timestamps, device and browser type, and IP address.</li>
        </List>
        <p>We don’t collect payment details, government IDs, your GPA or your resume, and we don’t track you across other websites.</p>
      </Section>

      <Section id="use" title="How we use it">
        <p>We use your information to run your sessions, score your work, build your training plan, fix problems, and improve CasePace.</p>
        <p><strong className="font-semibold text-(--ink)">Improving our grading and cases.</strong> We review your sessions, including transcripts, answers and scores, to tune how CasePace grades and to refine our cases. Only the CasePace founders and the providers listed below handle this data.</p>
        <p>Scores are produced by AI models with automated checks. They are for practice only. They don’t predict interview outcomes and aren’t meant for anyone to screen or rank you.</p>
        <p>We don’t sell your information or use it for advertising.</p>
      </Section>

      <Section id="voice" title="Voice">
        <p>Voice is optional; every case can be taken in text. During a voice interview, your speech is converted to text in real time. We delete the audio within 30 days, and we don’t create voiceprints or use your voice to identify you. You can stop a voice session or switch to text at any time. Details are in our <Link href={VOICE_POLICY_HREF} className="link">Voice and Biometric Data Policy</Link>.</p>
      </Section>

      <Section id="conduct" title="Conduct and wellbeing">
        <p>If a session includes abusive messages or signs that you may be in distress, our system flags it. When distress is flagged, the interviewer pauses the case, shares support resources and may end the session. CasePace is a practice tool and does not provide counseling.</p>
        <p>Flagged sessions are reviewed only by the CasePace founders, are not shared with your club, and are deleted after 90 days.</p>
      </Section>

      <Section id="processors" title="Who processes your data">
        <Table
          label="Providers that process your data"
          head={['Provider', 'Role']}
          rows={[
            ['Vercel', 'Hosts the website and app'],
            ['Supabase', 'Database and sign-in'],
            ['Anthropic', 'AI that runs interviews and grades your work'],
            ['Deepgram', 'Converts your speech to text'],
            ['LiveKit', 'Carries audio during voice sessions'],
            ['Cartesia', 'Generates the interviewer’s voice (receives no audio from you)'],
          ]}
        />
        <p>These providers process your data only to run CasePace. Our AI and speech providers do not use it to train their models.</p>
        <p><strong className="font-semibold text-(--ink)">Your club.</strong> If you joined through a club, the club’s leaders can see your individual results, including your scores, feedback reports and progress. We don’t share your results with your school or any employer unless you ask us to.</p>
        <p><strong className="font-semibold text-(--ink)">Other disclosures.</strong> We may disclose information if the law requires it, or to a buyer if CasePace is sold, under this same policy.</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <List>
          <li><strong className="font-semibold text-(--ink)">Voice audio:</strong> deleted within 30 days of the session.</li>
          <li><strong className="font-semibold text-(--ink)">Transcripts, reports and drill results:</strong> kept while your account is active; deleted after 12 months of inactivity.</li>
          <li><strong className="font-semibold text-(--ink)">Sessions flagged for abuse or safety:</strong> 90 days.</li>
          <li><strong className="font-semibold text-(--ink)">After you delete your account:</strong> your data is deleted within 30 days. De-identified statistics that can’t be linked to you may remain.</li>
        </List>
      </Section>

      <Section id="choices" title="Your choices">
        <p>You can ask us at any time for a copy of your data, to correct it, or to delete your account or any single session. You can dispute a grade with <em>Report a problem</em>. We honor these requests for every user, whatever state you live in.</p>
      </Section>

      <Section id="under-18" title="Students under 18">
        <p>If you are under 18, you need a parent or guardian’s permission to use CasePace. CasePace is not for children under 13; if we learn we’ve collected their information, we delete it.</p>
      </Section>

      <Section id="security" title="Security">
        <p>Your data is encrypted in transit and at rest. Each student’s records are accessible only to that student, the CasePace founders and, for results, the student’s club leaders, and grading materials never leave our servers. If a breach affects your information, we will notify you as the law requires.</p>
      </Section>

      <Section id="contact" title="Changes and contact">
        <p>We will tell you in the app before any material change to this policy. For questions or requests, use <em>Report a problem</em> in the app.</p>
      </Section>
    </LegalPage>
  );
}
