import { timeToMinutes, OPERATING_HOURS, SLOT_MINUTES } from './time.util';

/** Pixel height per SLOT_MINUTES (30 min) — big enough to fit 3 lines of text */
export const CELL_HEIGHT_PX = 48;

/** Pixel width per day column */
export const DAY_WIDTH_PX = 180;

/** Pixel width of the time axis column */
export const TIME_AXIS_WIDTH_PX = 72;

/** Total number of 30-min slots between operating hours */
export function getSlotCount(): number {
  const startMin = timeToMinutes(OPERATING_HOURS.start);
  const endMin = timeToMinutes(OPERATING_HOURS.end);
  return (endMin - startMin) / SLOT_MINUTES;
}

/** Total grid height in pixels */
export function getGridHeightPx(): number {
  return getSlotCount() * CELL_HEIGHT_PX;
}

const DAY_START_MIN = timeToMinutes(OPERATING_HOURS.start);

/** Convert minutes-since-midnight → Y pixel offset */
export function minutesToY(minutes: number): number {
  return ((minutes - DAY_START_MIN) / SLOT_MINUTES) * CELL_HEIGHT_PX;
}

/** Convert Y pixel offset → minutes-since-midnight (snapped to slot) */
export function yToMinutes(y: number): number {
  return DAY_START_MIN + Math.round(y / CELL_HEIGHT_PX) * SLOT_MINUTES;
}

/** Convert duration in minutes → pixel height */
export function durationToHeight(minutes: number): number {
  return (minutes / SLOT_MINUTES) * CELL_HEIGHT_PX;
}