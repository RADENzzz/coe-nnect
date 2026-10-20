import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

interface SearchContext {
  userId: string;
  role: 'administrator' | 'college_dean' | 'department_head';
  deptId?: string | null;
}

export type SearchResultType =
  | 'subject'
  | 'faculty'
  | 'room'
  | 'section'
  | 'user'
  | 'term';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel?: string;
  meta?: Record<string, string>;
  path: string;
}

const TYPE_ORDER: Record<SearchResultType, number> = {
  subject: 0,
  faculty: 1,
  room: 2,
  section: 3,
  user: 4,
  term: 5,
};

@Injectable()
export class SearchService {
  constructor(private readonly supabase: SupabaseService) {}

  async search(
    q: string,
    user: SearchContext,
    limit = 20,
  ): Promise<{ query: string; results: SearchResult[] }> {
    const query = (q ?? '').trim();

    // Two characters is enough for codes such as CS, IT, and BA.
    if (query.length < 2) {
      return { query, results: [] };
    }

    // PostgREST's `or` filter uses commas and parentheses as syntax. Strip
    // those (and SQL wildcard characters) before interpolating user input.
    const safeQuery = this.toSearchTerm(query);
    if (!safeQuery) {
      return { query, results: [] };
    }

    const perType = Math.max(4, Math.ceil(limit / 4));
    const scopedDept =
      user.role === 'department_head' && user.deptId
        ? String(user.deptId)
        : null;
    const isAdminOrDean =
      user.role === 'administrator' || user.role === 'college_dean';

    const [subjects, faculty, rooms, sections, users, terms] =
      await Promise.all([
        this.searchSubjects(safeQuery, perType, scopedDept),
        this.searchFaculty(safeQuery, perType, scopedDept),
        this.searchRooms(safeQuery, perType, scopedDept),
        this.searchSections(safeQuery, perType, scopedDept),
        isAdminOrDean
          ? this.searchUsers(safeQuery, perType)
          : Promise.resolve([] as SearchResult[]),
        isAdminOrDean
          ? this.searchTerms(safeQuery, perType)
          : Promise.resolve([] as SearchResult[]),
      ]);

    const ranked = [
      ...subjects,
      ...faculty,
      ...rooms,
      ...sections,
      ...users,
      ...terms,
    ]
      .map((result) => ({
        result,
        rank: this.rank(result, query),
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const typeDiff =
          TYPE_ORDER[a.result.type] - TYPE_ORDER[b.result.type];
        if (typeDiff !== 0) return typeDiff;
        return a.result.label.localeCompare(b.result.label);
      })
      .slice(0, limit)
      .map((entry) => entry.result);

    return { query, results: ranked };
  }

  private toSearchTerm(query: string): string {
    return query
      .replace(/[(),%_"\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private rank(result: SearchResult, query: string): number {
    const q = query.toLowerCase();
    const label = result.label.toLowerCase();

    if (label === q) return 0;
    if (label.startsWith(q)) return 1;
    if (label.split(/[\s-]+/).some((part) => part.startsWith(q))) return 2;
    if (label.includes(q)) return 3;

    const sublabel = (result.sublabel ?? '').toLowerCase();
    if (sublabel.startsWith(q)) return 4;
    if (sublabel.includes(q)) return 5;
    return 6;
  }

  // Subjects
  private async searchSubjects(
    q: string,
    limit: number,
    deptId: string | null,
  ): Promise<SearchResult[]> {
    const db = this.supabase.getAdminClient();
    let query = db
      .from('subject')
      .select('subject_id, subject_code, title, dept_id')
      .eq('is_active', true)
      .or(`subject_code.ilike.%${q}%,title.ilike.%${q}%`)
      .order('subject_code', { ascending: true })
      .limit(limit);

    if (deptId) query = query.eq('dept_id', deptId);

    const { data, error } = await query;
    if (error) return [];

    return (data ?? []).map((row) => ({
      type: 'subject',
      id: String(row.subject_id),
      label: row.subject_code,
      sublabel: row.title,
      path: `/subjects?q=${encodeURIComponent(row.subject_code)}`,
    }));
  }

  // Faculty
  private async searchFaculty(
    q: string,
    limit: number,
    deptId: string | null,
  ): Promise<SearchResult[]> {
    const db = this.supabase.getAdminClient();
    let query = db
      .from('faculty')
      .select(
        'faculty_id, first_name, last_name, employee_id, wmsu_id, dept_id',
      )
      .eq('is_active', true)
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,employee_id.ilike.%${q}%,wmsu_id.ilike.%${q}%`,
      )
      .order('last_name', { ascending: true })
      .limit(limit);

    if (deptId) query = query.eq('dept_id', deptId);

    const { data, error } = await query;
    if (error) return [];

    return (data ?? []).map((row) => {
      const name = `${row.first_name} ${row.last_name}`.trim();
      return {
        type: 'faculty',
        id: String(row.faculty_id),
        label: name,
        sublabel: row.employee_id ?? row.wmsu_id ?? undefined,
        path: `/faculty?q=${encodeURIComponent(name)}`,
      };
    });
  }

  // Rooms
  private async searchRooms(
    q: string,
    limit: number,
    deptId: string | null,
  ): Promise<SearchResult[]> {
    const db = this.supabase.getAdminClient();
    let query = db
      .from('room')
      .select('room_id, room_number, building, room_type, dept_id')
      .eq('is_active', true)
      .or(
        `room_number.ilike.%${q}%,building.ilike.%${q}%,room_type.ilike.%${q}%`,
      )
      .order('room_number', { ascending: true })
      .limit(limit);

    if (deptId) query = query.or(`dept_id.eq.${deptId},dept_id.is.null`);

    const { data, error } = await query;
    if (error) return [];

    return (data ?? []).map((row) => ({
      type: 'room',
      id: String(row.room_id),
      label: row.room_number,
      sublabel: [row.building, row.room_type].filter(Boolean).join(' - '),
      path: `/rooms?q=${encodeURIComponent(row.room_number)}`,
    }));
  }

  // Sections
  //
  // We cannot filter a joined program through PostgREST without changing the
  // response shape, so department heads over-fetch and trim client-side.
  private async searchSections(
    q: string,
    limit: number,
    deptId: string | null,
  ): Promise<SearchResult[]> {
    const db = this.supabase.getAdminClient();
    const fetchLimit = deptId ? limit * 3 : limit;

    const { data, error } = await db
      .from('section')
      .select(
        'section_id, section_code, year_level, program_id, program:program_id(program_code, dept_id)',
      )
      .eq('is_active', true)
      .ilike('section_code', `%${q}%`)
      .order('section_code', { ascending: true })
      .limit(fetchLimit);

    if (error) return [];

    let rows = (data ?? []) as any[];

    if (deptId) {
      rows = rows.filter(
        (row) =>
          row.program?.dept_id != null &&
          String(row.program.dept_id) === deptId,
      );
    }

    return rows.slice(0, limit).map((row: any) => ({
      type: 'section',
      id: String(row.section_id),
      label: row.section_code,
      sublabel: [row.program?.program_code, `Year ${row.year_level}`]
        .filter(Boolean)
        .join(' - '),
      path: `/sections?q=${encodeURIComponent(row.section_code)}`,
    }));
  }

  // Users (Dean / Admin only)
  private async searchUsers(
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const db = this.supabase.getAdminClient();
    const { data, error } = await db
      .from('users')
      .select('user_id, username, email, role, is_active')
      .eq('is_active', true)
      .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
      .order('username', { ascending: true })
      .limit(limit);

    if (error) return [];

    return (data ?? []).map((row) => ({
      type: 'user',
      id: String(row.user_id),
      label: row.username,
      sublabel: `${row.email} - ${row.role}`,
      path: `/dean/users?q=${encodeURIComponent(row.username)}`,
    }));
  }

  // Academic terms (Dean / Admin only)
  private async searchTerms(
    q: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const db = this.supabase.getAdminClient();
    const { data, error } = await db
      .from('term')
      .select('term_id, term_name, school_year, semester, is_active')
      .or(`term_name.ilike.%${q}%,school_year.ilike.%${q}%`)
      .order('is_active', { ascending: false })
      .order('start_date', { ascending: false })
      .limit(limit);

    if (error) return [];

    return (data ?? []).map((row) => ({
      type: 'term',
      id: String(row.term_id),
      label: `${row.term_name} - AY ${row.school_year}`,
      sublabel: [row.semester, row.is_active ? 'Active' : null]
        .filter(Boolean)
        .join(' - '),
      path: `/dean/system-settings?termId=${row.term_id}#academic-terms`,
    }));
  }
}
