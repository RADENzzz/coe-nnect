import { pdf } from '@react-pdf/renderer';
import React from 'react';
import ScheduleAgendaPdfDocument, {
  ScheduleAgendaPdfProps,
} from './ScheduleAgendaPdfDocument';

export async function generateScheduleAgendaPdfBlob(
  props: ScheduleAgendaPdfProps,
): Promise<Blob> {
  const doc = React.createElement(ScheduleAgendaPdfDocument, props);
  return pdf(doc).toBlob();
}

export async function generateScheduleAgendaPdfFile(
  props: ScheduleAgendaPdfProps,
  filename: string,
): Promise<File> {
  const blob = await generateScheduleAgendaPdfBlob(props);
  return new File([blob], safeName(filename), { type: 'application/pdf' });
}

function safeName(name: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe.endsWith('.pdf') ? safe : `${safe}.pdf`;
}

export function downloadBlobAsPdf(blob: Blob, filename: string): void {
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

export async function exportScheduleAgendaPdf(
  props: ScheduleAgendaPdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateScheduleAgendaPdfBlob(props);
  downloadBlobAsPdf(blob, filename);
}

export async function printScheduleAgendaPdf(
  props: ScheduleAgendaPdfProps,
  filename: string,
): Promise<void> {
  const blob = await generateScheduleAgendaPdfBlob(props);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    downloadBlobAsPdf(blob, filename);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}