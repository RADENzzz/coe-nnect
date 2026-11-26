import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { loadE2eEnv, optionalEnv, requireEnv } from '../env';
import { E2E_DATA, E2E_SCHEDULE, type E2eState } from '../seed';
import {
  e2eState,
  gotoApp,
  loginAs,
  openScheduleDetails,
  openTimetable,
  scheduleBlock,
  selectById,
  selectTime,
} from './helpers';

/**
 * Published-version archive, term save-and-swap, and reuse through the real
 * browser flows. The spec owns every fixture it needs and restores a clean
 * E2E term in afterAll, so it never depends on another spec having run first
 * and leaves `workflow.spec.ts` able to plot its own row.
 *
 * Snapshot-only fixtures (older school year, out-of-prospectus subject, and a
 * deliberately invalid meeting time) are created with the Supabase admin
 * client because the UI cannot produce them: plot validation rejects a 60
 * minute lecture, a subject absent from the prospectus cannot be plotted, and
 * an older-year captured label would require waiting for a new school year.
 * No live published row is fabricated; all live rows come from plot, publish
 * approval, or the product's own restore path.
 */
test.describe.configure({ mode: 'serial' });

const SEMESTER = '1st';
const SWAP_TERM = { termName: 'E2E Swap Term', schoolYear: '2026-2027' } as const;
const ARCHIVE_TERM = {
  termName: 'E2E Archive 2025',
  schoolYear: '2025-2026',
} as const;
const CONFLICT_TERM = {
  termName: 'E2E Conflict 2025',
  schoolYear: '2025-2026',
} as const;
const EXTRA_SUBJECT_CODE = 'E2E 999';
const EXTRA_SECTION_CODE = 'E2E-REUSE-B';

type JsonRecord = Record<string, any>;
type Db = SupabaseClient<any, 'public', any>;
type VersionSummary = {
  versionId: string;
  termId: string | null;
  termName: string;
  semester: string | null;
  schoolYear: string;
  entryCount: number;
  stale: boolean;
  locked: boolean;
};
type VersionDetail = VersionSummary & { entries: JsonRecord[] };
type ReusePreflight = {
  matched: number;
  ready: number;
  skipped: number;
  keptAsIs: number;
  warnings: number;
  conflicts: JsonRecord[];
  failed: boolean;
  summary: string;
};
type ReuseApply = {
  created: JsonRecord[];
  updated: JsonRecord[];
  conflicts: JsonRecord[];
  failed: boolean;
};
type PlottedRow = { day: string; startLabel: string; endLabel: string };

const ROWS: PlottedRow[] = [
  {
    day: 'Monday',
    startLabel: E2E_SCHEDULE.startLabel,
    endLabel: E2E_SCHEDULE.endLabel,
  },
  { day: 'Tuesday', startLabel: '08:00 AM', endLabel: '09:30 AM' },
  { day: 'Wednesday', startLabel: '09:30 AM', endLabel: '11:00 AM' },
  { day: 'Thursday', startLabel: '11:00 AM', endLabel: '12:30 PM' },
];

let state: E2eState;
let db: Db;
let swapTermId: string;
let extraSectionId: string | null = null;
let extraSubjectId: string | null = null;
let currentVersionId: string | null = null;
let swapVersionId: string | null = null;
let archiveVersionId: string | null = null;
let conflictVersionId: string | null = null;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockLabel(row: PlottedRow): RegExp {
  return new RegExp(
    `${escapeRegExp(E2E_DATA.subjectCode)} ${escapeRegExp(
      E2E_DATA.sectionCode,
    )}, ${escapeRegExp(row.startLabel)} to ${escapeRegExp(row.endLabel)}`,
  );
}

async function blockFonts(page: Page): Promise<void> {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.abort(),
  );
}

/** A fresh, font-isolated browser context signed in as the requested role. */
async function rolePage(
  browser: Browser,
  role: 'head' | 'dean',
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await blockFonts(page);
  await loginAs(page, role);
  return { page, close: () => context.close() };
}

