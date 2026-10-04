/**
 * Deterministic per-subject color palette. Subjects get a stable color
 * across every view and every session — no per-render flicker.
 *
 * The palette is chosen for legibility with white text, and it visually
 * separates adjacent blocks in a dense grid (like the PM's reference
 * CET 203-206 schedules).
 */
const PALETTE = [
  '#0d47a1', // deep blue
  '#4a148c', // deep purple
  '#880e4f', // maroon/pink
  '#b71c1c', // red
  '#e65100', // orange
  '#f57f17', // amber-dark
  '#33691e', // olive green
  '#1b5e20', // forest green
  '#004d40', // teal
  '#006064', // cyan-dark
  '#37474f', // blue-grey
  '#3e2723', // brown
  '#6a1b9a', // violet
  '#283593', // indigo
  '#ad1457', // pink-dark
  '#00838f', // cyan
];

/**
 * Simple deterministic hash → palette index.
 * Same subjectId always yields the same color.
 */
export function colorForSubject(subjectId: string): string {
  if (!subjectId) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) {
    hash = (hash * 31 + subjectId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}