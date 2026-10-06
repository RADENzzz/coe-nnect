import { pdf } from '@react-pdf/renderer';
import React from 'react';
import SchedulePdfDocument from './SchedulePdfDocument';
import type { SchedulePdfProps } from './SchedulePdfDocument';

export type { SchedulePdfProps };

function safeName(name: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe.endsWith('.pdf') ? safe : `${safe}.pdf`;
}

/**
 * Generates the PDF blob without downloading it.
 * Used by both "Export PDF" (which downloads) and "Print" (which opens it).
 */
export async function generateSchedulePdfBlob(
  props: SchedulePdfProps,
): Promise<Blob> {
  const doc = React.createElement(SchedulePdfDocument, props);
  return pdf(doc).toBlob();
}

/**
 * Returns a File instead of a Blob — required for Web Share API,
 * which only accepts File objects (not raw Blobs).
 */
export async function generateSchedulePdfFile(
  props: SchedulePdfProps,
  filename: string,
): Promise<File> {
  const blob = await generateSchedulePdfBlob(props);
  return new File([blob], safeName(filename), { type: 'application/pdf' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const safe = safeName(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSchedulePdf(
  props: SchedulePdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateSchedulePdfBlob(props);
  downloadBlob(blob, filename);
}

export async function printSchedulePdf(
  props: SchedulePdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateSchedulePdfBlob(props);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    downloadBlob(blob, filename);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}