/** Call an app API with the Supabase token the browser stored at login. */
async function apiGet<T = JsonRecord>(
  page: Page,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
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

  const apiBase = optionalEnv(
    'E2E_API_URL',
    'http://127.0.0.1:3100/api',
  ).replace(/\/+$/, '');
  const response = await page.request.get(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(params ? { params } : {}),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as JsonRecord).data as T;
}

async function deleteByTerm(
  database: Db,
  table: string,
  termId: string,
): Promise<void> {
  const { error } = await database.from(table).delete().eq('term_id', termId);
  if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
}

/** Remove every live row and archive entry a term owns, plus request rows. */
async function clearTermWork(database: Db, termId: string): Promise<void> {
  const { data: rows, error: listError } = await database
    .from('schedule')
    .select('schedule_id')
    .eq('term_id', termId);
  if (listError) throw new Error(`Could not list schedules: ${listError.message}`);

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

  await deleteByTerm(database, 'schedule', termId);
  await deleteByTerm(database, 'schedule_version', termId);
  await deleteByTerm(database, 'term_published_version', termId);
  await deleteByTerm(database, 'schedule_unscheduled', termId);
  await deleteByTerm(database, 'auto_generate_lock', termId);
  await deleteByTerm(database, 'faculty_request', termId);
}

async function restoreCleanState(): Promise<void> {
  await clearTermWork(db, state.termId);
  await clearTermWork(db, swapTermId);
  for (const termName of [ARCHIVE_TERM.termName, CONFLICT_TERM.termName]) {
    const { error } = await db
      .from('term_published_version')
      .delete()
      .eq('term_name', termName);
    if (error) {
      throw new Error(`Could not clear fixture version ${termName}: ${error.message}`);
    }
  }
  if (extraSectionId) {
    const { error } = await db
      .from('section')
      .delete()
      .eq('section_id', extraSectionId);
    if (error) throw new Error(`Could not clear fixture section: ${error.message}`);
    extraSectionId = null;
  }
  if (extraSubjectId) {
    const { error } = await db
      .from('subject')
      .delete()
      .eq('subject_id', extraSubjectId);
    if (error) throw new Error(`Could not clear fixture subject: ${error.message}`);
    extraSubjectId = null;
  }
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
    .eq('term_id', state.termId);
  if (activateError) {
    throw new Error(`Could not reactivate E2E term: ${activateError.message}`);
  }
  const { error: departmentError } = await db
    .from('department')
    .update({ is_active: true })
    .eq('dept_id', state.departmentId);
  if (departmentError) {
    throw new Error(`Could not restore E2E department: ${departmentError.message}`);
  }
}

async function plottedSnapshot(): Promise<JsonRecord> {
  const { data, error } = await db
    .from('term_published_version')
    .select('snapshot')
    .eq('term_id', state.termId)
    .maybeSingle();
  if (error || !data?.snapshot) {
    throw new Error(`Missing saved version snapshot: ${error?.message ?? 'none'}`);
  }
  return data.snapshot as JsonRecord;
}

async function publishedEntry(snapshot: JsonRecord): Promise<JsonRecord> {
  const entries = (snapshot.entries ?? []) as JsonRecord[];
  const entry = entries.find((item) => item.status === 'published');
  if (!entry) throw new Error('Saved version has no published entry');
  return entry;
}

async function insertFixtureVersion(params: {
  termId: string | null;
  termName: string;
  semester: string;
  schoolYear: string;
  snapshot: JsonRecord;
}): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('term_published_version')
    .insert({
      term_id: params.termId,
      version_number: 1,
      term_name: params.termName,
      semester: params.semester,
      school_year: params.schoolYear,
      snapshot: params.snapshot,
      published_at: now,
      deactivated_at: null,
      updated_at: now,
      last_modified_by: null,
    })
    .select('term_published_version_id')
    .single();
  if (error || !data) {
    throw new Error(`Could not create fixture version: ${error?.message ?? 'none'}`);
  }
  return String(data.term_published_version_id);
}

