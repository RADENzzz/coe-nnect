import { timeToMinutes, OPERATING_HOURS } from './time.util';

// Grid dimensions (can be dynamic; keep constants for now)
export const CELL_HEIGHT_PX = 24;   // 30 min = 24px
export const DAY_WIDTH_PX = 180;    // each day column
export const TIME_AXIS_WIDTH_PX = 80;

const DAY_START_MIN = timeToMinutes(OPERATING_HOURS.start);

/**
 * Convert minutes since midnight → Y pixel offset in grid.
 */
export function minutesToY(minutes: number): number {
  return ((minutes - DAY_START_MIN) / 30) * CELL_HEIGHT_PX;
}

/**
 * Convert Y pixel offset → minutes since midnight.
 */
export function yToMinutes(y: number): number {
  return DAY_START_MIN + Math.round(y / CELL_HEIGHT_PX) * 30;
}

/**
 * Snap a Y coordinate to the nearest 30-min boundary.
 */
export function snapY(y: number): number {
  return Math.round(y / CELL_HEIGHT_PX) * CELL_HEIGHT_PX;
}

/**
 * Total grid height.
 */
export function getGridHeightPx(): number {
  const endMin = timeToMinutes(OPERATING_HOURS.end);
  return ((endMin - DAY_START_MIN) / 30) * CELL_HEIGHT_PX;
}