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
  };
  const parser = {
    getPageInfo: jest.fn().mockResolvedValue({
      page_count: 2,
      page_sizes_pt: [{ width_pt: 612, height_pt: 792 }],
    }),
  };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const pdfRepo = createFakeRepository([], { idKey: 'pdfId' });

  const service = new ProspectusPdfsService(
    pdfRepo as any,
    createFakeRepository([], { idKey: 'tableId' }) as any,
    createFakeRepository([], { idKey: 'subjectId' }) as any,
    createFakeRepository([], { idKey: 'prospectusId' }) as any,
    createFakeRepository([], { idKey: 'programId' }) as any,
    storage as any,
    parser as any,
    dispatcher as any,
  );

  return { service, storage, parser, pdfRepo };
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
