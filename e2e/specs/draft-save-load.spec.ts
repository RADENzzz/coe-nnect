import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  expect,
  test,
  type APIResponse,
  type Page,
} from '@playwright/test';

import { loadE2eEnv, optionalEnv, requireEnv } from '../env';
import { E2E_DATA, E2E_SCHEDULE, type E2eState } from '../seed';
import {
  e2eState,
  loginAs,
  openTimetable,
  scheduleBlock,
} from './helpers';

/**
 * Term-scoped named drafts through the real More-menu flows. The spec owns all
 * fixtures and resets them before each scenario, so it never depends on the
 * order of the other E2E specs and leaves the seeded term active for cleanup.
 */
test.describe.configure({ mode: 'serial' });

const DRAFT_TERM = {
  termName: 'E2E Draft Swap Term',
  schoolYear: '2026-2027',
  semester: '1st',
} as const;
const REQUEST_DEPT_CODE = 'E2E-DRAFT-REQ';
const REQUEST_DEPT_NAME = 'E2E Draft Request Department';

type JsonRecord = Record<string, any>;
type Db = SupabaseClient<any, 'public', any>;
type ScheduleStatus = 'draft' | 'review' | 'finalized' | 'published';
type SnapshotSummary = {
  snapshotId: string;
  termId: string;
  termName: string;
  semester: string | null;
  schoolYear: string;
  name: string;
  entryCount: number;
  createdAt: string;
};
type DraftLoadResult = {
  matched: number;
  ready: number;
  create: number;
  update: number;
  remove: number;
  keptAsIs: number;
  warnings: number;
  conflicts: JsonRecord[];
  failed: boolean;
  summary: string;
};

let state: E2eState;
let db: Db;
let draftTermId: string;
let requestDeptId: string;
let sectionId: string;

function apiUrl(path: string): string {
  const base = optionalEnv('E2E_API_URL', 'http://127.0.0.1:3100/api').replace(
    /\/+$/,
    '',
  );
  return `${base}${path}`;
}

async function blockFonts(page: Page): Promise<void> {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.abort(),
  );
}

async function authToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) =>
      item.includes('auth-token'),
    );
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as JsonRecord).access_token ?? null;
    } catch {
      return null;
    }
  });
  if (!token) throw new Error('No Supabase access token in browser storage');
  return String(token);
}

async function postJson(
  page: Page,
  path: string,
  body: JsonRecord,
): Promise<APIResponse> {
  return page.request.post(apiUrl(path), {
    headers: { Authorization: `Bearer ${await authToken(page)}` },
    data: body,
  });
}

const moreItem = (page: Page, name: string) =>
  page
    .getByRole('menu', { name: 'More actions' })
    .getByRole('menuitem', { name, exact: true });

const openMore = async (page: Page) =>
  page.getByRole('button', { name: 'More', exact: true }).click();

const draftDrawer = (page: Page) =>
  page.getByRole('dialog', { name: 'Saved timetable drafts' });

const statusMessages = (page: Page) =>
  page.locator('[aria-label="Status messages"]');

async function openDrafts(page: Page) {
  await openMore(page);
  await moreItem(page, 'Load drafts…').click();
  const drawer = draftDrawer(page);
  await expect(drawer).toBeVisible();
  return drawer;
}

const draftPreview = (page: Page) =>
  page.getByRole('dialog', { name: 'Saved draft preview' });

async function clickDraftAction(
  drawer: ReturnType<typeof draftDrawer>,
  name: string,
  action: 'View saved rows' | 'Compare' | 'Delete',
) {
  const row = drawer.locator('li').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: action, exact: true }).click();
  return row;
}

async function savedNames(
  drawer: ReturnType<typeof draftDrawer>,
): Promise<string[]> {
  return drawer.locator('li p.font-bold').allTextContents();
}

