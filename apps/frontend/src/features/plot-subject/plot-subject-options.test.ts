import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPlotSubjectOptions,
  describePlotScheduleDestination,
  matchesPlotSubjectFilter,
  resolvePlotScheduleDeptId,
  type PlotDepartmentRecord,
  type PlotSubjectCatalogRecord,
  type PlotProgramRecord,
  type PlotProspectusRow,
} from './plot-subject-options.ts';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

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

const departments: PlotDepartmentRecord[] = [
  { deptId: '1', deptCode: 'CPE', deptName: 'Computer Engineering' },
  { deptId: '2', deptCode: 'EE', deptName: 'Electrical Engineering' },
];

test('a foreign minor shows its catalog owner and EE destination', () => {
  assert.deepEqual(
    describePlotScheduleDestination(
      '1',
      { role: 'department_head', deptId: '2' },
      departments,
    ),
    {
      scheduleDeptId: '2',
      scheduleDeptLabel: '[EE] Electrical Engineering',
      catalogDeptLabel: '[CPE] Computer Engineering',
      isForeign: true,
    },
  );
});

test('a subject cataloged by the acting department needs no provenance note', () => {
  const result = describePlotScheduleDestination(
    '2',
    { role: 'department_head', deptId: 2 },
    departments,
  );
  assert.equal(result?.isForeign, false);
  assert.equal(result?.catalogDeptLabel, null);
  assert.equal(result?.scheduleDeptLabel, '[EE] Electrical Engineering');
});

test('missing department records fall back to an id label', () => {
  const result = describePlotScheduleDestination(
    '1',
    { role: 'department_head', deptId: '9' },
    departments,
  );
  assert.equal(result?.scheduleDeptLabel, '#9');
  assert.equal(result?.catalogDeptLabel, '[CPE] Computer Engineering');
  assert.equal(result?.isForeign, true);
});

test('no selected subject has no destination', () => {
  assert.equal(
    describePlotScheduleDestination(null, {
      role: 'department_head',
      deptId: '2',
    }, departments),
    null,
  );
});

test('a college role plots under the catalog owner', () => {
  const result = describePlotScheduleDestination(
    '1',
    { role: 'college_dean', deptId: null },
    departments,
  );
  assert.equal(result?.scheduleDeptId, '1');
  assert.equal(result?.isForeign, false);
});

test('editing an existing row shows its department as the destination', () => {
  const result = describePlotScheduleDestination(
    '1',
    { role: 'college_dean', deptId: null },
    departments,
    '2',
  );
  assert.deepEqual(result, {
    scheduleDeptId: '2',
    scheduleDeptLabel: '[EE] Electrical Engineering',
    catalogDeptLabel: '[CPE] Computer Engineering',
    isForeign: true,
  });
});

test('a selected subject without a catalog department still has a destination', () => {
  const result = describePlotScheduleDestination(
    '',
    { role: 'department_head', deptId: '2' },
    departments,
  );
  assert.equal(result?.scheduleDeptId, '2');
  assert.equal(result?.catalogDeptLabel, null);
  assert.equal(result?.isForeign, false);
});

test('plot modal renders conditional provenance under the picker and destination near submit', () => {
  const modal = read(
    'apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx',
  );

  assert.match(modal, /describePlotScheduleDestination\(/);
  assert.match(modal, /provenance\?\.isForeign && \(/);
  assert.match(modal, /\{provenance && \(/);
  assert.match(modal, /Cataloged under/);
  assert.match(modal, /Destination:/);
  assert.doesNotMatch(modal, /setProvenance|localToast|toastState/);
  assert.doesNotMatch(modal, /\b(alert|confirm|prompt)\s*\(/);
});
