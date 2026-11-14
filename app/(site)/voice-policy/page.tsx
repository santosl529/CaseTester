import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, List, Section, Table } from '@/components/site/legal';
import { BRAND, PRIVACY_HREF, VOICE_POLICY_HREF } from '@/components/site/content';
import '@/components/site/type.css';

// The Voice and Biometric Data Policy, as Matt wrote it (12 Nov 2026). Its
// consent screen wording is for the product, not this page.

export const metadata: Metadata = {
  title: 'Voice and Biometric Data Policy',
  description: `How ${BRAND} handles voice and biometric data, and when it is destroyed.`,
  alternates: { canonical: VOICE_POLICY_HREF },
};

export default function VoicePolicyPage() {
  return (
    <LegalPage title="Voice and Biometric Data Policy" updated="November 12, 2026">
      <div className="t-body space-y-4 text-(--ink)/85">
        <p>This policy covers voice interviews on CasePace. It sits alongside our <Link href={PRIVACY_HREF} className="link">Privacy Policy</Link> and is our public retention and destruction schedule for voice and biometric data. Voice is always optional: every case can be taken in text.</p>
      </div>

      <Section id="collect" title="What we collect">
        <p>During a voice interview, we capture your spoken audio and convert it to text in real time. The text transcript is what our interviewer and grading use.</p>
      </Section>

      <Section id="never" title="What we never do">
        <List>
          <li>We don’t create voiceprints, voice templates or any other biometric identifier from your voice.</li>
          <li>We don’t use your voice to identify you, verify who you are, or tell you apart from other speakers.</li>
          <li>We don’t sell, lease, trade or otherwise profit from your voice data.</li>
          <li>We don’t disclose your voice data to anyone except the providers that process it for us, unless you consent or the law requires it.</li>
        </List>
      </Section>

      <Section id="consent" title="Consent">
        <p>Before your first voice interview, we ask for your written consent, given by checking a box and confirming. Before every voice session after that, we show a short notice and a visible recording indicator. You can withdraw consent at any time by switching to text or ending the session; we then stop capturing audio.</p>
      </Section>

      <Section id="retention" title="Retention and destruction">
        <Table
          label="When voice and biometric data is destroyed"
          head={['Data', 'Destroyed']}
          rows={[
            ['Voice audio', 'Within 30 days of the session'],
            ['Interview transcript', <>Under the schedule in our <Link key="p" href={`${PRIVACY_HREF}#retention`} className="link">Privacy Policy</Link></>],
            ['Any biometric identifier, if one were ever held', 'When its purpose is met, or 3 years after your last use of CasePace, whichever comes first'],
          ]}
        />
        <p>Deleting your account or a session also deletes its voice audio.</p>
      </Section>

      <Section id="providers" title="Our providers">
        <p>Deepgram converts your speech to text and LiveKit carries the audio. We opt out of our providers’ model-improvement programs, so your audio is not used to train their models, and we use only providers that do not create voiceprints or perform speaker identification on your audio.</p>
      </Section>

      <Section id="protection" title="Protection">
        <p>Voice data is encrypted in transit and at rest and is accessible only to the CasePace founders.</p>
      </Section>

      <Section id="contact" title="Contact">
        <p>To withdraw consent, request deletion, or ask a question, use <em>Report a problem</em> in the app.</p>
      </Section>
    </LegalPage>
  );
}
