/**
 * Coordinate conversion between screen (CSS pixels) and PDF points.
 *
 * PDF coordinate space: origin bottom-left, y increases upward.
 * Screen coordinate space: origin top-left, y increases downward.
 *
 * All values stored in the DB are PDF points. All values used in the
 * DOM are CSS pixels. Conversion happens only at these boundaries.
 */

export interface PageView {
  /** PDF points. [x0, y0, x1, y1] from pdfjs page.view. */
  view: [number, number, number, number];
  /** Zoom multiplier applied to the page (1.0 = 100%). */
  zoom: number;
}

export interface PdfRect {
  x_start_pt: number;
  x_end_pt: number;
  y_start_pt: number;
  y_end_pt: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** PDF x → screen x */
export function pdfXToScreen(x: number, p: PageView): number {
  return (x - p.view[0]) * p.zoom;
}

/** PDF y → screen y (flips origin) */
export function pdfYToScreen(y: number, p: PageView): number {
  return (p.view[3] - y) * p.zoom;
}

/** Screen x → PDF x */
export function screenXToPdf(x: number, p: PageView): number {
  return p.view[0] + x / p.zoom;
}

/** Screen y → PDF y (flips origin) */
export function screenYToPdf(y: number, p: PageView): number {
  return p.view[3] - y / p.zoom;
}

/** PDF rect → screen rect (top-left origin) */
export function pdfRectToScreen(rect: PdfRect, p: PageView): ScreenRect {
  const left = pdfXToScreen(rect.x_start_pt, p);
  const right = pdfXToScreen(rect.x_end_pt, p);
  const top = pdfYToScreen(rect.y_end_pt, p); // PDF y_end (higher) → screen top (lower)
  const bottom = pdfYToScreen(rect.y_start_pt, p);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

/** Screen rect (from drag) → PDF rect */
export function screenRectToPdf(rect: ScreenRect, p: PageView): PdfRect {
  const x1 = screenXToPdf(rect.left, p);
  const x2 = screenXToPdf(rect.left + rect.width, p);
  const y1 = screenYToPdf(rect.top, p); // top in screen = high y in PDF
  const y2 = screenYToPdf(rect.top + rect.height, p); // bottom = low y
  return {
    x_start_pt: Math.min(x1, x2),
    x_end_pt: Math.max(x1, x2),
    y_start_pt: Math.min(y1, y2),
    y_end_pt: Math.max(y1, y2),
  };
}

/** Normalize a drag rectangle regardless of drag direction. */
export function normalizeScreenRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ScreenRect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}