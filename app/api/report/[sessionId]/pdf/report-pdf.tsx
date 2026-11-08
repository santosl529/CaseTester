import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { evidenceQuotes, type ReportDimension } from '@/lib/scoring/report-dimensions';
import type { FeedbackItem, PlainPoint } from '@/lib/scoring/judge';
import { ratingLabel } from '@/lib/scoring/rubric';

export type ReportPdfProps = {
  caseTitle: string;
  completedAt: string;
  overallRating: string | null;
  partial?: boolean;      // Rule 18A: the candidate ended early — no overall rating
  topFix: string | null;
  topFixPlain?: PlainPoint | null;   // the top improvement in plain words (report tone, 31 Oct)
  dimensions: ReportDimension[];
  modelAnswer: { structure?: string; recommendation?: string } | null;
  turns: { role: string; text: string; clock: string; exhibitTitle?: string }[];
};

// CasePace's palette (app/brand.css) as plain values: react-pdf can't read
// CSS variables. A rating is a pill as on the report page (Matt, 7 Nov):
// Strong in Mastery green, Adequate in Sky, Needs work in Cobalt.
const INK = '#0E1424';
const MUTED = '#565B66';   // Ink at 70% on white
const RULE = '#C5C7CC';    // Ink at 25% on white
const COBALT = '#2D4BD8';
const SKY = '#DCE5FF';
const MASTERY = '#1F9D63';
const PAPER = '#F7F7F4';
const RATING_PILL: Record<string, { backgroundColor: string; color: string }> = {
  needs_work: { backgroundColor: COBALT, color: '#FFFFFF' },
  meets_bar: { backgroundColor: SKY, color: INK },
  strong: { backgroundColor: MASTERY, color: INK },
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: INK },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 8 },
  dimension: { marginBottom: 10 },
  dimensionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  dimensionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  rating: { fontSize: 9, fontFamily: 'Helvetica-Bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: RULE },
  quote: {
    fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique',
    borderLeftWidth: 1, borderLeftColor: RULE, paddingLeft: 6, marginBottom: 3,
  },
  feedbackSection: { marginTop: 4, marginBottom: 2 },
  feedbackHeading: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  feedbackPoint: { fontSize: 9.5, lineHeight: 1.35, marginBottom: 2 },
  betterResponse: {
    fontSize: 9.5, lineHeight: 1.35, backgroundColor: PAPER, borderRadius: 4,
    padding: 5, marginBottom: 3,
  },
  topFixBox: {
    backgroundColor: SKY, borderWidth: 0, borderColor: SKY,
    borderRadius: 4, padding: 8, marginBottom: 4,
  },
  bodyText: { fontSize: 10, lineHeight: 1.4 },
  turn: { marginBottom: 8 },
  turnMeta: { fontSize: 8, color: MUTED, marginBottom: 2 },
  turnText: { fontSize: 9, lineHeight: 1.4 },
  exhibitMarker: {
    fontSize: 8.5, color: COBALT, fontFamily: 'Helvetica-Oblique', marginTop: 2,
  },
});

function formatRating(rating: string | null): string {
  if (!rating) return 'unrated';
  return ratingLabel(rating);
}

// A point in plain words (report tone, 31 Oct), else the judge's point.
function PdfPoint({ item }: { item: FeedbackItem }) {
  return (
    <View style={{ marginBottom: 3 }}>
      {item.plain ? (
        <>
          <Text style={[styles.feedbackPoint, { color: MUTED }]}>{item.plain.where}</Text>
          <Text style={styles.feedbackPoint}>{item.plain.what} {item.plain.why}</Text>
          <Text style={[styles.feedbackPoint, { fontFamily: 'Helvetica-Bold' }]}>{item.plain.next}</Text>
        </>
      ) : (
        <Text style={styles.feedbackPoint}>{item.point}</Text>
      )}
      {evidenceQuotes(item).map((q, j) => (
        <Text key={j} style={styles.quote}>&ldquo;{q}&rdquo;</Text>
      ))}
    </View>
  );
}

