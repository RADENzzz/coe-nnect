import { pdf } from '@react-pdf/renderer';
import React from 'react';
import ScheduleGridPdfDocument, {
  ScheduleGridPdfProps,
} from './ScheduleGridPdfDocument';

export async function generateScheduleGridPdfBlob(
  props: ScheduleGridPdfProps,
): Promise<Blob> {
  const doc = React.createElement(ScheduleGridPdfDocument, props);
  return pdf(doc).toBlob();
}

export function downloadBlobAsPdf(blob: Blob, filename: string): void {
  const safeName = filename
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportScheduleGridPdf(
  props: ScheduleGridPdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateScheduleGridPdfBlob(props);
  downloadBlobAsPdf(blob, filename);
}

export async function printScheduleGridPdf(
  props: ScheduleGridPdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateScheduleGridPdfBlob(props);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    downloadBlobAsPdf(blob, filename);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}