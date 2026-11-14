import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ProspectusPdfsService,
  inferRoomTypeFromUnits,
} from '../src/modules/prospectus-pdfs/prospectus-pdfs.service';
import { createFakeRepository } from './fakes/repository.fake';

function createService() {
  const storage = {
    uploadPdf: jest.fn().mockResolvedValue({
      storagePath: 'dept-1/pdf-1/prospectus.pdf',
      bucket: 'prospectus-pdfs',
    }),
    downloadPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
  };
  const parser = {
    getPageInfo: jest.fn().mockResolvedValue({
      page_count: 2,
      page_sizes_pt: [{ width_pt: 612, height_pt: 792 }],
    }),
    detect: jest.fn().mockResolvedValue({
      page_count: 2,
      proposals: [],
      warnings: [],
    }),
  };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const pdfRepo = createFakeRepository([], { idKey: 'pdfId' });
  const tableRepo = createFakeRepository([], { idKey: 'tableId' });

  const service = new ProspectusPdfsService(
    pdfRepo as any,
    tableRepo as any,
    createFakeRepository([], { idKey: 'subjectId' }) as any,
    createFakeRepository([], { idKey: 'prospectusId' }) as any,
    createFakeRepository([], { idKey: 'programId' }) as any,
    storage as any,
    parser as any,
    dispatcher as any,
  );

  return { service, storage, parser, pdfRepo, tableRepo };
}

const ADMIN_USER = {
  userId: 'u1',
  role: 'administrator' as const,
  deptId: '1',
};

const COLUMNS = ['code', 'title', 'prereq', 'lec', 'lab', 'total'].map(
  (role, index) => ({
    role,
    x_start_pt: 40 + index * 80,
    x_end_pt: 120 + index * 80,
  }),
);

function seedPdf(
  pdfRepo: ReturnType<typeof createFakeRepository>,
  extra: Record<string, any> = {},
) {
  pdfRepo.rows.push({
    pdfId: 'pdf-1',
    departmentId: '1',
    deletedAt: null,
    storagePath: 'dept-1/pdf-1/prospectus.pdf',
    ...extra,
  });
}

function tableDto(rows: any[]) {
  return {
    year_level: 1,
    semester: '1st' as const,
    region_page_index: 0,
    region_x_start_pt: 40,
    region_x_end_pt: 520,
    region_y_start_pt: 300,
    region_y_end_pt: 700,
    columns: COLUMNS,
    rows,
  };
}

const pdfFile = {
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7'),
  originalname: 'prospectus.pdf',
  size: 8,
};

describe('inferRoomTypeFromUnits', () => {
  it('maps pure lecture to a lecture room', () => {
    expect(inferRoomTypeFromUnits(3, 0)).toBe('lecture_room');
  });

  it('maps a lecture/lab mix to any', () => {
    expect(inferRoomTypeFromUnits(2, 1)).toBe('any');
  });

  it('maps a pure lab to a laboratory', () => {
    expect(inferRoomTypeFromUnits(0, 2)).toBe('laboratory');
  });

  it('never infers a specialised room and leaves empty units unset', () => {
    expect(inferRoomTypeFromUnits(0, 0)).toBeNull();
    expect(inferRoomTypeFromUnits(3, 0)).not.toBe('computer_lab');
    expect(inferRoomTypeFromUnits(0, 2)).not.toBe('computer_lab');
  });
});

