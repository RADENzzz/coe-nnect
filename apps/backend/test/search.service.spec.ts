import { SearchService } from '../src/modules/search/search.service';
import { createFakeSupabase } from './fakes/supabase.fake';

describe('SearchService', () => {
  it('does not query Supabase for one-character queries or unsafe-only input', async () => {
    const fake = createFakeSupabase();
    const service = new SearchService(fake as any);

    await expect(
      service.search('c', { userId: 'user-1', role: 'college_dean' }),
    ).resolves.toEqual({ query: 'c', results: [] });

    await expect(
      service.search('(),%_"\\', {
        userId: 'user-1',
        role: 'college_dean',
      }),
    ).resolves.toEqual({ query: '(),%_"\\', results: [] });

    expect(fake.calls).toHaveLength(0);
  });

  it('returns ranked results and scopes department data for department heads', async () => {
    const fake = createFakeSupabase({
      tables: {
        subject: [
          {
            subject_id: 'subject-1',
            subject_code: 'CS101',
            title: 'Introduction to Computing',
            dept_id: 'dept-1',
            is_active: true,
          },
        ],
        faculty: [
          {
            faculty_id: 'faculty-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            employee_id: 'EMP-1',
            dept_id: 'dept-1',
            is_active: true,
          },
        ],
        room: [
          {
            room_id: 'room-1',
            room_number: 'CS-101',
            building: 'Engineering',
            room_type: 'Laboratory',
            dept_id: 'dept-1',
            is_active: true,
          },
        ],
        section: [
          {
            section_id: 'section-1',
            section_code: 'CS101-A',
            year_level: 1,
            program: { program_code: 'BSCS', dept_id: 'dept-1' },
            is_active: true,
          },
        ],
      },
    });
    const service = new SearchService(fake as any);

    const response = await service.search(
      'cs',
      {
        userId: 'user-1',
        role: 'department_head',
        deptId: 'dept-1',
      },
      10,
    );

    expect(response.results[0]).toMatchObject({
      type: 'subject',
      label: 'CS101',
    });
    expect(response.results.map((result) => result.type)).toEqual(
      expect.arrayContaining(['subject', 'room', 'section']),
    );

    const tablesQueried = fake.calls.map((call) => call.table);
    expect(tablesQueried).toEqual(
      expect.arrayContaining(['subject', 'faculty', 'room', 'section']),
    );
    expect(tablesQueried).not.toContain('users');
    expect(tablesQueried).not.toContain('term');
  });

  it('includes user and academic-term results for deans', async () => {
    const fake = createFakeSupabase({
      tables: {
        users: [
          {
            user_id: 'user-2',
            username: 'first.dean',
            email: 'first.dean@wmsu.edu.ph',
            role: 'college_dean',
            is_active: true,
          },
        ],
        term: [
          {
            term_id: 'term-1',
            term_name: 'First Semester',
            school_year: '2026-2027',
            semester: '1st',
            is_active: true,
          },
        ],
      },
    });
    const service = new SearchService(fake as any);

    const response = await service.search('first', {
      userId: 'user-1',
      role: 'college_dean',
    });

    expect(response.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'term', label: expect.stringContaining('First Semester') }),
        expect.objectContaining({ type: 'user', label: 'first.dean' }),
      ]),
    );
    expect(fake.calls.map((call) => call.table)).toEqual(
      expect.arrayContaining(['users', 'term']),
    );
  });
});
