import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface UsePdfDocumentResult {
  pdf: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
  progress: number;
}

const cache = new Map<string, PDFDocumentProxy>();

export function usePdfDocument(
  source: string | ArrayBuffer | null,
): UsePdfDocumentResult {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!source) {
      setPdf(null);
      setLoading(false);
      setError(null);
      setProgress(0);
      return;
    }

    const seq = ++loadSeq.current;

    if (typeof source === 'string' && cache.has(source)) {
      setPdf(cache.get(source)!);
      setLoading(false);
      setError(null);
      setProgress(100);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    const task = pdfjsLib.getDocument(
      typeof source === 'string'
        ? { url: source }
        : { data: new Uint8Array(source) },
    );

    task.onProgress = (p: { loaded: number; total: number }) => {
      if (seq !== loadSeq.current) return;
      if (p.total > 0) {
        setProgress(Math.round((p.loaded / p.total) * 100));
      }
    };

    task.promise
      .then((doc) => {
        if (seq !== loadSeq.current) {
          doc.destroy();
          return;
        }
        if (typeof source === 'string') cache.set(source, doc);
        setPdf(doc);
        setLoading(false);
        setProgress(100);
      })
      .catch((err: unknown) => {
        if (seq !== loadSeq.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      });
  }, [source]);

  return { pdf, loading, error, progress };
}