describe('ProspectusPdfsService confirmImport room types', () => {
  function createImportService() {
    const pdfRepo = createFakeRepository(
      [
        {
          pdfId: 'pdf-1',
          departmentId: '1',
          deletedAt: null,
        },
      ],
      { idKey: 'pdfId' },
    );
    const tableRepo = createFakeRepository(
      [{ tableId: '1', pdfId: 'pdf-1', yearLevel: 1, semester: '1st' }],
      { idKey: 'tableId' },
    );
    const subjectRepo = createFakeRepository([], { idKey: 'subjectId' });
    const prospectusRepo = createFakeRepository([], { idKey: 'prospectusId' });
    const programRepo = createFakeRepository(
      [{ programId: '1', deptId: '1' }],
      { idKey: 'programId' },
    );

    const service = new ProspectusPdfsService(
      pdfRepo as any,
      tableRepo as any,
      subjectRepo as any,
      prospectusRepo as any,
      programRepo as any,
      { uploadPdf: jest.fn() } as any,
      { getPageInfo: jest.fn() } as any,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return { service, subjectRepo, prospectusRepo };
  }

  const user = { userId: 'u1', role: 'administrator', deptId: '1' };

  function subjectRow(
    code: string,
    title: string,
    lec: string,
    lab: string,
    total: string,
  ) {
    return { code, title, lec, lab, total, action: 'subject' as const };
  }

  function importDto(subjects: ReturnType<typeof subjectRow>[]) {
    return {
      program_id: 1,
      table_ids: [1],
      regions: [{ table_id: 1, subjects }],
    };
  }

  it('assigns lecture_room, any, and laboratory from the unit split', async () => {
    const { service, subjectRepo } = createImportService();

    await service.confirmImport(
      'pdf-1',
      importDto([
        subjectRow('MATH 100', 'College Algebra', '3', '0', '3'),
        subjectRow('CPE 111', 'Computer Engineering', '2', '1', '3'),
        subjectRow('LAB 100', 'Pure Lab', '0', '2', '2'),
      ]) as any,
      user,
    );

    const byCode = Object.fromEntries(
      subjectRepo.rows.map((s: any) => [s.subjectCode, s.requiredRoomType]),
    );
    expect(byCode['MATH 100']).toBe('lecture_room');
    expect(byCode['CPE 111']).toBe('any');
    expect(byCode['LAB 100']).toBe('laboratory');
  });

  it('backfills missing types but keeps specialised user choices', async () => {
    const { service, subjectRepo } = createImportService();
    subjectRepo.rows.push(
      {
        subjectId: 's1',
        subjectCode: 'MATH 100',
        requiredRoomType: null,
      },
      {
        subjectId: 's2',
        subjectCode: 'EE 113',
        requiredRoomType: 'drafting_room',
      },
      {
        subjectId: 's3',
        subjectCode: 'CPE 111',
        requiredRoomType: 'lecture_room',
      },
    );

    await service.confirmImport(
      'pdf-1',
      importDto([
        subjectRow('MATH 100', 'College Algebra', '3', '0', '3'),
        subjectRow('EE 113', 'Engineering Drawing', '1', '1', '2'),
        subjectRow('CPE 111', 'Computer Engineering', '2', '1', '3'),
      ]) as any,
      user,
    );

    const byCode = Object.fromEntries(
      subjectRepo.rows.map((s: any) => [s.subjectCode, s.requiredRoomType]),
    );
    expect(byCode['MATH 100']).toBe('lecture_room');
    // A user-chosen specialised room is preserved.
    expect(byCode['EE 113']).toBe('drafting_room');
    // A stale auto-inferred basic type is corrected to 'any' for a mix.
    expect(byCode['CPE 111']).toBe('any');
  });

  it('does not overwrite a specialised type for a pure lecture subject', async () => {
    const { service, subjectRepo } = createImportService();
    subjectRepo.rows.push({
      subjectId: 's1',
      subjectCode: 'MATH 100',
      requiredRoomType: 'computer_lab',
    });

    await service.confirmImport(
      'pdf-1',
      importDto([subjectRow('MATH 100', 'College Algebra', '3', '0', '3')]) as any,
      user,
    );

    expect(subjectRepo.rows[0].requiredRoomType).toBe('computer_lab');
  });

  it('does not reactivate a mapping whose subject is inactive', async () => {
    const { service, subjectRepo, prospectusRepo } = createImportService();
    subjectRepo.rows.push({
      subjectId: 's1',
      subjectCode: 'MATH 100',
      title: 'College Algebra',
      totalUnits: 3,
      lectureUnits: 3,
      labUnits: 0,
      deptId: '1',
      isActive: false,
      isMinor: false,
      isPlaceholder: false,
      requiredRoomType: 'lecture_room',
    });
    prospectusRepo.rows.push({
      prospectusId: 'p1',
      programId: '1',
      subjectId: 's1',
      yearLevel: 1,
      semester: '1st',
      isActive: false,
      deactivatedBySubject: true,
    });

    await service.confirmImport(
      'pdf-1',
      importDto([subjectRow('MATH 100', 'College Algebra', '3', '0', '3')]) as any,
      user,
    );

    expect(prospectusRepo.rows[0].isActive).toBe(false);
    expect(prospectusRepo.rows[0].deactivatedBySubject).toBe(true);
  });
});

describe('ProspectusPdfsService elective imports', () => {
  function createImportService(tableOverrides: Record<string, any> = {}) {
    const pdfRepo = createFakeRepository(
      [{ pdfId: 'pdf-1', departmentId: '1', deletedAt: null }],
      { idKey: 'pdfId' },
    );
    const tableRepo = createFakeRepository(
      [
        {
          tableId: '1',
          pdfId: 'pdf-1',
          yearLevel: 1,
          semester: '1st',
          tableKind: 'elective',
          ...tableOverrides,
        },
      ],
      { idKey: 'tableId' },
    );
    const subjectRepo = createFakeRepository([], { idKey: 'subjectId' });
    const prospectusRepo = createFakeRepository([], { idKey: 'prospectusId' });
    const programRepo = createFakeRepository([{ programId: '1', deptId: '1' }], {
      idKey: 'programId',
    });

    const service = new ProspectusPdfsService(
      pdfRepo as any,
      tableRepo as any,
      subjectRepo as any,
      prospectusRepo as any,
      programRepo as any,
      { uploadPdf: jest.fn() } as any,
      { getPageInfo: jest.fn() } as any,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return { service, subjectRepo, prospectusRepo };
  }

  const user = { userId: 'u1', role: 'administrator', deptId: '1' };

  function importDto(subjects: any[]) {
    return {
      program_id: 1,
      table_ids: [1],
      regions: [{ table_id: 1, subjects }],
    };
  }

  it('imports a typed elective code as a real elective subject', async () => {
    const { service, subjectRepo, prospectusRepo } = createImportService();

    const result = await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'GEC 101',
          title: 'Gender and Society',
          lec: '3',
          lab: '0',
          total: '3',
          action: 'elective',
          units_mode: 'lec_lab',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows).toHaveLength(1);
    expect(subjectRepo.rows[0]).toMatchObject({
      subjectCode: 'GEC 101',
      isElective: true,
      isPlaceholder: false,
      unitsMode: 'lec_lab',
      lectureUnits: 3,
      labUnits: 0,
    });
    expect(prospectusRepo.rows).toHaveLength(1);
    expect(result.slots).toHaveLength(1);
    expect(result.temporaryCodes).toEqual([]);
  });

  it('imports a total-only elective without a lec/lab breakdown', async () => {
    const { service, subjectRepo } = createImportService();

    await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'GEC 102',
          title: 'Free Elective',
          lec: '0',
          lab: '0',
          total: '3',
          action: 'elective',
          units_mode: 'total_only',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows[0]).toMatchObject({
      subjectCode: 'GEC 102',
      isElective: true,
      unitsMode: 'total_only',
      totalUnits: 3,
      lectureUnits: 0,
      labUnits: 0,
    });
  });

  it('derives the total when an elective lists only lecture units', async () => {
    const { service, subjectRepo } = createImportService();

    await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'CPE RPA 1',
          title: 'Robotics Process Automation',
          lec: '3',
          lab: '0',
          total: '',
          action: 'elective',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows[0]).toMatchObject({
      subjectCode: 'CPE RPA 1',
      unitsMode: 'lec_lab',
      totalUnits: 3,
      lectureUnits: 3,
      labUnits: 0,
    });
  });

  it('derives the total when an elective lists only laboratory units', async () => {
    const { service, subjectRepo } = createImportService();

    await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'CPE SD 1',
          title: 'Software Development',
          lec: '0',
          lab: '2',
          total: '',
          action: 'elective',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows[0]).toMatchObject({
      subjectCode: 'CPE SD 1',
      unitsMode: 'lec_lab',
      totalUnits: 2,
      lectureUnits: 0,
      labUnits: 2,
    });
  });

  it('derives the total when lec and lab are present without a total column', async () => {
    const { service, subjectRepo } = createImportService();

    await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'MST 101',
          title: 'Mathematics for Computing',
          lec: '2',
          lab: '1',
          total: '',
          action: 'elective',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows[0]).toMatchObject({
      subjectCode: 'MST 101',
      unitsMode: 'lec_lab',
      totalUnits: 3,
      lectureUnits: 2,
      labUnits: 1,
    });
  });

  it('stamps imported electives with the table year/term and chosen category', async () => {
    const { service, subjectRepo } = createImportService();

    await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'GEC 103',
          title: 'Ethics',
          lec: '3',
          lab: '0',
          total: '3',
          action: 'elective',
          units_mode: 'lec_lab',
          elective_category: '  GEC  ',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows[0]).toMatchObject({
      subjectCode: 'GEC 103',
      isElective: true,
      electiveCategory: 'GEC',
      electiveYearLevel: 1,
      electiveSemester: '1st',
    });
  });

  it('creates a deterministic temporary code and reports it', async () => {
    const { service, subjectRepo } = createImportService();

    const result = await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: '',
          title: 'Free Elective',
          lec: '3',
          lab: '0',
          total: '3',
          action: 'elective',
          units_mode: 'lec_lab',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows).toHaveLength(1);
    expect(subjectRepo.rows[0].subjectCode).toMatch(
      /^ELEC-Y1S1-[A-F0-9]{6}$/,
    );
    expect(subjectRepo.rows[0].isPlaceholder).toBe(true);
    expect(result.temporaryCodes).toHaveLength(1);
    expect(result.temporaryCodes[0].subjectCode).toBe(
      subjectRepo.rows[0].subjectCode,
    );
    expect(result.warnings.join(' ')).toContain('temporary code');
  });

  it('is idempotent when the same temporary elective is re-imported', async () => {
    const { service, subjectRepo } = createImportService();
    const dto = importDto([
      {
        code: '',
        title: 'Free Elective',
        lec: '3',
        lab: '0',
        total: '3',
        action: 'elective',
      },
    ]);

    await service.confirmImport('pdf-1', dto as any, user);
    await service.confirmImport('pdf-1', dto as any, user);

    expect(subjectRepo.rows).toHaveLength(1);
  });

  it('reuses an existing elective chosen by subject id', async () => {
    const { service, subjectRepo } = createImportService();
    subjectRepo.rows.push({
      subjectId: 'e1',
      subjectCode: 'ELEC 201',
      title: 'Existing Elective',
      totalUnits: 3,
      lectureUnits: 3,
      labUnits: 0,
      deptId: '1',
      isActive: true,
      isElective: true,
      isPlaceholder: false,
      unitsMode: 'lec_lab',
    });

    const result = await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: '',
          subject_id: 'e1',
          title: 'Existing Elective',
          lec: '3',
          lab: '0',
          total: '3',
          action: 'elective',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows).toHaveLength(1);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].subjectId).toBe('e1');
  });

  it('rejects a regular subject chosen as an elective row', async () => {
    const { service, subjectRepo, prospectusRepo } = createImportService();
    subjectRepo.rows.push({
      subjectId: 's1',
      subjectCode: 'MATH 100',
      title: 'College Algebra',
      totalUnits: 3,
      lectureUnits: 3,
      labUnits: 0,
      deptId: '1',
      isActive: true,
      isElective: false,
      isPlaceholder: false,
    });

    const result = await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: 'MATH 100',
          subject_id: 's1',
          title: 'College Algebra',
          lec: '3',
          lab: '0',
          total: '3',
          action: 'elective',
        },
      ]) as any,
      user,
    );

    expect(prospectusRepo.rows).toHaveLength(0);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toBe('not_elective');
  });

  it('imports a yearless elective into the catalog without a prospectus row', async () => {
    const { service, subjectRepo, prospectusRepo } = createImportService({
      yearLevel: null,
      semester: null,
    });

    const result = await service.confirmImport(
      'pdf-1',
      importDto([
        {
          code: '',
          title: 'Free Elective',
          lec: '3',
          lab: '0',
          total: '3',
          action: 'elective',
          units_mode: 'lec_lab',
        },
      ]) as any,
      user,
    );

    expect(subjectRepo.rows).toHaveLength(1);
    expect(subjectRepo.rows[0]).toMatchObject({
      isElective: true,
      isPlaceholder: true,
      electiveYearLevel: null,
      electiveSemester: null,
    });
    expect(subjectRepo.rows[0].subjectCode).toMatch(
      /^ELEC-YXSX-[A-F0-9]{6}$/,
    );
    // The catalog entry exists, but there is no year/term slot to attach it
    // to yet.
    expect(prospectusRepo.rows).toHaveLength(0);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].yearLevel).toBeNull();
    expect(result.slots[0].semester).toBeNull();
    expect(result.warnings.join(' ')).toContain('without a year/term');
  });
});

