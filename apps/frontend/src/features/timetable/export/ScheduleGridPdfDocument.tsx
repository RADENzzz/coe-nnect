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

// ─────────────────────────────────────────────
// Layout constants — tuned for A4 landscape readability
// ─────────────────────────────────────────────
//
// A4 landscape usable width with 22pt padding: ~798pt
//   TIME_AXIS (58) + 6 days × 120 = 778 → fits with margin
// Grid height: 24 slots × 16pt = 384pt → fits well under page height
//

const TIME_AXIS_WIDTH = 58;
const DAY_COLUMN_WIDTH = 120;
const HEADER_HEIGHT = 28;
const SLOT_HEIGHT = 16; // 30-minute slot

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

const OPERATING_START = 7 * 60; // 07:00
const OPERATING_END = 19 * 60; // 19:00
const SLOT_MINUTES = 30;

const TOTAL_SLOTS = (OPERATING_END - OPERATING_START) / SLOT_MINUTES;
const GRID_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT;

const COLORS = {
  primary: '#5c1219',
  border: '#d4d4d4',
  borderDark: '#9a9a9a',
  text: '#1a1a1a',
  muted: '#5c5c5c',
  surface: '#f0f0f0',
  gridBg: '#fafafa',
  blockText: '#ffffff',
};

const styles = StyleSheet.create({
  page: {
    padding: 22,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: COLORS.text,
  },

  // ── Page header ──
  header: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: `2 solid ${COLORS.primary}`,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 3,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLORS.text,
    marginBottom: 1,
  },
  headerMeta: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
  },

  // ── Grid ──
  gridWrapper: {
    position: 'relative',
    border: `0.7 solid ${COLORS.borderDark}`,
  },

  // ── Day header row ──
  headerRow: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    backgroundColor: COLORS.surface,
    borderBottom: `0.7 solid ${COLORS.borderDark}`,
  },
  headerTimeCell: {
    width: TIME_AXIS_WIDTH,
    borderRight: `0.7 solid ${COLORS.borderDark}`,
  },
  headerDayCell: {
    width: DAY_COLUMN_WIDTH,
    borderRight: `0.7 solid ${COLORS.borderDark}`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerDayText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },

  // ── Body ──
  body: {
    flexDirection: 'row',
    height: GRID_HEIGHT,
  },
  timeColumn: {
    width: TIME_AXIS_WIDTH,
    borderRight: `0.7 solid ${COLORS.borderDark}`,
    position: 'relative',
  },
  timeLabel: {
    position: 'absolute',
    right: 5,
    fontSize: 8,
    color: COLORS.muted,
    fontFamily: 'Helvetica',
  },
  daysArea: {
    flexDirection: 'row',
    position: 'relative',
  },
  dayColumn: {
    width: DAY_COLUMN_WIDTH,
    borderRight: `0.5 solid ${COLORS.border}`,
    position: 'relative',
  },
  slotLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `0.4 solid ${COLORS.border}`,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `0.7 solid ${COLORS.borderDark}`,
  },

  // ── Class block ──
  block: {
    position: 'absolute',
    borderRadius: 2,
    padding: '2 3',
    overflow: 'hidden',
  },
  blockCode: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.blockText,
    marginBottom: 0.5,
  },
  blockSection: {
    fontSize: 7.5,
    color: COLORS.blockText,
    marginBottom: 0.5,
  },
  blockFaculty: {
    fontSize: 6.8,
    color: COLORS.blockText,
  },

  // ── Legend ──
  legend: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 1.5,
  },
  legendText: {
    fontSize: 8.5,
    color: COLORS.text,
  },

  // ── Signatures ──
  signatures: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: `1 solid ${COLORS.border}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: { width: '45%' },
  signatureLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 22,
  },
  signatureLine: {
    borderTop: `0.7 solid ${COLORS.text}`,
    paddingTop: 3,
  },
  signatureName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  signatureRole: {
    fontSize: 8,
    color: COLORS.muted,
  },

  // ── Footer ──
  pageFooter: {
    position: 'absolute',
    bottom: 12,
    left: 22,
    right: 22,
    fontSize: 8,
    color: COLORS.muted,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${COLORS.border}`,
    paddingTop: 5,
  },
});

// ─────────────────────────────────────────────
// Lane layout — same algorithm as the on-screen grid
// ─────────────────────────────────────────────

interface LaneInfo {
  lane: number;
  laneCount: number;
}

