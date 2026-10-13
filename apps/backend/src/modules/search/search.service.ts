import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

interface SearchContext {
  userId: string;
  role: 'administrator' | 'college_dean' | 'department_head';
  deptId?: string | null;
}

export interface SearchResult {
  type: 'subject' | 'faculty' | 'room' | 'section' | 'user';
  id: string;
  label: string;
  sublabel?: string;
  meta?: Record<string, string>;
  path: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly supabase: SupabaseService) {}

  async search(
    q: string,
    user: SearchContext,
    limit = 20,
  ): Promise<{ query: string; results: SearchResult[] }> {
    const query = (q ?? '').trim();

    // Require at least 3 characters — anything shorter is too noisy
    if (query.length < 3) {
      return { query, results: [] };
    }

    const perType = Math.max(2, Math.floor(limit / 5));
    const scopedDept =
      user.role === 'department_head' && user.deptId
        ? String(user.deptId)
        : null;

    const isAdminOrDean =
      user.role === 'administrator' || user.role === 'college_dean';

    const [subjects, faculty, rooms, sections, users] = await Promise.all([
      this.searchSubjects(query, perType, scopedDept),
      this.searchFaculty(query, perType, scopedDept),
      this.searchRooms(query, perType, scopedDept),
      this.searchSections(query, perType, scopedDept),
      isAdminOrDean
        ? this.searchUsers(query, perType)
        : Promise.resolve([] as SearchResult[]),
    ]);

    const results: SearchResult[] = [
      ...subjects,
      ...faculty,
      ...rooms,
      ...sections,
      ...users,
    ].slice(0, limit);

    return { query, results };
  }

  // ── Subjects ─────────────────────────────────────────
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
      path: `/subjects?highlight=${row.subject_id}`,
    }));
  }

  // ── Faculty ──────────────────────────────────────────
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
        path: `/faculty?highlight=${row.faculty_id}`,
      };
    });
  }

  // ── Rooms ────────────────────────────────────────────
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
      sublabel: [row.building, row.room_type].filter(Boolean).join(' · '),
      path: `/rooms?highlight=${row.room_id}`,
    }));
  }

  // ── Sections ─────────────────────────────────────────
  //
  // DH scoping fix: we can't easily inner-join program in PostgREST with a
  // filter on the joined table, so we over-fetch 3× the target limit and
  // trim after filtering. This keeps the SQL fast while still respecting
  // the department scope.
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
        .join(' · '),
      path: `/sections?highlight=${row.section_id}`,
    }));
  }

  // ── Users (Dean / Admin only) ────────────────────────
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
      sublabel: `${row.email} · ${row.role}`,
      path: `/dean/users?highlight=${row.user_id}`,
    }));
  }
}