import { HttpException } from '@nestjs/common';

/**
 * Contract 7.2 / 7.3 — IDP error envelope.
 *
 * Nest's default exception body is `{ statusCode, message, error }`. The IDP
 * contract requires `{ error: { code, message, details?, request_id? } }`, so
 * every IDP-namespace failure is raised through this class.
 */
export type IdpErrorCode =
  | 'validation_error'
  | 'unknown_department'
  | 'unknown_subject'
  | 'unknown_section'
  | 'unknown_term'
  | 'unknown_faculty'
  | 'faculty_key_conflict'
  | 'unknown_designation'
  | 'local_edit_pending'
  | 'duplicate_key'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'internal_error';

export class IdpError extends HttpException {
  constructor(
    status: number,
    code: IdpErrorCode,
    message: string,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    const body: Record<string, unknown> = { code, message };
    if (details) body.details = details;
    if (requestId) body.request_id = requestId;

    super({ error: body }, status);
  }
}

/** Convenience factories used across the IDP module. */
export const idpErrors = {
  validation: (message: string, details?: Record<string, unknown>) =>
    new IdpError(422, 'validation_error', message, details),
  unknownDepartment: (value: unknown) =>
    new IdpError(
      422,
      'unknown_department',
      `Department code '${String(value)}' is not configured in CoE-NNECT.`,
      { field: 'department_code', value },
    ),
  unknownSubject: (value: unknown) =>
    new IdpError(
      422,
      'unknown_subject',
      `Subject code '${String(value)}' is not configured in CoE-NNECT.`,
      { field: 'subject_code', value },
    ),
  unknownSection: (value: unknown) =>
    new IdpError(
      422,
      'unknown_section',
      `Section code '${String(value)}' is not configured in CoE-NNECT.`,
      { field: 'section_code', value },
    ),
  unknownTerm: (value: unknown) =>
    new IdpError(
      422,
      'unknown_term',
      `Term code '${String(value)}' does not resolve to a CoE-NNECT term.`,
      { field: 'term_code', value },
    ),
  unknownDesignation: (value: unknown) =>
    new IdpError(
      422,
      'unknown_designation',
      `Designation id '${String(value)}' is not configured in CoE-NNECT.`,
      { field: 'designation_id', value },
    ),
  unknownFaculty: (details?: Record<string, unknown>) =>
    new IdpError(
      422,
      'unknown_faculty',
      'Faculty key does not match a CoE-NNECT faculty record.',
      details,
    ),
  facultyKeyConflict: (
    wmsuId: string | null,
    employeeId: string | null,
  ) =>
    new IdpError(
      422,
      'faculty_key_conflict',
      'wmsu_id and employee_id resolve to different CoE-NNECT faculty records.',
      { wmsu_id: wmsuId, employee_id: employeeId },
    ),
  localEditPending: (facultyId: string) =>
    new IdpError(
      409,
      'local_edit_pending',
      'A local edit is pending for this faculty. IDP must raise a change request.',
      { faculty_id: facultyId },
    ),
  duplicateKey: (key: string) =>
    new IdpError(
      409,
      'duplicate_key',
      `Idempotency key '${key}' was already processed with a different body.`,
      { key },
    ),
  unauthorized: (message: string) =>
    new IdpError(401, 'unauthorized', message),
};
