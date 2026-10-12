import { useCallback } from 'react';
import type { TextItem } from './usePdfTextLayer';

/**
 * Client-side mirror of the Python parser's extraction:
 * "give me all the text inside this rectangle".
 *
 * A text item's position is (transform[4], transform[5]) — that's its
 * baseline-left corner in PDF points. The item extends to the right by
 * `width` and upward by `height`.
 *
 * We consider an item "inside" the rect if its baseline-left is inside.
 * Same rule as pypdfium2's get_text_bounded.
 */
export function extractTextInRect(
  items: TextItem[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const bottom = Math.min(y1, y2);
  const top = Math.max(y1, y2);

  const parts: string[] = [];
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    if (x >= left && x <= right && y >= bottom && y <= top) {
      parts.push(item.str);
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** React-friendly wrapper. Stable identity across renders. */
export function useCellExtraction(items: TextItem[] | null) {
  return useCallback(
    (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ): string => {
      if (!items) return '';
      return extractTextInRect(items, x1, y1, x2, y2);
    },
    [items],
  );
}