describe('ProspectusPdfsService table kinds', () => {
  it('allows multiple elective tables for the same year and semester', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await service.createTable(
      'pdf-1',
      { ...tableDto([]), table_kind: 'elective' } as any,
      ADMIN_USER,
    );
    await service.createTable(
      'pdf-1',
      { ...tableDto([]), table_kind: 'elective' } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows).toHaveLength(2);
    expect(tableRepo.rows.every((t) => t.tableKind === 'elective')).toBe(true);
  });

  it('still enforces one regular table per year and semester', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await service.createTable('pdf-1', tableDto([]) as any, ADMIN_USER);

    await expect(
      service.createTable('pdf-1', tableDto([]) as any, ADMIN_USER),
    ).rejects.toThrow(/regular table for Year 1 1st already exists/);
    expect(tableRepo.rows).toHaveLength(1);
    expect(tableRepo.rows[0].tableKind).toBe('regular');
  });

  it('allows a regular and an elective table side by side', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await service.createTable('pdf-1', tableDto([]) as any, ADMIN_USER);
    await service.createTable(
      'pdf-1',
      { ...tableDto([]), table_kind: 'elective' } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows).toHaveLength(2);
  });

  it('creates a yearless elective table', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await service.createTable(
      'pdf-1',
      {
        ...tableDto([]),
        year_level: null,
        semester: null,
        table_kind: 'elective',
      } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows).toHaveLength(1);
    expect(tableRepo.rows[0]).toMatchObject({
      tableKind: 'elective',
      yearLevel: null,
      semester: null,
    });
  });

  it('accepts an elective table with only code, title, and total columns', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    const columns = [
      { role: 'code', x_start_pt: 40, x_end_pt: 120 },
      { role: 'title', x_start_pt: 120, x_end_pt: 400 },
      { role: 'total', x_start_pt: 400, x_end_pt: 520 },
    ];

    await service.createTable(
      'pdf-1',
      { ...tableDto([]), table_kind: 'elective', columns } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows[0].columns).toEqual(columns);
  });

  it('accepts an elective table with a lec/lab/total split', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    const columns = [
      { role: 'code', x_start_pt: 40, x_end_pt: 120 },
      { role: 'title', x_start_pt: 120, x_end_pt: 360 },
      { role: 'lec', x_start_pt: 360, x_end_pt: 410 },
      { role: 'lab', x_start_pt: 410, x_end_pt: 460 },
      { role: 'total', x_start_pt: 460, x_end_pt: 520 },
    ];

    await service.createTable(
      'pdf-1',
      { ...tableDto([]), table_kind: 'elective', columns } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows[0].columns).toEqual(columns);
  });

  it('accepts an elective table with a single lecture column', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    const columns = [
      { role: 'code', x_start_pt: 40, x_end_pt: 120 },
      { role: 'title', x_start_pt: 120, x_end_pt: 400 },
      { role: 'lec', x_start_pt: 400, x_end_pt: 520 },
    ];

    await service.createTable(
      'pdf-1',
      { ...tableDto([]), table_kind: 'elective', columns } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows[0].columns).toEqual(columns);
  });

  it('still requires all six columns for regular tables', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await expect(
      service.createTable(
        'pdf-1',
        {
          ...tableDto([]),
          columns: [
            { role: 'code', x_start_pt: 40, x_end_pt: 120 },
            { role: 'title', x_start_pt: 120, x_end_pt: 400 },
            { role: 'total', x_start_pt: 400, x_end_pt: 520 },
          ],
        } as any,
        ADMIN_USER,
      ),
    ).rejects.toThrow(/columns missing role/);
    expect(tableRepo.rows).toHaveLength(0);
  });

  it('rejects duplicate elective column roles', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await expect(
      service.createTable(
        'pdf-1',
        {
          ...tableDto([]),
          table_kind: 'elective',
          columns: [
            { role: 'code', x_start_pt: 40, x_end_pt: 120 },
            { role: 'title', x_start_pt: 120, x_end_pt: 400 },
            { role: 'title', x_start_pt: 400, x_end_pt: 520 },
          ],
        } as any,
        ADMIN_USER,
      ),
    ).rejects.toThrow(/repeat role/);
    expect(tableRepo.rows).toHaveLength(0);
  });

  it('rejects a regular table without a year and semester', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await expect(
      service.createTable(
        'pdf-1',
        { ...tableDto([]), year_level: null, semester: null } as any,
        ADMIN_USER,
      ),
    ).rejects.toThrow(/require a year level and semester/);
    expect(tableRepo.rows).toHaveLength(0);
  });
});