async function saveThroughUi(page: Page, name: string): Promise<SnapshotSummary> {
  await openMore(page);
  await moreItem(page, 'Save as draft…').click();

  const dialog = page.getByRole('dialog', { name: 'Save timetable draft' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Draft name').fill(name);

  const responsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/draft-snapshots$/.test(response.url()) &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(dialog).toBeHidden();

  return ((await response.json()) as JsonRecord).data as SnapshotSummary;
}

async function preflightThroughUi(
  page: Page,
  drawer: ReturnType<typeof draftDrawer>,
  name: string,
): Promise<DraftLoadResult> {
  const row = drawer.locator('li').filter({ hasText: name }).first();
  await expect(row).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/draft-snapshots\/[^/]+\/preflight$/.test(
        response.url(),
      ) && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await row.getByRole('button', { name: 'Load', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as JsonRecord).data as DraftLoadResult;
}

async function deleteByTerm(
  database: Db,
  table: string,
  termId: string,
): Promise<void> {
  const { error } = await database.from(table).delete().eq('term_id', termId);
  if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
}

async function clearTerm(database: Db, termId: string): Promise<void> {
  const { data: rows, error: listError } = await database
    .from('schedule')
    .select('schedule_id')
    .eq('term_id', termId);
  if (listError) {
    throw new Error(`Could not list schedules: ${listError.message}`);
  }

  const scheduleIds = (rows ?? []).map((row) => String(row.schedule_id));
  if (scheduleIds.length > 0) {
    for (const table of [
      'schedule_publish_request',
      'schedule_change_request',
      'schedule_unfinalize_request',
    ]) {
      const { error } = await database
        .from(table)
        .delete()
        .in('schedule_id', scheduleIds);
      if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
    }
  }

  await deleteByTerm(database, 'term_draft_snapshot', termId);
  await deleteByTerm(database, 'faculty_request', termId);
  await deleteByTerm(database, 'schedule', termId);
  await deleteByTerm(database, 'schedule_version', termId);
  await deleteByTerm(database, 'term_published_version', termId);
  await deleteByTerm(database, 'schedule_unscheduled', termId);
  await deleteByTerm(database, 'auto_generate_lock', termId);
}

async function setActiveTerm(termId: string): Promise<void> {
  const { error: deactivateError } = await db
    .from('term')
    .update({ is_active: false })
    .neq('term_id', 0);
  if (deactivateError) {
    throw new Error(`Could not deactivate terms: ${deactivateError.message}`);
  }
  const { error: activateError } = await db
    .from('term')
    .update({ is_active: true })
    .eq('term_id', termId);
  if (activateError) {
    throw new Error(`Could not activate term ${termId}: ${activateError.message}`);
  }
}

async function resetFixtures(): Promise<void> {
  await clearTerm(db, state.termId);
  await clearTerm(db, draftTermId);
  await setActiveTerm(state.termId);
}

async function insertSchedule(params: {
  day: string;
  start: string;
  end: string;
  status: ScheduleStatus;
  section?: string;
  sectionId?: string | null;
}): Promise<string> {
  const { data, error } = await db
    .from('schedule')
    .insert({
      term_id: state.termId,
      subject_id: state.subjectId,
      faculty_id: state.facultyId,
      external_faculty_name: null,
      room_id: state.roomId,
      external_room_name: null,
      timeslot_id: null,
      section: params.section ?? state.sectionCode,
      section_id:
        params.sectionId === undefined ? sectionId : params.sectionId,
      dept_id: state.departmentId,
      load_type: 'lecture',
      day_of_week: params.day,
      start_time: params.start,
      end_time: params.end,
      remarks: null,
      status: params.status,
    })
    .select('schedule_id')
    .single();
  if (error || !data) {
    throw new Error(`Could not insert schedule fixture: ${error?.message ?? 'none'}`);
  }
  return String(data.schedule_id);
}

async function updateSchedule(
  scheduleId: string,
  values: JsonRecord,
): Promise<void> {
  const { error } = await db
    .from('schedule')
    .update(values)
    .eq('schedule_id', scheduleId);
  if (error) throw new Error(`Could not update schedule: ${error.message}`);
}

async function scheduleStatus(scheduleId: string): Promise<string> {
  const { data, error } = await db
    .from('schedule')
    .select('status')
    .eq('schedule_id', scheduleId)
    .single();
  if (error || !data) {
    throw new Error(`Could not read schedule: ${error?.message ?? 'none'}`);
  }
  return String(data.status);
}

async function liveSchedules(): Promise<JsonRecord[]> {
  const { data, error } = await db
    .from('schedule')
    .select('*')
    .eq('term_id', state.termId);
  if (error) throw new Error(`Could not list schedules: ${error.message}`);
  return (data ?? []) as JsonRecord[];
}

async function insertPendingRequest(scheduleId: string): Promise<string> {
  const { data, error } = await db
    .from('faculty_request')
    .insert({
      requesting_dept_id: requestDeptId,
      target_dept_id: state.departmentId,
      faculty_id: state.facultyId,
      subject_id: state.subjectId,
      term_id: state.termId,
      reason: 'E2E draft-load guard',
      status: 'pending',
    })
    .select('request_id')
    .single();
  if (error || !data) {
    throw new Error(`Could not insert faculty request: ${error?.message ?? 'none'}`);
  }
  const requestId = String(data.request_id);
  await updateSchedule(scheduleId, {
    pending_faculty_request_id: requestId,
    pending_faculty_dept_id: requestDeptId,
  });
  return requestId;
}

test.beforeAll(async () => {
  loadE2eEnv();
  state = e2eState();
  db = createClient(
    requireEnv('E2E_SUPABASE_URL'),
    requireEnv('E2E_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const existingTerm = await db
    .from('term')
    .select('term_id')
    .eq('term_name', DRAFT_TERM.termName)
    .eq('school_year', DRAFT_TERM.schoolYear)
    .maybeSingle();
  if (existingTerm.error) {
    throw new Error(`Could not find draft term: ${existingTerm.error.message}`);
  }
  if (existingTerm.data) {
    draftTermId = String(existingTerm.data.term_id);
  } else {
    const { data, error } = await db
      .from('term')
      .insert({
        term_name: DRAFT_TERM.termName,
        school_year: DRAFT_TERM.schoolYear,
        start_date: '2026-08-01',
        end_date: '2026-12-20',
        is_active: false,
        semester: DRAFT_TERM.semester,
      })
      .select('term_id')
      .single();
    if (error || !data) {
      throw new Error(`Could not create draft term: ${error?.message ?? 'none'}`);
    }
    draftTermId = String(data.term_id);
  }

  const existingDept = await db
    .from('department')
    .select('dept_id')
    .eq('dept_code', REQUEST_DEPT_CODE)
    .maybeSingle();
  if (existingDept.error) {
    throw new Error(`Could not find request department: ${existingDept.error.message}`);
  }
  if (existingDept.data) {
    requestDeptId = String(existingDept.data.dept_id);
  } else {
    const { data, error } = await db
      .from('department')
      .insert({
        dept_code: REQUEST_DEPT_CODE,
        dept_name: REQUEST_DEPT_NAME,
        description: 'Disposable department for draft-load faculty request tests.',
        is_active: true,
      })
      .select('dept_id')
      .single();
    if (error || !data) {
      throw new Error(`Could not create request department: ${error?.message ?? 'none'}`);
    }
    requestDeptId = String(data.dept_id);
  }

  const section = await db
    .from('section')
    .select('section_id')
    .eq('section_code', state.sectionCode)
    .maybeSingle();
  if (section.error || !section.data) {
    throw new Error(`Could not find E2E section: ${section.error?.message ?? 'none'}`);
  }
  sectionId = String(section.data.section_id);

  await resetFixtures();
});

test.afterAll(async () => {
  if (!db) return;
  await resetFixtures();
  const { error: termError } = await db
    .from('term')
    .delete()
    .eq('term_id', draftTermId);
  if (termError) throw new Error(`Could not remove draft term: ${termError.message}`);
  const { error: deptError } = await db
    .from('department')
    .delete()
    .eq('dept_id', requestDeptId);
  if (deptError) {
    throw new Error(`Could not remove request department: ${deptError.message}`);
  }
});

test.beforeEach(async ({ page }) => {
  await blockFonts(page);
  await resetFixtures();
});

test('saves named drafts with the term year and semester label', async ({
  page,
}) => {
  await insertSchedule({
    day: E2E_SCHEDULE.day,
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });

  await loginAs(page, 'head');
  await openTimetable(page);
  await expect(scheduleBlock(page)).toBeVisible();

  const saved = await saveThroughUi(page, 'Working A');
  expect(saved.name).toBe('Working A');
  expect(saved.entryCount).toBe(1);
  await expect(statusMessages(page)).toContainText('Working A');
  await expect(statusMessages(page)).toContainText(E2E_DATA.termName);

  const drawer = await openDrafts(page);
  await expect(drawer).toContainText(E2E_DATA.schoolYear);
  await expect(drawer).toContainText('1st');
  await expect(drawer).toContainText(E2E_DATA.termName);
  await expect(drawer).toContainText('Working A');
});

test('blocks load when the saved draft conflicts with itself', async ({
  page,
}) => {
  await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });
  await insertSchedule({
    day: 'Monday',
    start: '10:30:00',
    end: '12:00:00',
    status: 'draft',
  });

  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Overlap Draft');

  const drawer = await openDrafts(page);
  const preflight = await preflightThroughUi(page, drawer, 'Overlap Draft');
  expect(preflight.failed).toBeTruthy();
  expect(preflight.conflicts.length).toBeGreaterThan(0);
  expect(
    preflight.conflicts.some((conflict) => /H-1/.test(String(conflict.reason))),
  ).toBeTruthy();

  const dialog = page.getByRole('dialog', { name: 'Load Overlap Draft' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Draft load blocked');
  await expect(dialog).toContainText(/H-1|Faculty Overlap/);
  await expect(
    dialog.getByRole('button', { name: 'Load this draft' }),
  ).toBeDisabled();

  const rows = await liveSchedules();
  expect(rows.map((row) => row.status).sort()).toEqual(['draft', 'draft']);
});

test('blocks load when a live row is finalized or has a pending faculty request', async ({
  page,
}) => {
  const scheduleId = await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });

  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Blocked Target');

  let drawer = await openDrafts(page);
  await updateSchedule(scheduleId, { status: 'finalized' });
  let preflight = await preflightThroughUi(page, drawer, 'Blocked Target');
  expect(preflight.failed).toBeTruthy();
  expect(
    preflight.conflicts.some((conflict) =>
      /finalized or published/.test(String(conflict.reason)),
    ),
  ).toBeTruthy();

  let dialog = page.getByRole('dialog', { name: 'Load Blocked Target' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('finalized or published');
  await expect(
    dialog.getByRole('button', { name: 'Load this draft' }),
  ).toBeDisabled();
  expect(await scheduleStatus(scheduleId)).toBe('finalized');

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await updateSchedule(scheduleId, { status: 'draft' });
  const requestId = await insertPendingRequest(scheduleId);
  preflight = await preflightThroughUi(page, drawer, 'Blocked Target');
  expect(preflight.failed).toBeTruthy();
  expect(
    preflight.conflicts.some((conflict) =>
      /pending faculty request/.test(String(conflict.reason)),
    ),
  ).toBeTruthy();

  dialog = page.getByRole('dialog', { name: 'Load Blocked Target' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('pending faculty request');
  await expect(
    dialog.getByRole('button', { name: 'Load this draft' }),
  ).toBeDisabled();
  expect(await scheduleStatus(scheduleId)).toBe('draft');

  const liveRow = (await liveSchedules()).find(
    (row) => String(row.schedule_id) === scheduleId,
  );
  expect(String(liveRow?.pending_faculty_request_id)).toBe(requestId);
  const { data: pending, error: pendingError } = await db
    .from('faculty_request')
    .select('status')
    .eq('request_id', requestId)
    .single();
  expect(pendingError).toBeNull();
  expect(String(pending?.status)).toBe('pending');
});

test('restores saved draft and review rows without touching published rows', async ({
  page,
}) => {
  const publishedId = await insertSchedule({
    day: 'Friday',
    start: '13:00:00',
    end: '14:30:00',
    status: 'published',
    section: 'E2E-DRAFT-PUB',
    sectionId: null,
  });
  const draftId = await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });
  const reviewId = await insertSchedule({
    day: 'Tuesday',
    start: '08:00:00',
    end: '09:30:00',
    status: 'review',
  });

  await loginAs(page, 'head');
  await openTimetable(page);
  const saved = await saveThroughUi(page, 'Restore A');
  expect(saved.entryCount).toBe(2);

  const { error: deleteError } = await db
    .from('schedule')
    .delete()
    .eq('schedule_id', draftId);
  expect(deleteError).toBeNull();
  await updateSchedule(reviewId, {
    day_of_week: 'Wednesday',
    start_time: '09:30:00',
    end_time: '11:00:00',
  });
  const extraId = await insertSchedule({
    day: 'Wednesday',
    start: '13:00:00',
    end: '14:30:00',
    status: 'draft',
    section: 'E2E-DRAFT-EXTRA',
    sectionId: null,
  });

  const drawer = await openDrafts(page);
  const preflight = await preflightThroughUi(page, drawer, 'Restore A');
  expect(preflight.failed).toBeFalsy();
  expect(preflight.conflicts).toEqual([]);
  expect(preflight.remove).toBeGreaterThanOrEqual(1);

  const dialog = page.getByRole('dialog', { name: 'Load Restore A' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Load this draft' }),
  ).toBeEnabled();

  const responsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/draft-snapshots\/[^/]+\/load$/.test(response.url()) &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: 'Load this draft' }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  const applied = ((await response.json()) as JsonRecord).data as DraftLoadResult;
  expect(applied.failed).toBeFalsy();
  expect(applied.conflicts).toEqual([]);
  await expect(dialog).toBeHidden();
  await expect(statusMessages(page)).toContainText('Restore A');
  await expect(statusMessages(page)).toContainText(E2E_DATA.termName);

  const rows = await liveSchedules();
  const restored = rows.filter(
    (row) => String(row.schedule_id) !== publishedId,
  );
  expect(restored.map((row) => row.status).sort()).toEqual(['draft', 'review']);
  expect(
    restored.map((row) => `${row.day_of_week} ${row.start_time}`).sort(),
  ).toEqual(['Monday 10:00:00', 'Tuesday 08:00:00']);
  expect(
    restored.some((row) => String(row.schedule_id) === extraId),
  ).toBeFalsy();

  const publishedRow = rows.find(
    (row) => String(row.schedule_id) === publishedId,
  );
  expect(String(publishedRow?.status)).toBe('published');
  expect(String(publishedRow?.day_of_week)).toBe('Friday');
  expect(String(publishedRow?.start_time)).toBe('13:00:00');
});

test('rejects loading a snapshot into a different term', async ({ page }) => {
  await insertSchedule({
    day: E2E_SCHEDULE.day,
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });

  await loginAs(page, 'head');
  await openTimetable(page);
  const saved = await saveThroughUi(page, 'Working A');

  await setActiveTerm(draftTermId);
  await loginAs(page, 'head');
  await openTimetable(page);

  const drawer = await openDrafts(page);
  await expect(drawer).toContainText(DRAFT_TERM.termName);
  await expect(drawer).toContainText('No saved drafts yet');
  await expect(drawer).not.toContainText('Working A');

  const response = await postJson(
    page,
    `/v1/schedules/draft-snapshots/${saved.snapshotId}/load`,
    {
      termId: draftTermId,
      deptId: state.departmentId,
      confirmed: true,
    },
  );
  expect(response.status()).toBe(409);
  expect(await response.text()).toContain('belongs to term');
});

test('views the full saved draft table', async ({ page }) => {
  await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });
  await insertSchedule({
    day: 'Tuesday',
    start: '13:00:00',
    end: '14:30:00',
    status: 'review',
  });

  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Preview Draft');

  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Preview Draft', 'View saved rows');
  const preview = draftPreview(page);
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('E2E 101');
  await expect(preview).toContainText('10:00 AM');
  await expect(preview).toContainText('1:00 PM');
});

test('compares a saved draft with the live timetable', async ({ page }) => {
  await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });
  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Compare Live');

  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Compare Live', 'Compare');
  const picker = page.getByRole('dialog', {
    name: 'Choose a draft to compare',
  });
  await expect(picker).toBeVisible();

  const compareResponse = page.waitForResponse(
    (response) => /\/v1\/schedules\/version-compare/.test(response.url()),
    { timeout: 30_000 },
  );
  await picker
    .getByRole('button', { name: 'Live timetable', exact: true })
    .click();
  expect((await compareResponse).ok()).toBeTruthy();

  const compare = page.getByRole('dialog', { name: 'Compare sources' });
  await expect(compare).toContainText('Compare Live');
  await expect(compare).toContainText('Live timetable');
});

test('compares two saved drafts', async ({ page }) => {
  const scheduleId = await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });
  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Before Draft');

  await updateSchedule(scheduleId, {
    day_of_week: 'Tuesday',
    start_time: '13:00:00',
    end_time: '14:30:00',
  });
  await saveThroughUi(page, 'After Draft');

  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Before Draft', 'Compare');
  const picker = page.getByRole('dialog', {
    name: 'Choose a draft to compare',
  });
  await picker.getByRole('button', { name: 'After Draft', exact: true }).click();

  const compare = page.getByRole('dialog', { name: 'Compare sources' });
  await expect(compare).toContainText('Before Draft');
  await expect(compare).toContainText('After Draft');
  await expect(compare).toContainText('added');
  await expect(compare).toContainText('removed');
});

