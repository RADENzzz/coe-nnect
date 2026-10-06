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
// Layout constants (base units — scaled dynamically at render time)
// ─────────────────────────────────────────────

const BASE_TIME_AXIS_WIDTH = 62;
const BASE_DAY_COLUMN_WIDTH = 122;
const BASE_HEADER_HEIGHT = 30;
const BASE_SLOT_HEIGHT = 18; // 30-min slot
const GRID_BORDER = 0.8;

// A4 landscape page (pt) minus page padding (22pt × 2 = 44)
const PAGE_WIDTH_PT = 841.89;
const PAGE_HEIGHT_PT = 595.28;
const PAGE_PADDING = 22;
const USABLE_WIDTH_PT = PAGE_WIDTH_PT - PAGE_PADDING * 2;
const USABLE_HEIGHT_PT = PAGE_HEIGHT_PT - PAGE_PADDING * 2;

// Fixed vertical cost outside the grid: header, legend, signatures, gaps, footer
const NON_GRID_VERTICAL_PT = 210;

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

const OPERATING_START = 7 * 60;
const OPERATING_END = 19 * 60;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = (OPERATING_END - OPERATING_START) / SLOT_MINUTES;

const COLORS = {
  primary: '#5c1219',
  border: '#d4d4d4',
  borderDark: '#9a9a9a',
  text: '#1a1a1a',
  muted: '#5c5c5c',
  surface: '#f0f0f0',
  blockText: '#ffffff',
};

/**
 * Compute the scale factor so the grid + header + footer fit exactly on
 * one A4 landscape page. The grid is the only flexible block.
 */
/**
 * Compute the layout for the grid.
 *
 * Strategy:
 *   1. Always fill the full usable page width — the day columns stretch
 *      (or shrink) so that TIME_AXIS + DAYS × DAY_COLUMN === USABLE_WIDTH_PT.
 *   2. If the resulting height would overflow the page, scale everything
 *      down uniformly so it fits. This keeps the aspect ratio correct.
 */
function computeGridLayout(dayCount: number): {
  timeAxisWidth: number;
  dayColumnWidth: number;
  headerHeight: number;
  slotHeight: number;
  scale: number;
} {
  // Step 1: fit to width. Day columns absorb whatever is left after
  // reserving space for the time axis.
  const dayColumnWidth = (USABLE_WIDTH_PT - BASE_TIME_AXIS_WIDTH) / dayCount;
  const timeAxisWidth = BASE_TIME_AXIS_WIDTH;

  // Step 2: check vertical fit at the natural slot height.
  const naturalHeight = BASE_HEADER_HEIGHT + TOTAL_SLOTS * BASE_SLOT_HEIGHT;
  const availableHeight = USABLE_HEIGHT_PT - NON_GRID_VERTICAL_PT;
  const scaleH = Math.min(1, availableHeight / naturalHeight);

  // Apply scale uniformly (width is already exact; only heights shrink
  // when needed).
  return {
    timeAxisWidth,
    dayColumnWidth,
    headerHeight: BASE_HEADER_HEIGHT * scaleH,
    slotHeight: BASE_SLOT_HEIGHT * scaleH,
    scale: scaleH,
  };
}

// ─────────────────────────────────────────────
// Lane layout — same algorithm as on-screen grid
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

