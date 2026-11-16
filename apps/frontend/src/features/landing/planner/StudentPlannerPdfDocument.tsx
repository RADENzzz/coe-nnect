import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import {
  formatTimeLabel,
  minutesToTime,
  timeToMinutes,
} from '../schedule-utils';
import {
  computePlannerLanes,
  findPlannerConflicts,
  plannerConflictLabel,
  plannerDayColumns,
  plannerSubjectLoad,
  plannerTimeRange,
  plannerTotalUnits,
  plannerUnitsLabel,
} from './planner-utils';
import type { PlannerEntry } from './types';

const PAGE_WIDTH_PT = 841.89;
const PAGE_HEIGHT_PT = 595.28;
const PAGE_PADDING = 24;
const USABLE_WIDTH_PT = PAGE_WIDTH_PT - PAGE_PADDING * 2;
const USABLE_HEIGHT_PT = PAGE_HEIGHT_PT - PAGE_PADDING * 2;

const TIME_AXIS_WIDTH = 58;
const BASE_DAY_HEADER_HEIGHT = 24;
const BASE_SLOT_HEIGHT = 17;
const SLOT_MINUTES = 30;
const GRID_BORDER = 0.8;

/**
 * Space reserved below the grid for the header, legend, conflict list, and
 * footer. Keeping this generous makes the planner fit on one landscape page.
 */
const NON_GRID_VERTICAL_PT = 175;

const COLORS = {
  primary: '#5c1219',
  border: '#d4d4d4',
  borderDark: '#9a9a9a',
  text: '#1a1a1a',
  muted: '#5c5c5c',
  surface: '#f0f0f0',
  blockText: '#ffffff',
  conflict: '#dc2626',
};

function plannerHours(entries: PlannerEntry[]): number {
  const minutes = entries.reduce((total, entry) => {
    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return total;
    return total + Math.max(0, end - start);
  }, 0);
  return Math.round((minutes / 60) * 10) / 10;
}

function compactTimeRange(start: string, end: string): string {
  const format = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'p' : 'a';
    const hour12 = hours % 12 || 12;
    return {
      text: `${hour12}:${String(minutes).padStart(2, '0')}`,
      period,
    };
  };
  const from = format(start);
  const to = format(end);
  return from.period === to.period
    ? `${from.text}–${to.text}${to.period}`
    : `${from.text}${from.period}–${to.text}${to.period}`;
}

