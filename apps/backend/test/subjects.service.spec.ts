import { SubjectsService } from '../src/modules/subjects/subjects.service';
import { createFakeRepository } from './fakes/repository.fake';

const admin = { role: 'administrator', deptId: null } as any;

const subjectRow = (overrides: Record<string, any> = {}) => ({
  subjectId: '1',
  subjectCode: 'MATH 100',
  title: 'College Algebra',
  totalUnits: 3,
  lectureUnits: 3,
  labUnits: 0,
  requiredRoomType: 'lecture_room',
  isMinor: false,
  isPlaceholder: false,
  isActive: true,
  deptId: '7',
  ...overrides,
});

const prospectusRow = (overrides: Record<string, any> = {}) => ({
  prospectusId: 'p1',
  programId: '10',
  subjectId: '1',
  yearLevel: 1,
  semester: '1st',
  isActive: true,
  deactivatedBySubject: false,
  lectureSessionsPerWeek: 1,
  lectureMinutesPerSession: 90,
  labSessionsPerWeek: 1,
  labMinutesPerSession: 180,
  ...overrides,
});

describe('SubjectsService.toggleActive prospectus cascade', () => {
  let service: SubjectsService;
  let subjectRepo: ReturnType<typeof createFakeRepository>;
  let prospectusRepo: ReturnType<typeof createFakeRepository>;

  const rowById = (id: string) =>
    prospectusRepo.rows.find((r: any) => r.prospectusId === id)!;

  beforeEach(() => {
    subjectRepo = createFakeRepository([subjectRow()], {
      idKey: 'subjectId',
    });
    prospectusRepo = createFakeRepository(
      [
        // Active mapping of the subject being deactivated.
        prospectusRow({ prospectusId: 'p1' }),
        // Manually deactivated mapping — must stay off.
        prospectusRow({
          prospectusId: 'p2',
          isActive: false,
          deactivatedBySubject: false,
        }),
        // Mapping of a different subject — must never be touched.
        prospectusRow({ prospectusId: 'p3', subjectId: '2' }),
      ],
      { idKey: 'prospectusId' },
    );

    const emptyRepo = createFakeRepository([]);
    const departments = {
      assertDepartmentActive: jest.fn().mockResolvedValue(undefined),
    };

    service = new SubjectsService(
      subjectRepo as any,
      emptyRepo as any,
      emptyRepo as any,
      prospectusRepo as any,
      departments as any,
    );
  });

  it('deactivates the subject and its active prospectus rows', async () => {
    const result = await service.toggleActive('1', admin);

    expect(result.isActive).toBe(false);
    expect(subjectRepo.rows[0].isActive).toBe(false);

    // Active row is switched off and marked as cascade-deactivated.
    expect(rowById('p1').isActive).toBe(false);
    expect(rowById('p1').deactivatedBySubject).toBe(true);

    // Manual choice is preserved.
    expect(rowById('p2').isActive).toBe(false);
    expect(rowById('p2').deactivatedBySubject).toBe(false);

    // Another subject is untouched.
    expect(rowById('p3').isActive).toBe(true);
  });

  it('restores only cascade-deactivated rows on reactivation', async () => {
    await service.toggleActive('1', admin); // deactivate
    const result = await service.toggleActive('1', admin); // reactivate

    expect(result.isActive).toBe(true);
    expect(subjectRepo.rows[0].isActive).toBe(true);

    expect(rowById('p1').isActive).toBe(true);
    expect(rowById('p1').deactivatedBySubject).toBe(false);

    // A row the user turned off by hand is not resurrected.
    expect(rowById('p2').isActive).toBe(false);

    // Another subject is still untouched.
    expect(rowById('p3').isActive).toBe(true);
  });
});
