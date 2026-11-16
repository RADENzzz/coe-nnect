import { pdf } from '@react-pdf/renderer';
import React from 'react';

import { pdfjsLib } from '@/lib/pdf';

import StudentPlannerPdfDocument from './StudentPlannerPdfDocument';
import type { StudentPlannerPdfProps } from './StudentPlannerPdfDocument';

export type { StudentPlannerPdfProps };

function safeBaseName(name: string): string {
  const withoutExtension = name.replace(/\.(pdf|png)$/i, '');
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'student-planner';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateStudentPlannerPdfBlob(
  props: StudentPlannerPdfProps,
): Promise<Blob> {
  const documentElement = React.createElement(
    StudentPlannerPdfDocument,
    props,
  );
  return pdf(documentElement).toBlob();
}

export async function downloadStudentPlannerPdf(
  props: StudentPlannerPdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateStudentPlannerPdfBlob(props);
  downloadBlob(blob, `${safeBaseName(filename)}.pdf`);
}

/**
 * Rasterize the generated planner PDF into a high-resolution PNG.
 *
 * The PDF layout is designed for a single landscape page, so the first page is
 * the whole planner. A white background is painted first because canvas
 * exports are transparent by default.
 */
export async function downloadStudentPlannerPng(
  props: StudentPlannerPdfProps,
  filename: string,
  scale = 2.5,
): Promise<void> {
  const pdfBlob = await generateStudentPlannerPdfBlob(props);
  const data = new Uint8Array(await pdfBlob.arrayBuffer());
  const documentProxy = await pdfjsLib.getDocument({ data }).promise;

  try {
    const page = await documentProxy.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('PNG export is not supported in this browser.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Could not create the PNG image.'));
      }, 'image/png');
    });

    downloadBlob(pngBlob, `${safeBaseName(filename)}.png`);
  } finally {
    await documentProxy.destroy();
  }
}