function facultyShort(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

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
const layout = computeGridLayout(DAYS.length);

const TIME_AXIS_WIDTH = layout.timeAxisWidth;
const DAY_COLUMN_WIDTH = layout.dayColumnWidth;
const HEADER_HEIGHT = layout.headerHeight;
const SLOT_HEIGHT = layout.slotHeight;
const GRID_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT;
const scale = layout.scale;

  const styles = StyleSheet.create({
    page: {
      padding: PAGE_PADDING,
      fontSize: 10,
      fontFamily: 'Helvetica',
      color: COLORS.text,
    },

    header: {
      marginBottom: 8,
      paddingBottom: 6,
      borderBottom: `2 solid ${COLORS.primary}`,
    },
    headerTitle: {
      fontSize: 15,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      marginBottom: 2,
    },
    headerSubtitle: { fontSize: 9, color: COLORS.text, marginBottom: 1 },
    headerMeta: { fontSize: 8, color: COLORS.muted, marginTop: 2 },

    // ── Grid frame ──
      gridWrapper: {
        border: `${GRID_BORDER} solid ${COLORS.borderDark}`,
        position: 'relative',
        // Force the frame to shrink to the sum of its columns so there's no
        // dead space on the right when the grid is scaled below 100%.
        alignSelf: 'flex-start',
      },

    // ── Day header row ──
    headerRow: {
      flexDirection: 'row',
      height: HEADER_HEIGHT,
      backgroundColor: COLORS.surface,
      borderBottom: `1 solid ${COLORS.borderDark}`,
    },
    headerTimeCell: {
      width: TIME_AXIS_WIDTH,
      borderRight: `0.7 solid ${COLORS.borderDark}`,
    },
    headerDayCell: {
      width: DAY_COLUMN_WIDTH,
      borderRight: `0.5 solid ${COLORS.border}`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerDayCellLast: {
      width: DAY_COLUMN_WIDTH,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerDayText: {
      fontSize: 9.5,
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
    dayColumnLast: {
      width: DAY_COLUMN_WIDTH,
      position: 'relative',
    },
    slotLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderTop: `0.5 solid ${COLORS.border}`,
    },
    hourLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderTop: `1 solid ${COLORS.borderDark}`,
    },

    // ── Block ──
    block: {
      position: 'absolute',
      borderRadius: 1.5,
      padding: '2 3',
      overflow: 'hidden',
    },
    blockCode: {
      fontSize: 8,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.blockText,
      marginBottom: 0.5,
    },
    blockSection: {
      fontSize: 7,
      color: COLORS.blockText,
      marginBottom: 0.5,
    },
    blockFaculty: {
      fontSize: 6.5,
      color: COLORS.blockText,
    },

    // ── Legend ──
    legend: {
      marginTop: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendSwatch: { width: 8, height: 8, borderRadius: 1 },
    legendText: { fontSize: 8, color: COLORS.text },

    // ── Signatures ──
    signatures: {
      marginTop: 10,
      paddingTop: 8,
      borderTop: `1 solid ${COLORS.border}`,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    signatureBlock: { width: '45%' },
    signatureLabel: {
      fontSize: 8.5,
      color: COLORS.muted,
      marginBottom: 20,
    },
    signatureLine: {
      borderTop: `0.7 solid ${COLORS.text}`,
      paddingTop: 3,
    },
    signatureName: {
      fontSize: 8.5,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.text,
    },
    signatureRole: { fontSize: 7.5, color: COLORS.muted },

    pageFooter: {
      position: 'absolute',
      bottom: 10,
      left: PAGE_PADDING,
      right: PAGE_PADDING,
      fontSize: 7.5,
      color: COLORS.muted,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTop: `0.5 solid ${COLORS.border}`,
      paddingTop: 4,
    },
  });

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const legendSubjects = Array.from(
    new Map(
      entries.map((e) => [
        e.subjectId,
        { code: e.subjectCode, color: e.color },
      ]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  // Hour labels every 30 minutes (on hour: bold, on half: muted)
  const timeLabels: { y: number; label: string; isHour: boolean }[] = [];
  for (let m = OPERATING_START; m <= OPERATING_END; m += SLOT_MINUTES) {
    const h = Math.floor(m / 60);
    const mins = m % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    const label = `${hh}:${String(mins).padStart(2, '0')} ${period}`;
    timeLabels.push({
      y: ((m - OPERATING_START) / SLOT_MINUTES) * SLOT_HEIGHT,
      label,
      isHour: mins === 0,
    });
  }

  return (
    <Document
      title={title}
      author="CoE-NNECT"
      subject="College of Engineering Schedule"
      creator="CoE-NNECT"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
          <Text style={styles.headerSubtitle}>
            Western Mindanao State University — College of Engineering
          </Text>
          <Text style={styles.headerMeta}>Term: {termLabel}</Text>
        </View>

        {/* ── Grid frame ── */}
        <View
  style={[
    styles.gridWrapper,
    { width: TIME_AXIS_WIDTH + DAYS.length * DAY_COLUMN_WIDTH },
  ]}
>
          {/* Day header row */}
          <View style={styles.headerRow}>
            <View style={styles.headerTimeCell} />
            {DAYS.map((day, idx) => (
              <View
                key={day}
                style={
                  idx === DAYS.length - 1
                    ? styles.headerDayCellLast
                    : styles.headerDayCell
                }
              >
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
                  style={[
                    styles.timeLabel,
                    tl.isHour ? { fontFamily: 'Helvetica-Bold' } : {},
                    { top: tl.y + 2 },
                  ]}
                >
                  {tl.label}
                </Text>
              ))}
            </View>

            {/* Day columns */}
            <View style={styles.daysArea}>
              {DAYS.map((day, dayIdx) => {
                const dayEntries = entries.filter((e) => e.day === day);
                const isLast = dayIdx === DAYS.length - 1;
                return (
                  <View
                    key={day}
                    style={isLast ? styles.dayColumnLast : styles.dayColumn}
                  >
                    {/* Horizontal slot lines */}
                    {Array.from({ length: TOTAL_SLOTS + 1 }).map((_, i) => {
                      const isHour =
                        (OPERATING_START + i * SLOT_MINUTES) % 60 === 0;
                      // Skip the very first line (frame draws it)
                      if (i === 0) return null;
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
                      // Inset by 0.5pt on each side so block doesn't cover grid line
                      const left = lane * blockWidth + 0.5;
                      const top =
                        ((timeToMinutes(entry.startTime) - OPERATING_START) /
                          SLOT_MINUTES) *
                          SLOT_HEIGHT +
                        0.5;
                      const duration =
                        timeToMinutes(entry.endTime) -
                        timeToMinutes(entry.startTime);
                      const height =
                        (duration / SLOT_MINUTES) * SLOT_HEIGHT - 1;

                      const showFaculty = height > 26 * scale;

                      return (
                        <View
                          key={entry.id}
                          style={[
                            styles.block,
                            {
                              top,
                              left,
                              width: blockWidth - 1,
                              height,
                              backgroundColor: entry.color,
                            },
                          ]}
                        >
                          <Text style={styles.blockCode} numberOfLines={2}>
                            {entry.subjectCode}
                          </Text>
                          {entry.sectionCode ? (
                            <Text
                              style={styles.blockSection}
                              numberOfLines={1}
                            >
                              {entry.sectionCode}
                            </Text>
                          ) : null}
                          {showFaculty ? (
                            <Text
                              style={styles.blockFaculty}
                              numberOfLines={1}
                            >
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
          <View style={styles.legend} wrap={false}>
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

        {/* ── Footer ── */}
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