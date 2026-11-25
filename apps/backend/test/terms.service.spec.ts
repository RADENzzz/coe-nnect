import { BadRequestException } from '@nestjs/common';
import { TermsService } from '../src/modules/terms/terms.service';
import { createFakeRepository } from './fakes/repository.fake';
import { createFakeSemesters } from './fakes/semesters.fake';

function buildService(known = ['1st', '2nd', 'summer']) {
  const semesters = createFakeSemesters(known);
  const repo = createFakeRepository([], { idKey: 'termId', autoId: true });
  const dataSource = {
    transaction: jest.fn(),
  };
  const dispatcher = {
    dispatch: jest.fn(),
  };
  const recipients = {
    allDepartmentHeads: jest.fn(),
    collegeDean: jest.fn(),
    uniq: jest.fn((values: string[]) => values),
  };

  return {
    repo,
    service: new TermsService(
      repo as any,
      dataSource as any,
      dispatcher as any,
      recipients as any,
      semesters as any,
    ),
  };
}

describe('TermsService optional dates', () => {
  it('stores null dates when both dates are omitted', async () => {
    const { service } = buildService();

    const created = await service.create({
      termName: '1st Semester',
      schoolYear: '2026-2027',
      semester: '1st',
    });

    expect(created.startDate).toBeNull();
    expect(created.endDate).toBeNull();
  });

  it('allows only a start date', async () => {
    const { service } = buildService();

    const created = await service.create({
      termName: '2nd Semester',
      schoolYear: '2026-2027',
      startDate: '2026-08-01',
      semester: '2nd',
    });

    expect(created.startDate).toBe('2026-08-01');
    expect(created.endDate).toBeNull();
  });

  it('allows only an end date', async () => {
    const { service } = buildService();

    const created = await service.create({
      termName: 'Summer',
      schoolYear: '2026-2027',
      endDate: '2026-12-15',
      semester: 'summer',
    });

    expect(created.startDate).toBeNull();
    expect(created.endDate).toBe('2026-12-15');
  });

  it.each([
    ['equal', '2026-12-15', '2026-12-15'],
    ['earlier', '2026-12-16', '2026-12-15'],
  ])(
    'rejects an end date %s to or before the start date',
    async (_case, startDate, endDate) => {
      const { service } = buildService();

      await expect(
        service.create({
          termName: '1st Semester',
          schoolYear: '2026-2027',
          startDate,
          endDate,
          semester: '1st',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

describe('TermsService semester validation', () => {
  it('rejects a semester type that is not in the catalog', async () => {
    const { service } = buildService();

    await expect(
      service.create({
        termName: 'Third',
        schoolYear: '2026-2027',
        semester: '3rd',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a newly added 3rd semester', async () => {
    const { service } = buildService(['1st', '2nd', 'summer', '3rd']);

    const created = await service.create({
      termName: 'Third Semester',
      schoolYear: '2026-2027',
      semester: '3rd',
    } as any);

    expect(created.semester).toBe('3rd');
  });
});
