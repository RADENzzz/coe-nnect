import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { FacultyRequest, FacultyRequestStatus } from '../../../api/faculty-requests.api';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ApprovalsPdfProps {
  rows: FacultyRequest[];
  deptCode: (id: string) => string;
  deptName: (id: string) => string;
  termLabel: string;
}

interface GenerateOptions {
  print?: boolean;
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const COLORS = {
  primary: '#5c1219',
  border: '#d4d4d4',
  text: '#1a1a1a',
  muted: '#6b6b6b',
  headerBg: '#5c1219',
  headerText: '#ffffff',
  rowAlt: '#fafafa',
};

const STATUS_COLORS: Record<
  FacultyRequestStatus,
  { bg: string; text: string }
> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  approved: { bg: '#d1fae5', text: '#065f46' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  cancelled: { bg: '#f1f5f9', text: '#475569' },
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: COLORS.text,
  },
  header: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `2 solid ${COLORS.primary}`,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.primary,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 1,
  },
  headerMeta: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    marginTop: 2,
  },
  summaryBox: {
    flex: 1,
    border: `0.7 solid ${COLORS.border}`,
    padding: '5 6',
  },
  summaryLabel: {
    fontSize: 7,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.headerBg,
    color: COLORS.headerText,
    padding: '4 5',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '4 5',
    borderBottom: `0.5 solid ${COLORS.border}`,
  },
  tableRowAlt: {
    flexDirection: 'row',
    padding: '4 5',
    backgroundColor: COLORS.rowAlt,
    borderBottom: `0.5 solid ${COLORS.border}`,
  },
  // Column widths — sum to 100
  colId:      { width: '7%' },
  colReq:     { width: '10%' },
  colTgt:     { width: '10%' },
  colFaculty: { width: '11%' },
  colSubject: { width: '9%' },
  colReason:  { width: '23%' },
  colStatus:  { width: '11%' },
  colRemarks: { width: '12%' },
  colDates:   { width: '7%' },
  signatureBlock: {
    marginTop: 20,
    paddingTop: 12,
    borderTop: `1 solid ${COLORS.border}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureCol: { width: '45%' },
  signatureLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 20,
  },
  signatureLine: {
    borderTop: `0.5 solid ${COLORS.text}`,
    paddingTop: 2,
  },
  signatureName: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  signatureRole: {
    fontSize: 7,
    color: COLORS.muted,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 12,
    left: 24,
    right: 24,
    fontSize: 7,
    color: COLORS.muted,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${COLORS.border}`,
    paddingTop: 4,
  },
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

// ─────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────

function ApprovalsPdfDocument({
  rows,
  deptCode,
  termLabel,
}: ApprovalsPdfProps) {
  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  };

  return (
    <Document
      title="Faculty Requests Report"
      author="CoE-NNECT"
      subject="Cross-department faculty assignment requests"
      creator="CoE-NNECT"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Faculty Requests Report</Text>
          <Text style={styles.headerSubtitle}>
            Cross-department faculty assignment requests
          </Text>
          <Text style={styles.headerSubtitle}>
            Western Mindanao State University — College of Engineering
          </Text>
          <Text style={styles.headerMeta}>Term: {termLabel}</Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{counts.total}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={[styles.summaryValue, { color: '#92400e' }]}>
              {counts.pending}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Approved</Text>
            <Text style={[styles.summaryValue, { color: '#065f46' }]}>
              {counts.approved}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Rejected</Text>
            <Text style={[styles.summaryValue, { color: '#991b1b' }]}>
              {counts.rejected}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Cancelled</Text>
            <Text style={[styles.summaryValue, { color: '#475569' }]}>
              {counts.cancelled}
            </Text>
          </View>
        </View>

        {/* Table */}
        {rows.length === 0 ? (
          <Text style={{ fontSize: 9, color: COLORS.muted }}>
            No faculty requests for this term.
          </Text>
        ) : (
          <>
            <View style={styles.tableHeader}>
              <Text style={styles.colId}>ID</Text>
              <Text style={styles.colReq}>Requesting</Text>
              <Text style={styles.colTgt}>Target</Text>
              <Text style={styles.colFaculty}>Faculty</Text>
              <Text style={styles.colSubject}>Subject</Text>
              <Text style={styles.colReason}>Reason</Text>
              <Text style={styles.colStatus}>Status</Text>
              <Text style={styles.colRemarks}>Response</Text>
              <Text style={styles.colDates}>Dates</Text>
            </View>

            {rows.map((r, idx) => {
              const sc = STATUS_COLORS[r.status];
              return (
                <View
                  key={r.requestId}
                  style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
                  wrap={false}
                >
                  <Text style={styles.colId}>#{r.requestId}</Text>
                  <Text style={styles.colReq}>
                    {deptCode(r.requestingDeptId)}
                  </Text>
                  <Text style={styles.colTgt}>
                    {deptCode(r.targetDeptId)}
                  </Text>
                  <Text style={styles.colFaculty}>
                    {r.facultyId ? `#${r.facultyId}` : 'any'}
                  </Text>
                  <Text style={styles.colSubject}>#{r.subjectId}</Text>
                  <Text style={styles.colReason}>
                    {r.reason || '—'}
                  </Text>
                  <View style={styles.colStatus}>
                    <Text
                      style={{
                        backgroundColor: sc.bg,
                        color: sc.text,
                        paddingHorizontal: 4,
                        paddingVertical: 1,
                        fontSize: 7,
                        fontFamily: 'Helvetica-Bold',
                        textTransform: 'uppercase',
                      }}
                    >
                      {r.status}
                    </Text>
                  </View>
                  <Text style={styles.colRemarks}>
                    {r.responseRemarks || '—'}
                  </Text>
                  <Text style={styles.colDates}>
                    {fmtDate(r.createdAt)}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        {/* Signatures */}
        <View style={styles.signatureBlock} wrap={false}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>Prepared by:</Text>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>
                Department Head / Scheduling Officer
              </Text>
              <Text style={styles.signatureRole}>
                College of Engineering
              </Text>
            </View>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLabel}>Approved by:</Text>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>College Dean</Text>
              <Text style={styles.signatureRole}>
                College of Engineering
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <Text>Generated {generatedAt} by CoE-NNECT</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export async function exportApprovalsPdf(
  props: ApprovalsPdfProps,
  filename: string,
  options: GenerateOptions = {},
): Promise<void> {
  const doc = <ApprovalsPdfDocument {...props} />;
  const blob = await pdf(doc).toBlob();

  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safeName = safe.endsWith('.pdf') ? safe : `${safe}.pdf`;

  const url = URL.createObjectURL(blob);

  if (options.print) {
    const win = window.open(url, '_blank');
    if (!win) {
      // popup blocked — fall back to download
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}