async function plotRow(page: Page, row: PlottedRow): Promise<void> {
  await page.getByRole('button', { name: 'Plot Subject' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Plot a subject' });
  await expect(dialog).toBeVisible();

  await selectById(dialog, 'subjectId', state.subjectId);
  await selectById(dialog, 'section', state.sectionCode);
  await dialog.locator('select[name="loadType"]').selectOption('lecture');
  await dialog.locator('select[name="dayOfWeek"]').selectOption(row.day);
  await selectTime(page, 'Start time', row.startLabel);
  await selectTime(page, 'End time', row.endLabel);
  await selectById(dialog, 'facultyId', state.facultyId);
  await selectById(dialog, 'roomId', state.roomId);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/schedules/plot') &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: 'Plot subject' }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: blockLabel(row) })).toBeVisible();
}

async function setRowStatus(
  page: Page,
  row: PlottedRow,
  status: 'review' | 'finalized',
): Promise<void> {
  const block = page.getByRole('button', { name: blockLabel(row) });
  await expect(block).toBeVisible();
  await block.click({ force: true });
  const drawer = page.getByRole('dialog', { name: 'Class details' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('combobox').selectOption(status);
  await expect(drawer.getByRole('combobox')).toHaveValue(status);
  await drawer.getByLabel('Close').click();
  await expect(drawer).toBeHidden();
}

async function deanFinalize(browser: Browser): Promise<void> {
  const { page, close } = await rolePage(browser, 'dean');
  try {
    await gotoApp(page, '/dean/approvals');
    await expect(
      page.getByRole('heading', { name: /Approvals/i }),
    ).toBeVisible();
    await page
      .getByPlaceholder(/Subject code or title/)
      .fill(state.subjectCode);
    await expect(
      page.getByText(state.subjectCode, { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Row actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Finalize', exact: true }).click();
    await expect(
      page.getByText('No schedules match your filters.'),
    ).toBeVisible();
  } finally {
    await close();
  }
}

async function headRequestPublish(browser: Browser): Promise<void> {
  const { page, close } = await rolePage(browser, 'head');
  try {
    await openTimetable(page);
    await openScheduleDetails(page);
    const drawer = page.getByRole('dialog', { name: 'Class details' });
    await drawer
      .getByRole('button', { name: 'Request publish approval' })
      .click();
    const requestDialog = page.getByRole('dialog', {
      name: 'Request publish approval',
    });
    await expect(requestDialog).toBeVisible();
    const responsePromise = page.waitForResponse(
      (response) =>
        /\/v1\/schedules\/[^/]+\/publish-request$/.test(response.url()) &&
        response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await requestDialog.getByRole('button', { name: 'Send request' }).click();
    const response = await responsePromise;
    expect(response.ok(), await response.text()).toBeTruthy();
    await expect(
      page
        .locator('[aria-label="Status messages"]')
        .getByRole('status')
        .getByText('Publish request sent to the Dean.'),
    ).toBeVisible();
    await expect(requestDialog).toBeHidden();
  } finally {
    await close();
  }
}

/** Leaves the approval page open so the caller can assert the saved version. */
async function deanApprove(browser: Browser): Promise<{
  page: Page;
  close: () => Promise<void>;
}> {
  const session = await rolePage(browser, 'dean');
  await gotoApp(session.page, '/dean/approvals');
  await expect(
    session.page.getByRole('heading', { name: /Approvals/i }),
  ).toBeVisible();
  await session.page
    .getByPlaceholder(/Subject code or title/)
    .fill(state.subjectCode);
  await session.page
    .getByRole('button', { name: /^Publish requests \(/ })
    .click();
  await expect(
    session.page
      .getByText(`${state.subjectCode} · ${state.sectionCode}`, { exact: true })
      .first(),
  ).toBeVisible();

  await session.page.getByRole('button', { name: 'Row actions' }).first().click();
  await session.page.getByRole('menuitem', { name: 'Review' }).click();
  const drawer = session.page.getByRole('dialog', { name: 'Approval details' });
  await expect(drawer).toBeVisible();
  const responsePromise = session.page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/publish-requests\/[^/]+$/.test(response.url()) &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(
    session.page.locator('[aria-label="Status messages"]'),
  ).toContainText(
    `Approved — ${state.subjectCode} · ${state.sectionCode}. The entry is published.`,
  );
  await expect(drawer).toBeHidden();
  return session;
}

async function openArchive(page: Page): Promise<ReturnType<typeof archiveDrawer>> {
  await loginAs(page, 'head');
  await openTimetable(page);
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  return archiveDrawer(page);
}

function archiveDrawer(page: Page) {
  return page.getByRole('dialog', {
    name: 'Published versions and finalize history',
  });
}

function versionRow(drawer: ReturnType<typeof archiveDrawer>, termName: string) {
  return drawer.locator('li').filter({ hasText: termName }).first();
}

async function clickReuse(
  page: Page,
  drawer: ReturnType<typeof archiveDrawer>,
  termName: string,
): Promise<JsonRecord> {
  await versionRow(drawer, termName)
    .getByRole('button', { name: `Reuse ${termName}` })
    .click();
  const responsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/published-versions\/[^/]+\/preflight$/.test(
        response.url(),
      ) && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as JsonRecord).data as JsonRecord;
}

test.beforeEach(async ({ page }) => {
  await blockFonts(page);
});

test.beforeAll(async () => {
  loadE2eEnv();
  state = e2eState();
  db = createClient(
    requireEnv('E2E_SUPABASE_URL'),
    requireEnv('E2E_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const existing = await db
    .from('term')
    .select('term_id')
    .eq('term_name', SWAP_TERM.termName)
    .eq('school_year', SWAP_TERM.schoolYear)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`Could not find swap term: ${existing.error.message}`);
  }
  if (existing.data) {
    swapTermId = String(existing.data.term_id);
  } else {
    const { data, error } = await db
      .from('term')
      .insert({
        term_name: SWAP_TERM.termName,
        school_year: SWAP_TERM.schoolYear,
        start_date: '2026-08-01',
        end_date: '2026-12-20',
        is_active: false,
        semester: SEMESTER,
      })
      .select('term_id')
      .single();
    if (error || !data) {
      throw new Error(`Could not create swap term: ${error?.message ?? 'none'}`);
    }
    swapTermId = String(data.term_id);
  }
  await restoreCleanState();
});

test.afterAll(async () => {
  if (!db) return;
  await restoreCleanState();
  if (!swapTermId) return;
  const { error } = await db.from('term').delete().eq('term_id', swapTermId);
  if (error) throw new Error(`Could not remove swap term: ${error.message}`);
});

test('saved version is written when the Dean approves publish', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);

  await loginAs(page, 'head');
  await openTimetable(page);
  await plotRow(page, ROWS[0]);
  await openScheduleDetails(page);
  const details = page.getByRole('dialog', { name: 'Class details' });
  await details.getByRole('combobox').selectOption('review');
  await expect(details.getByRole('combobox')).toHaveValue('review');
  await details.getByLabel('Close').click();

  await deanFinalize(browser);
  await headRequestPublish(browser);
  const approval = await deanApprove(browser);
  try {
    const versions = await apiGet<VersionSummary[]>(
      approval.page,
      '/v1/schedules/published-versions',
      { semester: SEMESTER },
    );
    const current = versions.find(
      (version) => String(version.termId) === String(state.termId),
    );
    expect(current, JSON.stringify(versions)).toBeTruthy();
    expect(current!.entryCount).toBe(1);
    expect(current!.stale).toBeFalsy();

    const detail = await apiGet<VersionDetail>(
      approval.page,
      `/v1/schedules/published-versions/${current!.versionId}`,
    );
    expect(detail.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'published',
          subject_code: E2E_DATA.subjectCode,
          section_code: E2E_DATA.sectionCode,
        }),
      ]),
    );
    currentVersionId = current!.versionId;
  } finally {
    await approval.close();
  }
});

test('term deactivation warns about drafts and clears the live grid', async ({
  page,
}) => {
  await loginAs(page, 'head');
  await openTimetable(page);
  await plotRow(page, ROWS[1]);
  await plotRow(page, ROWS[2]);
  await setRowStatus(page, ROWS[2], 'review');
  await plotRow(page, ROWS[3]);
  await setRowStatus(page, ROWS[3], 'finalized');

  await loginAs(page, 'dean');
  await gotoApp(page, '/dean/system-settings');
  const termRow = page.locator(`#term-${state.termId}`);
  await expect(termRow).toBeVisible();
  await termRow.getByRole('button', { name: 'Deactivate' }).click();

  const dialog = page.getByRole('dialog', { name: 'Deactivate term?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    `Rows in this term: draft 1, review 1, finalized 1, published 1.`,
  );
  await expect(dialog).toContainText(/Warning: draft rows and all other rows/);
  const confirm = dialog.getByRole('button', { name: 'Deactivate term' });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel('Type "DEACTIVATE" to confirm')
    .fill('DEACTIVATE');
  await expect(confirm).toBeEnabled();

  const responsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/terms\/[^/]+\/deactivate$/.test(response.url()) &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await confirm.click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(dialog).toBeHidden();

  const liveRows = await apiGet<JsonRecord[]>(
    page,
    '/v1/schedules',
    { termId: state.termId },
  );
  expect(liveRows).toHaveLength(0);

  const detail = await apiGet<VersionDetail>(
    page,
    `/v1/schedules/published-versions/${currentVersionId}`,
  );
  expect(
    detail.entries.map((entry) => entry.status).sort(),
  ).toEqual(['draft', 'finalized', 'published', 'review']);
});

test('reactivating a term restores its rows and swaps the other term out', async ({
  page,
}) => {
  // A UI-only deactivation of the swap term cannot create a saved version for
  // rows that were never plotted there, so derive one from the real snapshot.
  const snapshot = await plottedSnapshot();
  swapVersionId = await insertFixtureVersion({
    termId: swapTermId,
    termName: SWAP_TERM.termName,
    semester: SEMESTER,
    schoolYear: SWAP_TERM.schoolYear,
    snapshot: {
      ...snapshot,
      snapshot_version: 1,
      term_id: swapTermId,
      term_name: SWAP_TERM.termName,
      semester: SEMESTER,
      school_year: SWAP_TERM.schoolYear,
      entry_count: (snapshot.entries as JsonRecord[]).length,
    },
  });

  await loginAs(page, 'dean');
  await gotoApp(page, '/dean/system-settings');

  const swapRow = page.locator(`#term-${swapTermId}`);
  await swapRow.getByRole('button', { name: 'Activate' }).click();
  const swapDialog = page.getByRole('dialog', { name: 'Activate term?' });
  await expect(swapDialog).toBeVisible();
  await expect(swapDialog).toContainText(SWAP_TERM.termName);
  await expect(swapDialog).toContainText(/No other term is active/);
  const swapActivate = page.waitForResponse(
    (response) =>
      /\/v1\/terms\/[^/]+\/activate$/.test(response.url()) &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await swapDialog.getByRole('button', { name: 'Activate term' }).click();
  const swapped = await swapActivate;
  expect(swapped.ok(), await swapped.text()).toBeTruthy();

  const swapLive = await apiGet<JsonRecord[]>(page, '/v1/schedules', {
    termId: swapTermId,
  });
  expect(swapLive).toHaveLength(4);
  expect(
    await apiGet<JsonRecord[]>(page, '/v1/schedules', {
      termId: state.termId,
    }),
  ).toHaveLength(0);

  const e2eRow = page.locator(`#term-${state.termId}`);
  await e2eRow.getByRole('button', { name: 'Activate' }).click();
  const e2eDialog = page.getByRole('dialog', { name: 'Activate term?' });
  await expect(e2eDialog).toBeVisible();
  await expect(e2eDialog).toContainText(
    `Saved and cleared from the currently active term "${SWAP_TERM.termName}"`,
  );
  await expect(e2eDialog).toContainText(
    new RegExp(
      `Restored rows for "${escapeRegExp(E2E_DATA.termName)}"\\s*\\(\\s*` +
        'draft\\s+1,\\s*review\\s+1,\\s*finalized\\s+1,\\s*published\\s+1\\s*\\)\\.',
    ),
  );
  await expect(e2eDialog).toContainText(
    new RegExp(
      `Saved and cleared from the currently active term "${escapeRegExp(
        SWAP_TERM.termName,
      )}"\\s*\\(\\s*` +
        'draft\\s+1,\\s*review\\s+1,\\s*finalized\\s+1,\\s*published\\s+1\\s*\\)\\;',
    ),
  );
  const e2eActivate = page.waitForResponse(
    (response) =>
      /\/v1\/terms\/[^/]+\/activate$/.test(response.url()) &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await e2eDialog.getByRole('button', { name: 'Activate term' }).click();
  const restored = await e2eActivate;
  expect(restored.ok(), await restored.text()).toBeTruthy();

  expect(
    await apiGet<JsonRecord[]>(page, '/v1/schedules', {
      termId: state.termId,
    }),
  ).toHaveLength(4);
  expect(
    await apiGet<JsonRecord[]>(page, '/v1/schedules', {
      termId: swapTermId,
    }),
  ).toHaveLength(0);

  await loginAs(page, 'head');
  await openTimetable(page);
  await expect(scheduleBlock(page)).toBeVisible();
});

test('older same-semester versions are grouped by year and marked stale', async ({
  page,
}) => {
  const snapshot = await plottedSnapshot();
  const source = await publishedEntry(snapshot);

  const { data: subject, error: subjectError } = await db
    .from('subject')
    .insert({
      subject_code: EXTRA_SUBJECT_CODE,
      title: 'E2E Out-of-Prospectus Subject',
      total_units: 3,
      lecture_units: 3,
      lab_units: 0,
      required_room_type: null,
      dept_id: state.departmentId,
      is_active: true,
      is_placeholder: false,
      is_minor: false,
    })
    .select('subject_id')
    .single();
  if (subjectError || !subject) {
    throw new Error(`Could not create fixture subject: ${subjectError?.message ?? 'none'}`);
  }
  extraSubjectId = String(subject.subject_id);

  const { data: section, error: sectionError } = await db
    .from('section')
    .insert({
      section_code: EXTRA_SECTION_CODE,
      program_id: state.programId,
      year_level: 1,
      student_count: 30,
      is_active: true,
    })
    .select('section_id')
    .single();
  if (sectionError || !section) {
    throw new Error(`Could not create fixture section: ${sectionError?.message ?? 'none'}`);
  }
  extraSectionId = String(section.section_id);

  archiveVersionId = await insertFixtureVersion({
    termId: null,
    termName: ARCHIVE_TERM.termName,
    semester: SEMESTER,
    schoolYear: ARCHIVE_TERM.schoolYear,
    snapshot: {
      snapshot_version: 1,
      term_id: null,
      term_name: ARCHIVE_TERM.termName,
      semester: SEMESTER,
      school_year: ARCHIVE_TERM.schoolYear,
      captured_at: new Date().toISOString(),
      entry_count: 1,
      entries: [
        {
          ...source,
          schedule_id: null,
          subject_id: extraSubjectId,
          subject_code: EXTRA_SUBJECT_CODE,
          subject_title: 'E2E Out-of-Prospectus Subject',
          session_index: 0,
        },
      ],
    },
  });

  conflictVersionId = await insertFixtureVersion({
    termId: null,
    termName: CONFLICT_TERM.termName,
    semester: SEMESTER,
    schoolYear: CONFLICT_TERM.schoolYear,
    snapshot: {
      snapshot_version: 1,
      term_id: null,
      term_name: CONFLICT_TERM.termName,
      semester: SEMESTER,
      school_year: CONFLICT_TERM.schoolYear,
      captured_at: new Date().toISOString(),
      entry_count: 1,
      entries: [
        {
          ...source,
          schedule_id: null,
          section_id: extraSectionId,
          section_code: EXTRA_SECTION_CODE,
          start_time: '08:00:00',
          end_time: '09:00:00',
          session_index: 0,
        },
      ],
    },
  });

  const drawer = await openArchive(page);
  await expect(drawer).toBeVisible();
  const versions = await apiGet<VersionSummary[]>(
    page,
    '/v1/schedules/published-versions',
    { semester: SEMESTER },
  );
  expect(
    versions.map((version) => version.versionId),
  ).toEqual(expect.arrayContaining([currentVersionId!, archiveVersionId, conflictVersionId]));
  const archived = versions.find((version) => version.versionId === archiveVersionId);
  expect(archived).toMatchObject({
    termId: null,
    termName: ARCHIVE_TERM.termName,
    schoolYear: ARCHIVE_TERM.schoolYear,
    semester: SEMESTER,
    entryCount: 1,
    stale: true,
    locked: true,
  });

  const yearGroup = drawer
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: ARCHIVE_TERM.schoolYear }) });
  await expect(yearGroup).toBeVisible();
  await expect(yearGroup).toContainText('Verify before reuse');
  await expect(yearGroup).toContainText(ARCHIVE_TERM.termName);
  await expect(yearGroup.getByText('Stale — verify labels')).toHaveCount(2);

  await versionRow(drawer, ARCHIVE_TERM.termName)
    .getByRole('button', { name: 'View' })
    .click();
  const detailDialog = page.getByRole('dialog', {
    name: `Published version · ${ARCHIVE_TERM.termName}`,
  });
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog).toContainText(EXTRA_SUBJECT_CODE);
  await expect(detailDialog).toContainText('published');
  await detailDialog.getByRole('button', { name: 'Close' }).click();
  await expect(detailDialog).toBeHidden();
});

