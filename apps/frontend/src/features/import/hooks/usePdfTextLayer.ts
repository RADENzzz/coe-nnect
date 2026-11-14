import { useEffect, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface TextItem {
  str: string;
  /** PDF-space transform matrix [a, b, c, d, e, f]. e=x, f=y in PDF points. */
  transform: number[];
  width: number;
  height: number;
}

export interface TextLayerData {
  items: TextItem[];
  /**
   * True when the page has at least one non-whitespace text item.
   * False means the page is image-only (e.g. a screenshot pasted into a
   * Word doc and exported as PDF) — nothing can be extracted from it,
   * regardless of the text's color.
   */
  hasText: boolean;
  /** PDF viewBox [x0, y0, x1, y1]. Usually [0, 0, W, H]. */
  view: [number, number, number, number];
  /** PDF points (viewport width at scale 1). */
  width: number;
  /** PDF points (viewport height at scale 1). */
  height: number;
}

const cache = new Map<string, TextLayerData>();

function cacheKey(pdf: PDFDocumentProxy, pageIndex: number): string {
  const fingerprint = (pdf as any).fingerprints?.[0] ?? 'pdf';
  return `${fingerprint}::${pageIndex}`;
}

/**
 * Extract text items + page view for one PDF page. Cached in memory so the
 * editor and the import dialog share the same extraction.
 */
export async function loadPdfPageText(
  pdf: PDFDocumentProxy,
  pageIndex: number,
): Promise<TextLayerData> {
  const key = cacheKey(pdf, pageIndex);
  const cached = cache.get(key);
  if (cached) return cached;

  const page: PDFPageProxy = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();

  const items: TextItem[] = textContent.items
    .filter((it: any) => typeof it.str === 'string')
    .map((it: any) => ({
      str: it.str,
      transform: it.transform as number[],
      width: it.width ?? 0,
      height: it.height ?? 0,
    }));

  const result: TextLayerData = {
    items,
    hasText: items.some((it) => it.str.trim().length > 0),
    view: [
      viewport.viewBox[0],
      viewport.viewBox[1],
      viewport.viewBox[2],
      viewport.viewBox[3],
    ] as [number, number, number, number],
    width: viewport.viewBox[2] - viewport.viewBox[0],
    height: viewport.viewBox[3] - viewport.viewBox[1],
  };

  cache.set(key, result);
  return result;
}

/**
 * Current-page text layer for the editor canvas.
 *
 * Stale data is cleared as soon as the page changes: otherwise the canvas
 * briefly pairs the new page with the previous page's text items, and row
 * edits made in that window pin the wrong cells.
 */
export function usePdfTextLayer(
  pdf: PDFDocumentProxy | null,
  pageIndex: number,
): {
  data: TextLayerData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<TextLayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = cacheKey(pdf, pageIndex);
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setData(null);
    setLoading(true);
    setError(null);

    loadPdfPageText(pdf, pageIndex)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Text extraction failed',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex]);

  return { data, loading, error };
}