function facultyShort(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export interface StudentPlannerPdfProps {
  entries: PlannerEntry[];
  termLabel: string;
  title?: string;
}

export default function StudentPlannerPdfDocument({
  entries,
  termLabel,
  title = 'My class schedule',
}: StudentPlannerPdfProps) {
  const days = plannerDayColumns(entries);
  const { startMinutes, endMinutes } = plannerTimeRange(entries);
  const totalSlots = Math.max(
    1,
    Math.round((endMinutes - startMinutes) / SLOT_MINUTES),
  );

  const availableGridHeight = USABLE_HEIGHT_PT - NON_GRID_VERTICAL_PT;
  const slotHeight = Math.min(
    BASE_SLOT_HEIGHT,
    Math.max(
      8,
      (availableGridHeight - BASE_DAY_HEADER_HEIGHT) / totalSlots,
    ),
  );
  const renderedGridHeight = totalSlots * slotHeight;
  const dayColumnWidth =
    (USABLE_WIDTH_PT - TIME_AXIS_WIDTH) / Math.max(1, days.length);

  const lanes = computePlannerLanes(entries);
  const conflicts = findPlannerConflicts(entries);
  const conflictIds = new Set<string>();
  for (const conflict of conflicts) {
    conflictIds.add(conflict.first.id);
    conflictIds.add(conflict.second.id);
  }

  const legend = Array.from(
    new Map(
      entries.map((entry) => [
        `${entry.subjectCode}|${entry.sectionCode}|${entry.color}`,
        {
          key: `${entry.subjectCode}|${entry.sectionCode}|${entry.color}`,
          code: entry.subjectCode,
          sectionCode: entry.sectionCode,
          units: entry.units,
          color: entry.color,
        },
      ]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  const subjectLoad = plannerSubjectLoad(entries);
  const totalUnits = plannerTotalUnits(entries);
  const subjectsWithoutUnits = subjectLoad.filter(
    (subject) => subject.units == null,
  ).length;
  const unitsBySubject = new Map(
    subjectLoad.map((subject) => [subject.key, subject.units]),
  );
  const legendItems = legend.map((item) => ({
    ...item,
    units:
      unitsBySubject.get(`${item.code}|${item.sectionCode}`) ?? item.units,
  }));

  const totalHours = plannerHours(entries);
  const subjectCount = new Set(
    entries.map((entry) => `${entry.subjectCode}|${entry.sectionCode}`),
  ).size;

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const timeLabels: { top: number; label: string }[] = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 60) {
    const top =
      ((minutes - startMinutes) / SLOT_MINUTES) * slotHeight;
    timeLabels.push({
      top:
        minutes === endMinutes
          ? Math.max(0, renderedGridHeight - 8)
          : top + 2,
      label: formatTimeLabel(minutesToTime(minutes)),
    });
  }

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
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    headerMain: { flex: 1 },
    headerTitle: {
      fontSize: 16,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.primary,
      marginBottom: 2,
    },
    headerSubtitle: { fontSize: 9, color: COLORS.text, marginBottom: 1 },
    headerMeta: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
    headerStats: {
      alignItems: 'flex-end',
      gap: 1,
    },
    headerStat: {
      fontSize: 8,
      color: COLORS.muted,
      fontFamily: 'Helvetica-Bold',
    },

    gridWrapper: {
      border: `${GRID_BORDER} solid ${COLORS.borderDark}`,
      position: 'relative',
      alignSelf: 'flex-start',
    },
    headerRowGrid: {
      flexDirection: 'row',
      height: BASE_DAY_HEADER_HEIGHT,
      backgroundColor: COLORS.surface,
      borderBottom: `1 solid ${COLORS.borderDark}`,
    },
    headerTimeCell: {
      width: TIME_AXIS_WIDTH,
      borderRight: `0.7 solid ${COLORS.borderDark}`,
    },
    headerDayCell: {
      width: dayColumnWidth,
      borderRight: `0.5 solid ${COLORS.border}`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerDayCellLast: {
      width: dayColumnWidth,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerDayText: {
      fontSize: 8.5,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.text,
    },

    body: {
      flexDirection: 'row',
      height: renderedGridHeight,
    },
    timeColumn: {
      width: TIME_AXIS_WIDTH,
      borderRight: `0.7 solid ${COLORS.borderDark}`,
      position: 'relative',
    },
    timeLabel: {
      position: 'absolute',
      right: 5,
      fontSize: 7,
      color: COLORS.muted,
      fontFamily: 'Helvetica',
    },
    daysArea: {
      flexDirection: 'row',
      position: 'relative',
    },
    dayColumn: {
      width: dayColumnWidth,
      borderRight: `0.5 solid ${COLORS.border}`,
      position: 'relative',
    },
    dayColumnLast: {
      width: dayColumnWidth,
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
      borderTop: `0.9 solid ${COLORS.borderDark}`,
    },
    zebraBand: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: '#f4f4f5',
    },

    block: {
      position: 'absolute',
      borderRadius: 1.5,
      padding: '1.5 2.5',
      overflow: 'hidden',
    },
    blockCode: {
      fontSize: 7.5,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.blockText,
      marginBottom: 0.5,
    },
    blockDetail: {
      fontSize: 6.5,
      color: COLORS.blockText,
      marginBottom: 0.5,
    },
    blockTime: {
      fontSize: 6,
      color: COLORS.blockText,
      opacity: 0.85,
    },

    legend: {
      marginTop: 7,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    legendSwatch: { width: 7, height: 7, borderRadius: 1 },
    legendText: { fontSize: 7.5, color: COLORS.text },
    legendHint: {
      fontSize: 7,
      color: COLORS.muted,
      marginLeft: 'auto',
    },

    conflicts: {
      marginTop: 6,
      paddingTop: 5,
      borderTop: `0.7 solid ${COLORS.conflict}`,
    },
    conflictsTitle: {
      fontSize: 7.5,
      fontFamily: 'Helvetica-Bold',
      color: COLORS.conflict,
      marginBottom: 2,
    },
    conflictLine: {
      fontSize: 6.8,
      color: COLORS.conflict,
      marginBottom: 1,
    },

    pageFooter: {
      position: 'absolute',
      bottom: 10,
      left: PAGE_PADDING,
      right: PAGE_PADDING,
      fontSize: 6.8,
      color: COLORS.muted,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTop: `0.5 solid ${COLORS.border}`,
      paddingTop: 3,
    },
  });

  return (
    <Document
      title={title}
      author="CoE-NNECT"
      subject="Student weekly class planner"
      creator="CoE-NNECT"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header} wrap={false}>
          <View style={styles.headerRow}>
            <View style={styles.headerMain}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSubtitle}>
                {termLabel} · Student planner
              </Text>
              <Text style={styles.headerMeta}>
                Western Mindanao State University — College of Engineering
              </Text>
            </View>
            <View style={styles.headerStats}>
              <Text style={styles.headerStat}>
                {entries.length} class block{entries.length === 1 ? '' : 's'}
              </Text>
              <Text style={styles.headerStat}>
                {totalHours} hour{totalHours === 1 ? '' : 's'} / week
              </Text>
              <Text style={styles.headerStat}>
                {subjectCount} subject{subjectCount === 1 ? '' : 's'}
              </Text>
              <Text style={styles.headerStat}>
                {totalUnits} unit{totalUnits === 1 ? '' : 's'}
                {subjectsWithoutUnits > 0 ? ' +?' : ''}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.gridWrapper,
            {
              width: TIME_AXIS_WIDTH + days.length * dayColumnWidth,
            },
          ]}
        >
          <View style={styles.headerRowGrid}>
            <View style={styles.headerTimeCell} />
            {days.map((day, index) => (
              <View
                key={day}
                style={
                  index === days.length - 1
                    ? styles.headerDayCellLast
                    : styles.headerDayCell
                }
              >
                <Text style={styles.headerDayText}>{day}</Text>
              </View>
            ))}
          </View>

          <View style={styles.body}>
            <View style={styles.timeColumn}>
              {timeLabels.map((label) => (
                <Text
                  key={`${label.label}-${label.top}`}
                  style={[styles.timeLabel, { top: label.top }]}
                >
                  {label.label}
                </Text>
              ))}
            </View>

            <View style={styles.daysArea}>
              {days.map((day, dayIndex) => {
                const dayEntries = entries.filter(
                  (entry) => entry.dayOfWeek === day,
                );
                const isLast = dayIndex === days.length - 1;
                return (
                  <View
                    key={day}
                    style={
                      isLast ? styles.dayColumnLast : styles.dayColumn
                    }
                  >
                    {Array.from({ length: totalSlots }).map((_, index) => {
                      if (index % 2 === 0) return null;
                      return (
                        <View
                          key={`zebra-${index}`}
                          style={[
                            styles.zebraBand,
                            {
                              top: index * slotHeight,
                              height: slotHeight,
                            },
                          ]}
                        />
                      );
                    })}

                    {Array.from({ length: totalSlots + 1 }).map(
                      (_, index) => {
                        if (index === 0) return null;
                        const isHour =
                          (startMinutes + index * SLOT_MINUTES) % 60 === 0;
                        return (
                          <View
                            key={`line-${index}`}
                            style={[
                              isHour ? styles.hourLine : styles.slotLine,
                              { top: index * slotHeight },
                            ]}
                          />
                        );
                      },
                    )}

                    {dayEntries.map((entry) => {
                      const info = lanes.get(entry.id);
                      const laneCount = info?.laneCount ?? 1;
                      const lane = info?.lane ?? 0;
                      const blockWidth = dayColumnWidth / laneCount;
                      const left = lane * blockWidth + 0.5;
                      const start = timeToMinutes(entry.startTime);
                      const end = timeToMinutes(entry.endTime);
                      const top =
                        ((start - startMinutes) / SLOT_MINUTES) *
                          slotHeight +
                        0.5;
                      const height =
                        ((end - start) / SLOT_MINUTES) * slotHeight - 1;
                      const conflict = conflictIds.has(entry.id);
                      const isPersonal = entry.source === 'personal';

                      return (
                        <View
                          key={entry.id}
                          style={[
                            styles.block,
                            {
                              top,
                              left,
                              width: Math.max(blockWidth - 1, 4),
                              height: Math.max(height, 4),
                              backgroundColor: entry.color,
                              border: conflict
                                ? `1.2 solid ${COLORS.conflict}`
                                : isPersonal
                                  ? '0.8 dashed #ffffff'
                                  : undefined,
                            },
                          ]}
                        >
                          <Text style={styles.blockCode}>
                            {entry.subjectCode}
                          </Text>
                          {height >= 20 && entry.sectionCode ? (
                            <Text style={styles.blockDetail}>
                              {entry.sectionCode}
                            </Text>
                          ) : null}
                          {height >= 20 ? (
                            <Text style={styles.blockDetail}>
                              {compactTimeRange(
                                entry.startTime,
                                entry.endTime,
                              )}
                            </Text>
                          ) : null}
                          {height >= 36 && entry.room ? (
                            <Text style={styles.blockDetail}>
                              {entry.room}
                            </Text>
                          ) : null}
                          {height >= 52 && entry.facultyName ? (
                            <Text style={styles.blockTime}>
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

        {legend.length > 0 && (
          <View style={styles.legend} wrap={false}>
            {legendItems.map((item) => (
              <View key={item.key} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    { backgroundColor: item.color },
                  ]}
                />
                <Text style={styles.legendText}>
                  {item.code}
                  {item.units != null
                    ? ` · ${plannerUnitsLabel(item.units)}`
                    : ''}
                </Text>
              </View>
            ))}
            <Text style={styles.legendHint}>
              Dashed blocks are personal
            </Text>
          </View>
        )}

        {conflicts.length > 0 && (
          <View style={styles.conflicts} wrap={false}>
            <Text style={styles.conflictsTitle}>
              {conflicts.length} time conflict
              {conflicts.length === 1 ? '' : 's'} to review
            </Text>
            {conflicts.slice(0, 3).map((conflict) => (
              <Text
                key={`${conflict.first.id}-${conflict.second.id}`}
                style={styles.conflictLine}
              >
                {plannerConflictLabel(conflict)}
              </Text>
            ))}
            {conflicts.length > 3 ? (
              <Text style={styles.conflictLine}>
                +{conflicts.length - 3} more in the planner
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.pageFooter} fixed>
          <Text>
            Personal copy — published schedules remain the official record.
          </Text>
          <Text>Generated {generatedAt} · CoE-NNECT</Text>
        </View>
      </Page>
    </Document>
  );
}