describe('ProspectusPdfsService deleteTable', () => {
  it('deletes the table with a PDF-scoped DELETE and a lightweight access lookup', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    tableRepo.rows.push({ tableId: '7', pdfId: 'pdf-1', rows: [] });

    await service.deleteTable('pdf-1', '7', ADMIN_USER);

    expect(tableRepo.rows).toHaveLength(0);
    expect(tableRepo.delete).toHaveBeenCalledWith({
      tableId: '7',
      pdfId: 'pdf-1',
    });
    expect(pdfRepo.findOne).toHaveBeenCalledWith({
      where: { pdfId: 'pdf-1', deletedAt: expect.anything() },
      select: { pdfId: true, departmentId: true },
    });
  });

  it('does not delete a table that belongs to another PDF', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    tableRepo.rows.push({ tableId: '7', pdfId: 'pdf-2', rows: [] });

    await expect(
      service.deleteTable('pdf-1', '7', ADMIN_USER),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tableRepo.rows).toHaveLength(1);
  });

  it('rejects a department head from another department', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    tableRepo.rows.push({ tableId: '7', pdfId: 'pdf-1', rows: [] });

    await expect(
      service.deleteTable('pdf-1', '7', {
        userId: 'user-dh',
        role: 'department_head',
        deptId: '2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tableRepo.rows).toHaveLength(1);
  });
});

