import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { ScheduleEntry } from '../types';

// ─────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────

const COLORS = {
  primary: '#5c1219',
  surface: '#f5f5f5',
  border: '#d4d4d4',
  text: '#1a1a1a',
  muted: '#6b6b6b',
  headerBg: '#5c1219',
  headerText: '#ffffff',
  rowAlt: '#fafafa',
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: COLORS.text,
  },

  // ── Header ──
  header: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `2 solid ${COLORS.primary}`,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 2,
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
    marginBottom: 10,
  },
  dayTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    backgroundColor: COLORS.surface,
    padding: '4 6',
    marginBottom: 4,
  },
  emptyDay: {
    fontSize: 8,
    color: COLORS.muted,
    fontStyle: 'italic',
    paddingLeft: 6,
    marginBottom: 4,
  },

  // ── Table ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.headerBg,
    color: COLORS.headerText,
    padding: '3 4',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '3 4',
    borderBottom: `0.5 solid ${COLORS.border}`,
  },
  tableRowAlt: {
    flexDirection: 'row',
    padding: '3 4',
    backgroundColor: COLORS.rowAlt,
    borderBottom: `0.5 solid ${COLORS.border}`,
  },

  // Column widths — sum to 100
  colTime: { width: '12%' },
  colCode: { width: '12%' },
  colTitle: { width: '26%' },
  colSection: { width: '12%' },
  colFaculty: { width: '22%' },
  colRoom: { width: '8%' },
  colType: { width: '8%' },

  // ── Footer / signatures ──
  signatures: {
    marginTop: 20,
    paddingTop: 12,
    borderTop: `1 solid ${COLORS.border}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 20,
  },
  signatureLine: {
    borderTop: `0.5 solid ${COLORS.text}`,
    paddingTop: 2,
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

  // ── Page footer ──
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

  // ── Legend ──
  legend: {
    fontSize: 7,
    color: COLORS.muted,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

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

export interface SchedulePdfProps {
  entries: ScheduleEntry[];
  title: string;
  subtitle?: string;
  termLabel: string;
  generatedBy?: string;
  scopeLabel?: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function timeLabel(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, '0')} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function facultyShort(name: string): string {
  // "Juan Dela Cruz" → "J. Dela Cruz"
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function SchedulePdfDocument({
  entries,
  title,
  subtitle,
  termLabel,
  generatedBy = 'CoE-NNECT',
  scopeLabel,
}: SchedulePdfProps) {
  // Group entries by day
  const byDay = DAY_ORDER.map((day) => ({
    day,
    label: DAY_LABELS[day],
    entries: entries
      .filter((e) => e.day === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.entries.length > 0);

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
      subject="College of Engineering Timetable"
      creator="CoE-NNECT"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* ── Header ── */}
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

        {/* ── Day sections ── */}
        {byDay.length === 0 ? (
          <Text style={styles.emptyDay}>
            No scheduled entries for this view.
          </Text>
        ) : (
          byDay.map(({ day, label, entries: dayEntries }) => (
            <View key={day} style={styles.daySection} wrap={false}>
              <Text style={styles.dayTitle}>{label}</Text>

              <View style={styles.tableHeader}>
                <Text style={styles.colTime}>Time</Text>
                <Text style={styles.colCode}>Code</Text>
                <Text style={styles.colTitle}>Subject</Text>
                <Text style={styles.colSection}>Section</Text>
                <Text style={styles.colFaculty}>Faculty</Text>
                <Text style={styles.colRoom}>Room</Text>
                <Text style={styles.colType}>Type</Text>
              </View>

              {dayEntries.map((e, idx) => (
                <View
                  key={e.id}
                  style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
                >
                  <Text style={styles.colTime}>
                    {timeLabel(e.startTime, e.endTime)}
                  </Text>
                  <Text style={styles.colCode}>{e.subjectCode}</Text>
                  <Text style={styles.colTitle}>
                    {e.subjectTitle || '—'}
                  </Text>
                  <Text style={styles.colSection}>{e.sectionCode || '—'}</Text>
                  <Text style={styles.colFaculty}>
                    {facultyShort(e.facultyName)}
                  </Text>
                  <Text style={styles.colRoom}>{e.roomNumber}</Text>
                  <Text style={styles.colType}>
                    {e.loadType === 'laboratory' ? 'Lab' : 'Lec'}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        {/* ── Signatures ── */}
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

        {/* ── Legend ── */}
        <Text style={styles.legend}>
          Lec = Lecture  ·  Lab = Laboratory  ·  VL = Various Lecturers
        </Text>

        {/* ── Page footer ── */}
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