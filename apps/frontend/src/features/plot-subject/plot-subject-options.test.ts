import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlotSubjectOptions,
  matchesPlotSubjectFilter,
  resolvePlotScheduleDeptId,
  type PlotSubjectCatalogRecord,
  type PlotProgramRecord,
  type PlotProspectusRow,
} from './plot-subject-options.ts';

const pathfit: PlotSubjectCatalogRecord = {
  subjectId: '28',
  subjectCode: 'PATHFit 1',
  title: 'Movement and Competency Training',
  lectureUnits: 1,
  labUnits: 0,
  deptId: '1',
};

const eeProgram: PlotProgramRecord = {
  programId: '3',
  deptId: '2',
  isActive: true,
};

test('a foreign minor in the EE prospectus is offered under the EE department filter', () => {
  const [option] = buildPlotSubjectOptions(
    [pathfit],
    [
      {
        subjectId: '28',
        programId: '3',
        yearLevel: 1,
        semester: '1st',
        isActive: true,
        lectureSessionsPerWeek: 1,
        labSessionsPerWeek: 1,
      },
    ],
    [eeProgram],
  );

  assert.deepEqual(option.prospectusDeptIds, ['2']);
  assert.equal(option.deptId, '1');
  assert.deepEqual(option.prospectusYears, [{ yearLevel: 1, semester: '1st' }]);
  assert.equal(
    matchesPlotSubjectFilter(option, {
      filterDept: '2',
      filterYear: '1',
      filterSem: '1st',
    }),
    true,
  );
});

test('catalog subjects absent from the prospectus are not offered', () => {
  const options = buildPlotSubjectOptions(
    [
      pathfit,
      {
        subjectId: '99',
        subjectCode: 'FREE 1',
        title: 'Catalog only',
        lectureUnits: 1,
        labUnits: 0,
        deptId: '2',
      },
    ],
    [
      {
        subjectId: '28',
        programId: '3',
        yearLevel: 1,
        semester: '1st',
        isActive: true,
      },
    ],
    [eeProgram],
  );

  assert.deepEqual(
    options.map((option) => option.subjectId),
    ['28'],
  );
});

test('inactive prospectus rows and inactive programs do not create options', () => {
  const rows: PlotProspectusRow[] = [
    {
      subjectId: '28',
      programId: '3',
      yearLevel: 1,
      semester: '1st',
      isActive: false,
    },
  ];

  assert.deepEqual(buildPlotSubjectOptions([pathfit], rows, [eeProgram]), []);
  assert.deepEqual(
    buildPlotSubjectOptions(
      [pathfit],
      [{ ...rows[0], isActive: true }],
      [{ ...eeProgram, isActive: false }],
    ),
    [],
  );
});

test('a subject shared by two programs exposes both program departments and unique year rows', () => {
  const [option] = buildPlotSubjectOptions(
    [pathfit],
    [
      {
        subjectId: '28',
        programId: '3',
        yearLevel: 1,
        semester: '1st',
        isActive: true,
      },
      {
        subjectId: '28',
        programId: '4',
        yearLevel: 1,
        semester: '1st',
        isActive: true,
      },
      {
        subjectId: '28',
        programId: '4',
        yearLevel: 2,
        semester: '2nd',
        isActive: true,
      },
    ],
    [
      eeProgram,
      { programId: '4', deptId: '1', isActive: true },
    ],
  );

  assert.deepEqual(option.prospectusDeptIds, ['2', '1']);
  assert.deepEqual(option.prospectusYears, [
    { yearLevel: 1, semester: '1st' },
    { yearLevel: 2, semester: '2nd' },
  ]);
});

test('plot schedule department follows the acting department head', () => {
  assert.equal(
    resolvePlotScheduleDeptId('1', {
      role: 'department_head',
      deptId: 2,
    }),
    '2',
  );
  assert.equal(
    resolvePlotScheduleDeptId('1', { role: 'college_dean', deptId: null }),
    '1',
  );
});

test('filtering falls back to catalog department for options without prospectus departments', () => {
  const option = buildPlotSubjectOptions(
    [pathfit],
    [
      {
        subjectId: '28',
        programId: '3',
        yearLevel: 1,
        semester: '1st',
        isActive: true,
      },
    ],
    [eeProgram],
  );

  assert.equal(
    matchesPlotSubjectFilter(
      { ...option[0], prospectusDeptIds: undefined },
      { filterDept: '1', filterYear: '', filterSem: '' },
    ),
    true,
  );
  assert.equal(
    matchesPlotSubjectFilter(option[0], {
      filterDept: '1',
      filterYear: '',
      filterSem: '',
    }),
    false,
  );
});