test('zero-match reuse closes with a summary and plots nothing', async ({
  page,
}) => {
  const drawer = await openArchive(page);
  const preflight = await clickReuse(page, drawer, ARCHIVE_TERM.termName);

  expect(preflight).toMatchObject({
    matched: 0,
    ready: 0,
    failed: true,
    conflicts: [],
  });
  await expect(page.locator('[aria-label="Status messages"]')).toContainText(
    /No published entries matched the active term prospectus/,
  );

  const summary = page.getByRole('dialog', { name: /^Reuse into / });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('status')).toContainText(
    /No published entries matched the active term prospectus/,
  );
  await expect(summary).toContainText(
    'No published subjects matched this term\'s prospectus. Nothing was plotted and no rows were changed.',
  );
  await expect(
    summary.getByRole('button', { name: 'Use matched subjects' }),
  ).toHaveCount(0);
  await summary.getByRole('button', { name: 'Close' }).click();
  await expect(summary).toBeHidden();

  await expect(page.getByRole('button', { name: /E2E 999/ })).toHaveCount(0);
  expect(
    await apiGet<JsonRecord[]>(page, '/v1/schedules', {
      termId: state.termId,
    }),
  ).toHaveLength(4);
});

test('reuse skips protected rows and keeps unmatched drafts', async ({ page }) => {
  const drawer = await openArchive(page);
  const preflight = await clickReuse(page, drawer, E2E_DATA.termName);

  // Only the one published snapshot entry is considered. The live published,
  // review, and finalized rows are obstacles, and the live draft is untouched.
  expect(preflight).toMatchObject({
    matched: 1,
    ready: 0,
    skipped: 1,
    keptAsIs: 3,
    warnings: 0,
    conflicts: [],
    failed: false,
  });
  expect(preflight.summary).toContain(
    '1 matched, 0 ready, 1 skipped, 3 kept as is, 0 warnings, 0 conflicts.',
  );

  const detail = await apiGet<VersionDetail>(
    page,
    `/v1/schedules/published-versions/${currentVersionId}`,
  );
  expect(detail.entries.map((entry) => entry.status).sort()).toEqual([
    'draft',
    'finalized',
    'published',
    'review',
  ]);

  const summary = page.getByRole('dialog', { name: /^Reuse into / });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole('status')).toContainText(
    '1 matched, 0 ready, 1 skipped, 3 kept as is, 0 warnings, 0 conflicts.',
  );
  await expect(
    summary.getByRole('button', { name: 'Use matched subjects' }),
  ).toHaveCount(0);
  await summary.getByRole('button', { name: 'Cancel' }).click();
  await expect(summary).toBeHidden();

  // Protected rows and the unmatched draft are still on the grid unchanged.
  await expect(scheduleBlock(page)).toBeVisible();
  await openScheduleDetails(page);
  await expect(
    page.getByRole('dialog', { name: 'Class details' }).getByText('Published', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('dialog', { name: 'Class details' }).getByLabel('Close').click();

  const reviewBlock = page.getByRole('button', { name: blockLabel(ROWS[2]) });
  await reviewBlock.click({ force: true });
  await expect(
    page.getByRole('dialog', { name: 'Class details' }).getByRole('combobox'),
  ).toHaveValue('review');
  await page.getByRole('dialog', { name: 'Class details' }).getByLabel('Close').click();

  const draftBlock = page.getByRole('button', { name: blockLabel(ROWS[1]) });
  await draftBlock.click({ force: true });
  await expect(
    page.getByRole('dialog', { name: 'Class details' }).getByRole('combobox'),
  ).toHaveValue('draft');
  await page.getByRole('dialog', { name: 'Class details' }).getByLabel('Close').click();

  const finalizedBlock = page.getByRole('button', { name: blockLabel(ROWS[3]) });
  await finalizedBlock.click({ force: true });
  await expect(
    page.getByRole('dialog', { name: 'Class details' }).getByRole('combobox'),
  ).toHaveValue('finalized');
  await page.getByRole('dialog', { name: 'Class details' }).getByLabel('Close').click();
});

test('reuse conflicts stay in the drag-and-drop workspace', async ({ page }) => {
  const drawer = await openArchive(page);
  const preflight = await clickReuse(page, drawer, CONFLICT_TERM.termName);

  expect(preflight).toMatchObject({ matched: 1, failed: false });
  expect(preflight.conflicts).toHaveLength(1);
  expect(preflight.conflicts[0].reason).toContain('H-11');

  const summary = page.getByRole('dialog', { name: /^Reuse into / });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Conflicts left unresolved');
  await expect(summary).toContainText(`${E2E_DATA.subjectCode} · ${EXTRA_SECTION_CODE}`);

  const applyResponsePromise = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/published-versions\/[^/]+\/reuse$/.test(
        response.url(),
      ) && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await summary.getByRole('button', { name: 'Use matched subjects' }).click();
  const applyResponse = await applyResponsePromise;
  expect(applyResponse.ok(), await applyResponse.text()).toBeTruthy();
  const applied = ((await applyResponse.json()) as JsonRecord).data as ReuseApply;
  expect(applied).toMatchObject({ failed: false });
  expect(applied.created).toHaveLength(0);
  expect(applied.updated).toHaveLength(0);
  expect(applied.conflicts).toHaveLength(1);

  await expect(page.locator('[aria-label="Status messages"]')).toContainText(
    '1 conflict(s) remain unresolved. Resolve them in the workspace.',
  );
  const workspace = page.getByRole('dialog', { name: 'Reuse conflict workspace' });
  await expect(workspace).toBeVisible();
  await expect(workspace).toContainText('1 unresolved');
  await expect(workspace).toContainText('Reuse conflicts');
  await expect(workspace).toContainText(`${E2E_DATA.subjectCode} · ${EXTRA_SECTION_CODE}`);
  await expect(workspace.getByRole('button', { name: /Validate and save at source slot/ })).toBeVisible();

  // The conflict never lands on the main grid.
  await expect(
    page.getByRole('button', { name: /E2E 101.*E2E-REUSE-B/ }),
  ).toHaveCount(0);
  expect(
    await apiGet<JsonRecord[]>(page, '/v1/schedules', {
      termId: state.termId,
    }),
  ).toHaveLength(4);

  await workspace.getByRole('button', { name: 'Exit workspace' }).click();
  await expect(workspace).toBeHidden();
});
