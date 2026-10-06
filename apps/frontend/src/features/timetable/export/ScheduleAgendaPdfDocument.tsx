    import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { ScheduleEntry } from '../types';
import { timeToMinutes } from '../utils/time.util';

const COLORS = {
  primary: '#5c1219',
  text: '#1a1a1a',
  muted: '#6b6b6b',
  border: '#d4d4d4',
  borderSubtle: '#e7e7e7',
  rowAlt: '#fafafa',
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: COLORS.text,
  },

  // ── Header ──
  header: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: `2 solid ${COLORS.primary}`,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 3,
  },
  headerSubtitle: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 1,
  },
  headerMeta: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 4,
  },

  // ── Day section ──
  daySection: {
    marginBottom: 12,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    marginBottom: 6,
    borderBottom: `1 solid ${COLORS.primary}`,
  },
  dayName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  dayCount: {
    fontSize: 8,
    color: COLORS.muted,
  },

  // ── Card ──
  card: {
    flexDirection: 'row',
    border: `0.7 solid ${COLORS.border}`,
    marginBottom: 5,
    minHeight: 44,
  },
  cardColorBar: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: '6 8',
  },

  // Row 1: time + type
  cardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTime: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.muted,
    letterSpacing: 0.3,
  },
  cardType: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.muted,
    padding: '1 4',
    border: `0.5 solid ${COLORS.border}`,
  },

  // Row 2: code · section
  cardRow2: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 1,
  },
  cardCode: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginRight: 5,
  },
  cardSection: {
    fontSize: 9,
    color: COLORS.muted,
  },

  // Row 3: title
  cardTitle: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 2,
  },

  // Row 4: meta
  cardMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  cardMetaItem: {
    fontSize: 8,
    color: COLORS.muted,
  },

  // ── Footer ──
  signatures: {
    marginTop: 18,
    paddingTop: 12,
    borderTop: `1 solid ${COLORS.border}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: { width: '45%' },
  signatureLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 22,
  },
  signatureLine: {
    borderTop: `0.5 solid ${COLORS.text}`,
    paddingTop: 3,
  },
  signatureName: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  signatureRole: {
    fontSize: 7,
    color: COLORS.muted,
  },

  pageFooter: {
    position: 'absolute',
    bottom: 12,
    left: 24,
    right: 24,
    fontSize: 7,
    color: COLORS.muted,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${COLORS.border}`,
    paddingTop: 4,
  },
});

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export interface ScheduleAgendaPdfProps {
  entries: ScheduleEntry[];
  title: string;
  subtitle?: string;
  termLabel: string;
  scopeLabel?: string;
  generatedBy?: string;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

export default function ScheduleAgendaPdfDocument({
  entries,
  title,
  subtitle,
  termLabel,
  scopeLabel,
  generatedBy = 'CoE-NNECT',
}: ScheduleAgendaPdfProps) {
  const byDay = DAY_ORDER.map((day) => ({
    day,
    label: DAY_LABELS[day],
    list: entries
      .filter((e) => e.day === day)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
  })).filter((d) => d.list.length > 0);

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Document
      title={title}
      author="CoE-NNECT"
      subject="College of Engineering Schedule (Agenda)"
      creator="CoE-NNECT"
    >
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          <Text style={styles.headerSubtitle}>
            Western Mindanao State University — College of Engineering
          </Text>
          <Text style={styles.headerMeta}>
            Term: {termLabel}
            {scopeLabel ? `  ·  Scope: ${scopeLabel}` : ''}
          </Text>
        </View>

        {/* Days */}
        {byDay.length === 0 ? (
          <Text style={{ fontSize: 9, color: COLORS.muted }}>
            No scheduled entries for this view.
          </Text>
        ) : (
          byDay.map(({ day, label, list }) => (
            <View key={day} style={styles.daySection}>
              <View style={styles.dayHeader} wrap={false}>
                <Text style={styles.dayName}>{label.toUpperCase()}</Text>
                <Text style={styles.dayCount}>
                  {list.length} {list.length === 1 ? 'class' : 'classes'}
                </Text>
              </View>

              {list.map((e) => (
                <View key={e.id} style={styles.card} wrap={false}>
                  <View
                    style={[
                      styles.cardColorBar,
                      { backgroundColor: e.color },
                    ]}
                  />
                  <View style={styles.cardBody}>
                    <View style={styles.cardRow1}>
                      <Text style={styles.cardTime}>
                        {fmtTime(e.startTime)} – {fmtTime(e.endTime)}
                      </Text>
                      <Text style={styles.cardType}>
                        {e.loadType === 'laboratory' ? 'LAB' : 'LEC'}
                      </Text>
                    </View>

                    <View style={styles.cardRow2}>
                      <Text style={styles.cardCode}>{e.subjectCode}</Text>
                      {e.sectionCode ? (
                        <Text style={styles.cardSection}>
                          · {e.sectionCode}
                        </Text>
                      ) : null}
                    </View>

                    {e.subjectTitle ? (
                      <Text style={styles.cardTitle}>{e.subjectTitle}</Text>
                    ) : null}

                    <View style={styles.cardMeta}>
                      {e.facultyName && e.facultyName !== 'VL' && (
                        <Text style={styles.cardMetaItem}>
                          {e.facultyName}
                        </Text>
                      )}
                      {e.roomNumber && e.roomNumber !== '—' && (
                        <Text style={styles.cardMetaItem}>
                          Room {e.roomNumber}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        {/* Signatures */}
        <View style={styles.signatures} wrap={false}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Prepared by:</Text>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>
                Department Head / Scheduling Officer
              </Text>
              <Text style={styles.signatureRole}>College of Engineering</Text>
            </View>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Approved by:</Text>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>College Dean</Text>
              <Text style={styles.signatureRole}>College of Engineering</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <Text>
            Generated {generatedAt} by {generatedBy}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}