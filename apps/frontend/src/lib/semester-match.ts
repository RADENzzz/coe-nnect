/** The catalog fields needed to resolve free text to a semester type. */
export interface SemesterLike {
  code: string;
  label: string;
  shortLabel: string;
  sortOrder: number;
}

const ALIASES: Record<string, string> = {
  first: '1st',
  second: '2nd',
  third: '3rd',
  fourth: '4th',
  summer: 'summer',
  midyear: 'summer',
  'mid year': 'summer',
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolves imported or typed semester text to a catalog type. Codes and labels
 * are checked before aliases and partial matches; ties resolve by sort order
 * so two types sharing a label are deterministic.
 */
export function matchSemesterType(
  text: string,
  types: SemesterLike[],
): SemesterLike | null {
  const needle = normalize(text);
  if (!needle) return null;

  const candidates = [...types].sort((a, b) => a.sortOrder - b.sortOrder);

  const byCode = candidates.find((type) => normalize(type.code) === needle);
  if (byCode) return byCode;

  const byShortLabel = candidates.find(
    (type) => normalize(type.shortLabel) === needle,
  );
  if (byShortLabel) return byShortLabel;

  const byLabel = candidates.find((type) => normalize(type.label) === needle);
  if (byLabel) return byLabel;

  // Aliases can be the whole value or a word inside a heading, such as
  // "Third Semester 2026-2027".
  const padded = ` ${needle} `;
  const aliasCode = Object.entries(ALIASES).find(([alias]) =>
    padded.includes(` ${alias} `),
  )?.[1];
  if (aliasCode) {
    const byAlias = candidates.find((type) => type.code === aliasCode);
    if (byAlias) return byAlias;
  }

  // Contains runs both ways: a partial value ("Third") or a longer heading
  // ("THIRD YEAR - 3RD SEMESTER") must both resolve without coercion.
  return (
    candidates.find((type) =>
      [type.code, type.shortLabel, type.label].some((value) => {
        const haystack = normalize(value);
        return haystack.includes(needle) || padded.includes(` ${haystack} `);
      }),
    ) ?? null
  );
}