export function ReportPdf(props: ReportPdfProps) {
  return (
    <Document title={`Interview feedback — ${props.caseTitle} | CasePace`} author="CasePace">
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>CasePace · Interview feedback</Text>
        <Text style={styles.subtitle}>
          {props.caseTitle} · {props.completedAt} · {props.partial ? 'Partial interview — no overall rating' : `Overall: ${formatRating(props.overallRating)}`}
        </Text>

        {props.topFix && (
          <View style={styles.topFixBox}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>Top improvement</Text>
            {props.topFixPlain ? (
              <>
                <Text style={[styles.bodyText, { color: MUTED }]}>{props.topFixPlain.where}</Text>
                <Text style={styles.bodyText}>{props.topFixPlain.what} {props.topFixPlain.why}</Text>
                <Text style={[styles.bodyText, { fontFamily: 'Helvetica-Bold' }]}>{props.topFixPlain.next}</Text>
              </>
            ) : <Text style={styles.bodyText}>{props.topFix}</Text>}
          </View>
        )}

        <Text style={styles.sectionTitle}>Your scores</Text>
        {props.dimensions.map(d => (
          <View key={d.key} style={styles.dimension}>
            <View style={styles.dimensionHeader} wrap={false}>
              <Text style={styles.dimensionLabel}>{d.label}</Text>
              <Text style={[styles.rating, RATING_PILL[d.rating ?? ''] ? { ...RATING_PILL[d.rating ?? ''], borderColor: RATING_PILL[d.rating ?? ''].backgroundColor } : { color: MUTED }]}>
                {formatRating(d.rating)}
              </Text>
            </View>
            {d.feedback ? (
              <>
                {d.feedback.coverageCaveat && (
                  <Text style={{ fontSize: 9, color: MUTED, fontFamily: 'Helvetica-Oblique', marginBottom: 3 }}>
                    {d.feedback.coverageCaveat}
                  </Text>
                )}
                {d.feedback.wentWell.length > 0 && (
                  <View style={styles.feedbackSection}>
                    <Text style={styles.feedbackHeading}>What went well</Text>
                    {d.feedback.wentWell.map((item, i) => <PdfPoint key={i} item={item} />)}
                  </View>
                )}
                {d.feedback.needsWork.length > 0 && (
                  <View style={styles.feedbackSection}>
                    <Text style={styles.feedbackHeading}>What needs work</Text>
                    {d.feedback.needsWork.map((item, i) => <PdfPoint key={i} item={item} />)}
                  </View>
                )}
                {d.feedback.missedOpportunities.length > 0 && (
                  <View style={styles.feedbackSection}>
                    <Text style={styles.feedbackHeading}>Missed opportunities</Text>
                    {d.feedback.missedOpportunities.map((item, i) => (
                      <View key={i}>
                        {item.plain ? (
                          <>
                            <Text style={[styles.feedbackPoint, { color: MUTED }]}>{item.plain.where}</Text>
                            <Text style={styles.feedbackPoint}>{item.plain.what} {item.plain.why}</Text>
                          </>
                        ) : (
                          <Text style={styles.feedbackPoint}>{item.moment}</Text>
                        )}
                        {item.betterResponse ? <Text style={styles.betterResponse}>{item.plain ? 'Next time, try something like' : 'A great answer'}: &ldquo;{item.betterResponse}&rdquo;</Text> : null}
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              Array.isArray(d.legacyEvidence) &&
              d.legacyEvidence.map((q, i) => (
                <Text key={i} style={styles.quote}>&ldquo;{String(q)}&rdquo;</Text>
              ))
            )}
          </View>
        ))}

        {props.modelAnswer && (
          <>
            <Text style={styles.sectionTitle}>Model answer</Text>
            {props.modelAnswer.structure && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>Structure</Text>
                <Text style={styles.bodyText}>{props.modelAnswer.structure}</Text>
              </View>
            )}
            {props.modelAnswer.recommendation && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>Recommendation</Text>
                <Text style={styles.bodyText}>{props.modelAnswer.recommendation}</Text>
              </View>
            )}
          </>
        )}

        <Text style={styles.sectionTitle} break>Full Transcript</Text>
        {props.turns.map((t, i) => (
          <View key={i} style={styles.turn}>
            <Text style={styles.turnMeta}>
              {t.role === 'candidate' ? 'Candidate' : 'Interviewer'} · {t.clock}
            </Text>
            <Text style={styles.turnText}>{t.text}</Text>
            {t.exhibitTitle && (
              <Text style={styles.exhibitMarker}>[Exhibit shown: {t.exhibitTitle}]</Text>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}
