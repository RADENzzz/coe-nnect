import { useQuery } from '@tanstack/react-query';
import { fetchSemesterTypes } from '../api/semesters.api';
import {
  buildSemesterOptions,
  nextSemesterCode,
} from './semester-type-options';

/** One cached source of semester labels, short labels, and display order. */
export function useSemesterTypes() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['semester-types'],
    queryFn: fetchSemesterTypes,
    staleTime: 5 * 60 * 1000,
  });

  const byCode = new Map(data.map((type) => [type.code, type]));

  return {
    types: data,
    activeTypes: buildSemesterOptions(data),
    options: (currentCode?: string | null) =>
      buildSemesterOptions(data, currentCode),
    nextAfter: (code: string) => nextSemesterCode(data, code),
    labelFor: (code: string) => byCode.get(code)?.label ?? code,
    shortLabelFor: (code: string) => byCode.get(code)?.shortLabel ?? code,
    sortOrderFor: (code: string) =>
      byCode.get(code)?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    isLoading,
  };
}