function computeLanes(entries: ScheduleEntry[]): Map<string, LaneInfo> {
  const result = new Map<string, LaneInfo>();

  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day)!.push(e);
  }

  for (const dayEntries of byDay.values()) {
    const sorted = [...dayEntries].sort((a, b) => {
      const aStart = timeToMinutes(a.startTime);
      const bStart = timeToMinutes(b.startTime);
      if (aStart !== bStart) return aStart - bStart;
      const aDur = timeToMinutes(a.endTime) - aStart;
      const bDur = timeToMinutes(b.endTime) - bStart;
      return bDur - aDur;
    });

    const lanes: ScheduleEntry[][] = [];
    const laneOf = new Map<string, number>();

    for (const entry of sorted) {
      const start = timeToMinutes(entry.startTime);
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        const last = lanes[i][lanes[i].length - 1];
        const lastEnd = timeToMinutes(last.endTime);
        if (lastEnd <= start) {
          lanes[i].push(entry);
          laneOf.set(entry.id, i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([entry]);
        laneOf.set(entry.id, lanes.length - 1);
      }
    }

    for (const entry of sorted) {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);
      let overlapCount = 0;
      for (const other of sorted) {
        const oStart = timeToMinutes(other.startTime);
        const oEnd = timeToMinutes(other.endTime);
        if (oStart < end && start < oEnd) overlapCount++;
      }
      const lane = laneOf.get(entry.id) ?? 0;
      result.set(entry.id, {
        lane,
        laneCount: Math.max(overlapCount, lane + 1, 1),
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function minutesToY(minutes: number): number {
  return ((minutes - OPERATING_START) / SLOT_MINUTES) * SLOT_HEIGHT;
}

function facultyShort(name: string): string {
  // "Juan Dela Cruz" → "J. Dela Cruz"
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function subjectCodeShort(code: string): string {
  // "CPE 101" fits; longer codes are kept as-is and truncated by the block overflow
  return code;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ScheduleGridPdfProps {
  entries: ScheduleEntry[];
  title: string;
  subtitle: string;
  termLabel: string;
  generatedBy?: string;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function ScheduleGridPdfDocument({
  entries,
  title,
  subtitle,
  termLabel,
  generatedBy = 'CoE-NNECT',
}: ScheduleGridPdfProps) {
  const lanes = computeLanes(entries);

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Unique subjects for legend
  const legendSubjects = Array.from(
    new Map(
      entries.map((e) => [
        e.subjectId,
        { code: e.subjectCode, color: e.color },
      ]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  // Hour labels every hour on the hour
  const timeLabels: { y: number; label: string }[] = [];
  for (let m = OPERATING_START; m <= OPERATING_END; m += 60) {
    const h = Math.floor(m / 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    timeLabels.push({
      y: minutesToY(m),
      label: `${hh}:00 ${period}`,
    });
  }

  return (
    <Document
      title={title}
      author="CoE-NNECT"
      subject="College of Engineering Room Schedule"
      creator="CoE-NNECT"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* ── Page header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
          <Text style={styles.headerSubtitle}>
            Western Mindanao State University — College of Engineering
          </Text>
          <Text style={styles.headerMeta}>Term: {termLabel}</Text>
        </View>

        {/* ── Grid ── */}
        <View style={styles.gridWrapper}>
          {/* Day header row */}
          <View style={styles.headerRow}>
            <View style={styles.headerTimeCell} />
            {DAYS.map((day) => (
              <View key={day} style={styles.headerDayCell}>
                <Text style={styles.headerDayText}>{DAY_LABELS[day]}</Text>
              </View>
            ))}
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Time axis */}
            <View style={styles.timeColumn}>
              {timeLabels.map((tl, i) => (
                <Text
                  key={i}
                  style={[styles.timeLabel, { top: tl.y - 6 }]}
                >
                  {tl.label}
                </Text>
              ))}
            </View>

            {/* Day columns */}
            <View style={styles.daysArea}>
              {DAYS.map((day) => {
                const dayEntries = entries.filter((e) => e.day === day);
                return (
                  <View key={day} style={styles.dayColumn}>
                    {/* Horizontal slot lines */}
                    {Array.from({ length: TOTAL_SLOTS + 1 }).map((_, i) => {
                      const isHour =
                        (OPERATING_START + i * SLOT_MINUTES) % 60 === 0;
                      return (
                        <View
                          key={i}
                          style={[
                            isHour ? styles.hourLine : styles.slotLine,
                            { top: i * SLOT_HEIGHT },
                          ]}
                        />
                      );
                    })}

                    {/* Class blocks */}
                    {dayEntries.map((entry) => {
                      const info = lanes.get(entry.id);
                      const laneCount = info?.laneCount ?? 1;
                      const lane = info?.lane ?? 0;
                      const blockWidth = DAY_COLUMN_WIDTH / laneCount;
                      const left = lane * blockWidth;
                      const top = minutesToY(timeToMinutes(entry.startTime));
                      const duration =
                        timeToMinutes(entry.endTime) -
                        timeToMinutes(entry.startTime);
                      const height = (duration / SLOT_MINUTES) * SLOT_HEIGHT;

                      // Show faculty line only when the block has enough vertical room
                      const showFaculty = height > 26;

                      return (
                        <View
                          key={entry.id}
                          style={[
                            styles.block,
                            {
                              top,
                              left,
                              width: blockWidth - 1,
                              height: height - 1,
                              backgroundColor: entry.color,
                            },
                          ]}
                        >
                          <Text style={styles.blockCode}>
                            {subjectCodeShort(entry.subjectCode)}
                          </Text>
                          {entry.sectionCode ? (
                            <Text style={styles.blockSection}>
                              {entry.sectionCode}
                            </Text>
                          ) : null}
                          {showFaculty ? (
                            <Text style={styles.blockFaculty}>
                              {facultyShort(entry.facultyName)}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Legend ── */}
        {legendSubjects.length > 0 && (
          <View style={styles.legend}>
            {legendSubjects.map((s) => (
              <View key={s.code} style={styles.legendItem}>
                <View
                  style={[styles.legendSwatch, { backgroundColor: s.color }]}
                />
                <Text style={styles.legendText}>{s.code}</Text>
              </View>
            ))}
          </View>
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