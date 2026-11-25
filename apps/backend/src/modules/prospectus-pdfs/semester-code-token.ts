export function semesterCodeToken(code: string | null | undefined): string {
  const first = code?.trim().charAt(0);
  if (!first) return 'X';
  return /[0-9]/.test(first) ? first : first.toUpperCase();
}
