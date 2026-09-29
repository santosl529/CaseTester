import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ReportDimension } from '@/lib/scoring/report-dimensions';
import { ratingLabel } from '@/lib/scoring/rubric';

export type ReportPdfProps = {
  caseTitle: string;
  completedAt: string;
  overallRating: string | null;
  topFix: string | null;
  dimensions: ReportDimension[];
  modelAnswer: { structure?: string; recommendation?: string } | null;
  turns: { role: string; text: string; clock: string; exhibitTitle?: string }[];
};

const RATING_COLOR: Record<string, string> = {
  needs_work: '#b91c1c',
  meets_bar: '#525252',
  strong: '#15803d',
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#171717' },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#737373', marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 8 },
  dimension: { marginBottom: 10 },
  dimensionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  dimensionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  rating: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  quote: {
    fontSize: 9, color: '#525252', fontFamily: 'Helvetica-Oblique',
    borderLeftWidth: 2, borderLeftColor: '#d4d4d4', paddingLeft: 6, marginBottom: 3,
  },
  feedbackSection: { marginTop: 4, marginBottom: 2 },
  feedbackHeading: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  feedbackPoint: { fontSize: 9.5, lineHeight: 1.35, marginBottom: 2 },
  betterResponse: {
    fontSize: 9.5, lineHeight: 1.35, borderLeftWidth: 2, borderLeftColor: '#bfdbfe',
    paddingLeft: 6, marginBottom: 3,
  },
  topFixBox: {
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 4, padding: 8, marginBottom: 4,
  },
  bodyText: { fontSize: 10, lineHeight: 1.4 },
  turn: { marginBottom: 8 },
  turnMeta: { fontSize: 8, color: '#737373', marginBottom: 2 },
  turnText: { fontSize: 9, lineHeight: 1.4 },
  exhibitMarker: {
    fontSize: 8.5, color: '#1d4ed8', fontFamily: 'Helvetica-Oblique', marginTop: 2,
  },
});

function formatRating(rating: string | null): string {
  if (!rating) return 'unrated';
  return ratingLabel(rating);
}

export function ReportPdf(props: ReportPdfProps) {
  return (
    <Document title={`Interview Feedback — ${props.caseTitle}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Interview Feedback</Text>
        <Text style={styles.subtitle}>
          {props.caseTitle} · {props.completedAt} · Overall: {formatRating(props.overallRating)}
        </Text>

        {props.topFix && (
          <View style={styles.topFixBox}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>Top improvement</Text>
            <Text style={styles.bodyText}>{props.topFix}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Rubric Scores</Text>
        {props.dimensions.map(d => (
          <View key={d.key} style={styles.dimension}>
            <View style={styles.dimensionHeader} wrap={false}>
              <Text style={styles.dimensionLabel}>{d.label}</Text>
              <Text style={[styles.rating, { color: RATING_COLOR[d.rating ?? ''] ?? '#525252' }]}>
                {formatRating(d.rating)}
              </Text>
            </View>
            {d.feedback ? (
              <>
                {d.feedback.coverageCaveat && (
                  <Text style={{ fontSize: 9, color: '#737373', fontFamily: 'Helvetica-Oblique', marginBottom: 3 }}>
                    {d.feedback.coverageCaveat}
                  </Text>
                )}
                {d.feedback.wentWell.length > 0 && (
                  <View style={styles.feedbackSection}>
                    <Text style={[styles.feedbackHeading, { color: '#15803d' }]}>What went well</Text>
                    {d.feedback.wentWell.map((item, i) => (
                      <View key={i}>
                        <Text style={styles.feedbackPoint}>{item.point}</Text>
                        {item.quotes.map((q, j) => (
                          <Text key={j} style={styles.quote}>&ldquo;{q}&rdquo;</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
                {d.feedback.needsWork.length > 0 && (
                  <View style={styles.feedbackSection}>
                    <Text style={[styles.feedbackHeading, { color: '#b45309' }]}>What needs work</Text>
                    {d.feedback.needsWork.map((item, i) => (
                      <View key={i}>
                        <Text style={styles.feedbackPoint}>{item.point}</Text>
                        {item.quotes.map((q, j) => (
                          <Text key={j} style={styles.quote}>&ldquo;{q}&rdquo;</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
                {d.feedback.missedOpportunities.length > 0 && (
                  <View style={styles.feedbackSection}>
                    <Text style={[styles.feedbackHeading, { color: '#1d4ed8' }]}>Missed opportunities</Text>
                    {d.feedback.missedOpportunities.map((item, i) => (
                      <View key={i}>
                        <Text style={styles.feedbackPoint}>{item.moment}</Text>
                        <Text style={styles.betterResponse}>A great answer: &ldquo;{item.betterResponse}&rdquo;</Text>
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
            <Text style={styles.sectionTitle}>Model Answer</Text>
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
