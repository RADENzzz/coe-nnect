import { pdf } from '@react-pdf/renderer';
import React from 'react';
import SchedulePdfDocument, { SchedulePdfProps } from './SchedulePdfDocument';

/**
 * Generates the PDF blob without downloading it.
 * Used by both "Export PDF" (which downloads) and "Print" (which opens it).
 */
export async function generateSchedulePdfBlob(
  props: SchedulePdfProps,
): Promise<Blob> {
  const doc = React.createElement(SchedulePdfDocument, props);
  // @react-pdf/renderer's pdf() returns an object with toBlob()
  const instance = pdf(doc);
  return instance.toBlob();
}

/**
 * Triggers a file download for the given blob.
 * The filename is sanitized (spaces → dashes, illegal chars removed).
 */
export function downloadBlob(blob: Blob, filename: string): void {
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
  // Give the browser a beat before revoking
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates the PDF and downloads it directly.
 */
export async function exportSchedulePdf(
  props: SchedulePdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateSchedulePdfBlob(props);
  downloadBlob(blob, filename);
}

/**
 * Generates the PDF and opens it in a new tab so the user can print it.
 * Falls back to downloading if the popup is blocked.
 */
export async function printSchedulePdf(
  props: SchedulePdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateSchedulePdfBlob(props);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked — fall back to download
    downloadBlob(blob, filename);
    return;
  }
  // Revoke after the new tab has had a chance to load
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}