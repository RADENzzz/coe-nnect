import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { pdfjsLib };

/**
 * Read the real page count from the PDF bytes.
 *
 * The backend stores a page count at upload time, but that value is only a
 * hint: it comes from the parser service and can fall back to a default when
 * the parser is unreachable. The editor and the upload form use this helper so
 * navigation always reflects the file the browser actually opened.
 */
export async function readPdfPageCount(file: File): Promise<number | null> {
  let doc: PDFDocumentProxy | null = null;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await pdfjsLib.getDocument({ data }).promise;
    return doc.numPages;
  } catch {
    return null;
  } finally {
    if (doc) await doc.destroy();
  }
}
