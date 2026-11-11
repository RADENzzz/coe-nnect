import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