describe('ProspectusPdfsService table detection conflicts', () => {
  it('does not treat an existing elective table as a regular conflict', async () => {
    const { service, parser, pdfRepo } = createService();
    seedPdf(pdfRepo, {
      tables: [
        {
          tableId: 'e1',
          pdfId: 'pdf-1',
          tableKind: 'elective',
          yearLevel: 1,
          semester: '1st',
        },
      ],
    });
    parser.detect.mockResolvedValueOnce({
      page_count: 1,
      proposals: [
        {
          page_index: 0,
          year_level: 1,
          semester: '1st',
          confidence: 0.9,
          label: 'First Year First Semester',
          header_text: 'Code Title Lec Lab Total',
          signals: [],
          region_x_start_pt: 40,
          region_x_end_pt: 520,
          region_y_start_pt: 100,
          region_y_end_pt: 700,
          columns: COLUMNS,
          rows: [],
        },
      ],
      warnings: [],
    });

    const result = await service.detectTables(
      'pdf-1',
      ADMIN_USER,
      {} as any,
    );

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].status).toBe('new');
    expect(result.proposals[0].existingTableId).toBeNull();
  });
});

describe('ProspectusPdfsService uploads', () => {
  it('stores PDF metadata for a department head own department', async () => {
    const { service, storage, parser, pdfRepo } = createService();
    pdfRepo.create.mockImplementation((input: any) => ({
      ...input,
      pdfId: 'pdf-1',
    }));

    const saved = await service.upload(
      pdfFile,
      { userId: 'user-dh', role: 'department_head', deptId: '1' },
      '1',
      'First semester prospectus',
    );

    expect(storage.uploadPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: '1',
        contentType: 'application/pdf',
        buffer: pdfFile.buffer,
      }),
    );
    expect(parser.getPageInfo).toHaveBeenCalled();
    expect(pdfRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: '1',
        originalFilename: 'prospectus.pdf',
        pageCount: 2,
        pageWidthPt: '612',
        pageHeightPt: '792',
        uploadedBy: 'user-dh',
      }),
    );
    expect(saved).toMatchObject({
      departmentId: '1',
      originalFilename: 'prospectus.pdf',
      uploadedBy: 'user-dh',
    });
    expect(pdfRepo.rows).toHaveLength(1);
  });

  it('rejects non-PDF files and cross-department uploads before storage', async () => {
    const { service, storage, parser } = createService();

    await expect(
      service.upload(
        { ...pdfFile, mimetype: 'text/plain' },
        { userId: 'user-dh', role: 'department_head', deptId: '1' },
        '1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.upload(
        pdfFile,
        { userId: 'user-dh', role: 'department_head', deptId: '1' },
        '2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(storage.uploadPdf).not.toHaveBeenCalled();
    expect(parser.getPageInfo).not.toHaveBeenCalled();
  });
});

