export interface FieldError {
  field: string;
  message: string;
}

/** Set or replace the error for one field, preserving the order of other errors. */
export function mergeFieldError(
  errors: FieldError[],
  field: string,
  message: string,
): FieldError[] {
  if (errors.some((error) => error.field === field)) {
    return errors.map((error) =>
      error.field === field ? { ...error, message } : error,
    );
  }
  return [...errors, { field, message }];
}

/** Remove the error for one field without touching the supplied array. */
export function clearFieldError(
  errors: FieldError[],
  field: string,
): FieldError[] {
  return errors.filter((error) => error.field !== field);
}
