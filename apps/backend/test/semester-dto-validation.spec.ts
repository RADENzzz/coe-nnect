import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateTermDto } from '../src/modules/terms/dto/create-term.dto';
import { CreateProspectusDto } from '../src/modules/prospectus/dto/create-prospectus.dto';
import { CreateSubjectDto } from '../src/modules/subjects/dto/create-subject.dto';
import {
  ColumnSliceDto,
  CreateTableDto,
} from '../src/modules/prospectus-pdfs/dto/create-table.dto';

const drafts = [
  {
    name: 'CreateTermDto',
    field: 'semester',
    dto: () =>
      Object.assign(new CreateTermDto(), {
        termName: 'Third Semester',
        schoolYear: '2026-2027',
      }),
  },
  {
    name: 'CreateProspectusDto',
    field: 'semester',
    dto: () =>
      Object.assign(new CreateProspectusDto(), {
        programId: '10',
        subjectId: '1',
        yearLevel: 1,
      }),
  },
  {
    name: 'CreateSubjectDto',
    field: 'electiveSemester',
    dto: () =>
      Object.assign(new CreateSubjectDto(), {
        subjectCode: 'GEC 101',
        title: 'Ethics',
        totalUnits: 3,
        lectureUnits: 3,
        labUnits: 0,
        deptId: '7',
      }),
  },
  {
    name: 'CreateTableDto',
    field: 'semester',
    dto: () =>
      Object.assign(new CreateTableDto(), {
        year_level: 1,
        region_page_index: 0,
        region_x_start_pt: 40,
        region_x_end_pt: 520,
        region_y_start_pt: 300,
        region_y_end_pt: 700,
        columns: [
          Object.assign(new ColumnSliceDto(), {
            role: 'code',
            x_start_pt: 40,
            x_end_pt: 120,
          }),
        ],
        rows: [],
      }),
  },
];

describe('create DTO semester validation', () => {
  it.each(drafts)('accepts 3rd on $name', async ({ dto, field }) => {
    expect(await validate(Object.assign(dto(), { [field]: '3rd' }))).toEqual([]);
  });

  it.each(drafts)('rejects a malformed code on $name', async ({ dto, field }) => {
    const errors = await validate(
      Object.assign(dto(), { [field]: '3RD!' }),
    );
    expect(errors.some((error) => error.property === field)).toBe(true);
  });
});
