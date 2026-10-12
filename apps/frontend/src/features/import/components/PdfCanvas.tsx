import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Icon from '@/components/ui/Icon';

interface PdfCanvasProps {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  zoom?: number;
  onRendered?: (dims: { width: number; height: number }) => void;
}

export default function PdfCanvas({
  pdf,
  pageIndex,
  zoom = 1.0,
  onRendered,
}: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!pdf || !canvasRef.current) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* ignore */
        }
        renderTaskRef.current = null;
      }

      setRendering(true);
      setError(null);

      try {
        const page = await pdf.getPage(pageIndex + 1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get 2D context');

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;

        await task.promise;
        if (cancelled) return;

        setRendering(false);
        onRendered?.({ width: viewport.width, height: viewport.height });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.name === 'RenderingCancelledException'
        ) {
          return;
        }
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Render failed');
        setRendering(false);
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageIndex, zoom, onRendered]);

  return (
    <div className="relative inline-block shadow-lg bg-white">
      <canvas ref={canvasRef} className="block" />

      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Icon
              name="progress_activity"
              size={18}
              className="animate-spin"
            />
            Rendering page {pageIndex + 1}…
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50/90 text-red-700 text-sm px-4 text-center">
          {error}
        </div>
      )}
    </div>
  );
}