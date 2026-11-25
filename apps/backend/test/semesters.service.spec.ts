import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SemestersService } from '../src/modules/semesters/semesters.service';
import { createFakeRepository } from './fakes/repository.fake';

const SEED = [
  { code: '1st', label: 'First Semester', shortLabel: '1st', sortOrder: 10, isActive: true },
  { code: '2nd', label: 'Second Semester', shortLabel: '2nd', sortOrder: 20, isActive: true },
  { code: 'summer', label: 'Summer', shortLabel: 'Summer', sortOrder: 30, isActive: true },
];

function build() {
  // semester_type's primary key is `code`, not the fake's default `id`.
  const repo = createFakeRepository(SEED, { idKey: 'code' });
  const terms = createFakeRepository([], { idKey: 'termId' });
  const prospectus = createFakeRepository([], { idKey: 'prospectusId' });
  const pdfTables = createFakeRepository([], { idKey: 'tableId' });
  const subjects = createFakeRepository([], { idKey: 'subjectId' });

  return {
    repo,
    terms,
    prospectus,
    pdfTables,
    subjects,
    service: new SemestersService(
      repo as any,
      terms as any,
      prospectus as any,
      pdfTables as any,
      subjects as any,
    ),
  };
}

describe('SemestersService', () => {
  it('normalizes a new code and appends the sort order', async () => {
    const { service } = build();
    const created = await service.create({
      code: ' 3RD ',
      label: 'Third Semester',
      shortLabel: '3rd',
    });

    expect(created.code).toBe('3rd');
    expect(created.sortOrder).toBe(40);
    expect(created.isActive).toBe(true);
  });

  it('rejects a duplicate code', async () => {
    const { service } = build();
    await expect(
      service.create({ code: '1st', label: 'First', shortLabel: '1st' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code with spaces', async () => {
    const { service } = build();
    await expect(
      service.create({
        code: 'third semester',
        label: 'Third Semester',
        shortLabel: '3rd',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the label without touching the code', async () => {
    const { service } = build();
    const updated = await service.update('summer', {
      label: 'Midyear Term',
      shortLabel: 'Midyear',
    });

    expect(updated.code).toBe('summer');
    expect(updated.label).toBe('Midyear Term');
  });

  it('reorders every type and rejects an incomplete list', async () => {
    const { service } = build();
    const reordered = await service.reorder(['summer', '1st', '2nd']);

    expect(reordered.map((t) => t.code)).toEqual(['summer', '1st', '2nd']);
    expect(reordered.map((t) => t.sortOrder)).toEqual([10, 20, 30]);

    await expect(service.reorder(['summer'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks deletion while any table references the type', async () => {
    const { service, terms, prospectus } = build();
    terms.rows.push({ termId: '1', semester: 'summer' });
    prospectus.rows.push({ prospectusId: '1', semester: 'summer' });

    await expect(service.remove('summer')).rejects.toThrow(
      /used by 1 prospectus row and 1 term/i,
    );
  });

  it('deletes an unused type', async () => {
    const { service } = build();
    await expect(service.remove('summer')).resolves.toEqual({ success: true });
  });

  it('rejects an unknown or inactive type in assertUsable', async () => {
    const { service, repo } = build();
    await expect(service.assertUsable('3rd')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repo.rows[0].isActive = false;
    await expect(service.assertUsable('1st')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an active type in assertUsable', async () => {
    const { service } = build();
    await expect(service.assertUsable('2nd')).resolves.toBeUndefined();
  });

  it('locks every catalog change while a term is active', async () => {
    const { service, terms } = build();
    terms.rows.push({
      termId: 't1',
      termName: 'First Semester 2026-2027',
      isActive: true,
    });

    await expect(
      service.create({ code: '3rd', label: 'Third Semester', shortLabel: '3rd' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update('summer', { label: 'Midyear Term' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.reorder(['summer', '1st', '2nd']),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('summer')).rejects.toThrow(
      /locked while "First Semester 2026-2027" is active/i,
    );
  });

  it('allows catalog changes again after the term is deactivated', async () => {
    const { service, terms } = build();
    terms.rows.push({
      termId: 't1',
      termName: 'First Semester 2026-2027',
      isActive: false,
    });

    await expect(
      service.update('summer', { label: 'Midyear Term' }),
    ).resolves.toMatchObject({ label: 'Midyear Term' });
  });
});