describe('ProspectusPdfsService row cell overrides', () => {
  const CELLS = {
    code: 'CPE 111',
    title: 'Computer Engineering',
    prereq: '',
    lec: '2',
    lab: '1',
    total: '3',
  };

  it('persists per-row cells on create and omits them when absent', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);

    await service.createTable(
      'pdf-1',
      tableDto([
        { row_id: 'r1', y_top_pt: 690, y_bottom_pt: 670, cells: CELLS },
        { row_id: 'r2', y_top_pt: 665, y_bottom_pt: 645 },
      ]) as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows).toHaveLength(1);
    const savedRows = tableRepo.rows[0].rows;
    expect(savedRows[0].cells).toEqual(CELLS);
    // Legacy rows keep their old shape — no empty cells object is invented.
    expect(savedRows[1]).not.toHaveProperty('cells');
  });

  it('persists per-row cells on update', async () => {
    const { service, pdfRepo, tableRepo } = createService();
    seedPdf(pdfRepo);
    tableRepo.rows.push({
      tableId: 't1',
      pdfId: 'pdf-1',
      yearLevel: 1,
      semester: '1st',
      rows: [],
      columns: COLUMNS,
    });

    await service.updateTable(
      'pdf-1',
      't1',
      {
        rows: [
          {
            row_id: 'r1',
            y_top_pt: 690,
            y_bottom_pt: 670,
            cells: { ...CELLS, title: 'Edited title' },
          },
        ],
      } as any,
      ADMIN_USER,
    );

    expect(tableRepo.rows[0].rows[0].cells).toEqual({
      ...CELLS,
      title: 'Edited title',
    });
  });
});

