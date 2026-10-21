import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProspectusPdfsService } from '../src/modules/prospectus-pdfs/prospectus-pdfs.service';
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
