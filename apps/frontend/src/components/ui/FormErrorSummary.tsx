import type { FieldError } from './form-errors';

export interface FormErrorSummaryProps {
  errors: FieldError[];
  onJump?: (field: string) => void;
}

/** One place to report every invalid field, with buttons that jump to each one. */
export default function FormErrorSummary({
  errors,
  onJump,
}: FormErrorSummaryProps) {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <h3 className="font-bold">
        Fix {errors.length} {errors.length === 1 ? 'thing' : 'things'} before
        continuing
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error, index) => (
          <li key={`${error.field}:${index}`}>
            <button
              type="button"
              onClick={() => onJump?.(error.field)}
              className="rounded text-left underline underline-offset-2 hover:text-red-950 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              {error.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