describe('ProspectusPdfsService detectTables', () => {
  function detectedProposal(overrides: Record<string, unknown> = {}) {
    return {
      page_index: 0,
      year_level: 1,
      semester: '1st',
      confidence: 0.8,
      label: 'Year 1 · 1st',
      header_text: 'CODE TITLE PRE-REQUISITE LEC LAB TOTAL',
      signals: ['6 column labels'],
      region_x_start_pt: 40,
      region_x_end_pt: 520,
      region_y_start_pt: 300,
      region_y_end_pt: 700,
      columns: COLUMNS,
      rows: [{ row_id: 'd0_0', y_top_pt: 680, y_bottom_pt: 660 }],
      ...overrides,
    };
  }

  it('flags mapped and duplicate proposals without writing anything', async () => {
    const { service, pdfRepo, tableRepo, parser, storage } = createService();
    seedPdf(pdfRepo, {
      tables: [{ tableId: 'existing-1', yearLevel: 1, semester: '1st' }],
    });
    parser.detect.mockResolvedValueOnce({
      page_count: 3,
      warnings: [
        'Page 3 has no selectable text; it may be a scan or an image.',
      ],
      proposals: [
        detectedProposal({ page_index: 0, year_level: 1, semester: '1st' }),
        detectedProposal({ page_index: 1, year_level: 2, semester: '1st' }),
        // Same pair again — only the first can be created without editing.
        detectedProposal({ page_index: 1, year_level: 2, semester: '1st' }),
        // No inference: still a candidate, never a conflict.
        detectedProposal({ page_index: 2, year_level: null, semester: null }),
      ],
    });

    const result = await service.detectTables('pdf-1', ADMIN_USER, {
      page_indices: [0, 1, 2],
      max_tables: 12,
    });

    expect(storage.downloadPdf).toHaveBeenCalledWith(
      'dept-1/pdf-1/prospectus.pdf',
    );
    expect(parser.detect).toHaveBeenCalledWith({
      pdfBase64: Buffer.from('%PDF-1.7').toString('base64'),
      pageIndices: [0, 1, 2],
      maxTables: 12,
    });
    // Detection is read-only.
    expect(tableRepo.rows).toHaveLength(0);
    expect(tableRepo.save).not.toHaveBeenCalled();

    expect(result.pageCount).toBe(3);
    expect(result.proposals.map((p) => p.proposalId)).toEqual([
      'det-0-0',
      'det-1-1',
      'det-1-2',
      'det-2-3',
    ]);
    expect(result.proposals.map((p) => p.status)).toEqual([
      'conflict',
      'new',
      'conflict',
      'new',
    ]);
    expect(result.proposals.map((p) => p.existingTableId)).toEqual([
      'existing-1',
      null,
      null,
      null,
    ]);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'Page 3 has no selectable text; it may be a scan or an image.',
        'Detected Year 1 1st on page 1, but that table is already mapped.',
        expect.stringContaining('Detected Year 2 1st more than once'),
      ]),
    );
  });

  it('passes the parser warnings through when nothing is detected', async () => {
    const { service, pdfRepo, parser } = createService();
    seedPdf(pdfRepo);
    parser.detect.mockResolvedValueOnce({
      page_count: 2,
      proposals: [],
      warnings: ['No course table was recognised.'],
    });

    const result = await service.detectTables('pdf-1', ADMIN_USER, {});

    expect(result.proposals).toEqual([]);
    expect(result.warnings).toEqual(['No course table was recognised.']);
    expect(parser.detect).toHaveBeenCalledWith(
      expect.objectContaining({
        pageIndices: undefined,
        maxTables: undefined,
      }),
    );
  });
});