test('deletes only the selected saved draft and leaves live rows unchanged', async ({
  page,
}) => {
  await insertSchedule({
    day: 'Monday',
    start: '10:00:00',
    end: '11:30:00',
    status: 'draft',
  });
  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Keep Me');
  await saveThroughUi(page, 'Remove Me');

  const liveBefore = await liveSchedules();
  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Remove Me', 'Delete');

  let dialog = page.getByRole('dialog', { name: 'Delete saved draft?' });
  await expect(dialog).toContainText('Remove Me');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await savedNames(drawer)).toContain('Remove Me');

  await clickDraftAction(drawer, 'Remove Me', 'Delete');
  dialog = page.getByRole('dialog', { name: 'Delete saved draft?' });
  const deleteResponse = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/draft-snapshots\/[^/]+/.test(response.url()) &&
      response.request().method() === 'DELETE',
    { timeout: 30_000 },
  );
  await dialog
    .getByRole('button', { name: 'Delete saved draft', exact: true })
    .click();
  expect((await deleteResponse).ok()).toBeTruthy();
  await expect(dialog).toBeHidden();

  expect(await savedNames(drawer)).not.toContain('Remove Me');
  expect(await savedNames(drawer)).toContain('Keep Me');
  expect(await liveSchedules()).toEqual(liveBefore);
});
