import { expect, test, type Page } from '@playwright/test';

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
import { optionalEnv } from '../env';
import { E2E_DATA, E2E_SCHEDULE, type E2eState } from '../seed';

/** Arbitrary JSON returned by the archive endpoints. */
type JsonRecord = Record<string, any>;

/**
 * The app keeps the Supabase token in localStorage, so a Playwright APIRequest
 * context (which only shares cookies) needs the token forwarded explicitly.
 */
async function apiGet(
  page: Page,
  path: string,
  params?: Record<string, string>,
): Promise<JsonRecord> {
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
  return (await response.json()) as JsonRecord;
}

/**
 * One ordered, full-stack workflow. Keeping the steps serial lets the same
 * schedule travel through the real draft -> review -> finalized -> published
 * transitions without duplicating fixture setup in every test.
 */
test.describe.configure({ mode: 'serial' });

let state: E2eState;

test.beforeAll(() => {
  state = e2eState();
});

test.beforeEach(async ({ page }) => {
  // Fonts are not part of any assertion. Blocking them keeps the suite from
  // depending on Google's CDN, which can stall navigation on CI networks.
  await page.route(
    /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
    (route) => route.abort(),
  );
});

test('department head signs in and plots a schedule', async ({ page }) => {
  await loginAs(page, 'head');
  await openTimetable(page);

  await expect(
    page.getByTestId('timetable-scope'),
  ).toHaveAttribute('data-scope', 'department');

  await gotoApp(page, '/timetable?view=master');
  await expect(
    page.getByTestId('timetable-scope'),
  ).toHaveAttribute('data-scope', 'department');

  await gotoApp(page, '/timetable?view=byRoom');
  await expect(
    page.getByTestId('timetable-scope'),
  ).toHaveAttribute('data-scope', 'department');

  await page.getByRole('button', { name: 'Plot Subject' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Plot a subject' });
  await expect(dialog).toBeVisible();

  await selectById(dialog, 'subjectId', state.subjectId);
  await selectById(dialog, 'section', state.sectionCode);
  await dialog.locator('select[name="loadType"]').selectOption('lecture');
  await dialog
    .locator('select[name="dayOfWeek"]')
    .selectOption(E2E_SCHEDULE.day);
  // H-11 requires a standard 90-minute lecture block.
  await selectTime(page, 'Start time', E2E_SCHEDULE.startLabel);
  await selectTime(page, 'End time', E2E_SCHEDULE.endLabel);
  await selectById(dialog, 'facultyId', state.facultyId);
  await selectById(dialog, 'roomId', state.roomId);

  const plotResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/v1/schedules/plot') &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: 'Plot subject' }).click();
  const response = await plotResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  await expect(dialog).toBeHidden();
  await expect(scheduleBlock(page)).toBeVisible();
});

test('department head submits the schedule for review', async ({ page }) => {
  await loginAs(page, 'head');
  await openTimetable(page);
  await openScheduleDetails(page);

  const drawer = page.getByRole('dialog', { name: 'Class details' });
  const status = drawer.getByRole('combobox');

  const statusResponse = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/\d+\/status$/.test(response.url()) &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await status.selectOption('review');
  const response = await statusResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  await expect(status).toHaveValue('review');
  await drawer.getByLabel('Close').click();
  await expect(drawer).toBeHidden();
});

test('college dean approves the schedule', async ({ page }) => {
  await loginAs(page, 'dean');
  await gotoApp(page, '/dean/approvals');
  await expect(
    page.getByRole('heading', { name: /Approvals/i }),
  ).toBeVisible();

  await page.getByPlaceholder(/Subject code or title/).fill(state.subjectCode);
  await expect(
    page.getByText(state.subjectCode, { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Row actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Finalize', exact: true }).click();

  await expect(
    page.getByText('No schedules match your filters.'),
  ).toBeVisible();
});

test('department head requests publish approval', async ({ page }) => {
  await loginAs(page, 'head');
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

  const publishResponse = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/[^/]+\/publish-request$/.test(response.url()) &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await requestDialog.getByRole('button', { name: 'Send request' }).click();
  const response = await publishResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  await expect(
    page
      .locator('[aria-label="Status messages"]')
      .getByRole('status')
      .getByText('Publish request sent to the Dean.'),
  ).toBeVisible();
  await expect(requestDialog).toBeHidden();
});

test('college dean approves the publish request', async ({ page }) => {
  await loginAs(page, 'dean');
  await gotoApp(page, '/dean/approvals');
  await expect(
    page.getByRole('heading', { name: /Approvals/i }),
  ).toBeVisible();

  await page.getByPlaceholder(/Subject code or title/).fill(state.subjectCode);
  await page.getByRole('button', { name: /^Publish requests \(/ }).click();
  await expect(
    page
      .getByText(`${state.subjectCode} · ${state.sectionCode}`, { exact: true })
      .first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Row actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Review' }).click();

  const drawer = page.getByRole('dialog', { name: 'Approval details' });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByText(`${state.subjectCode} · ${state.sectionCode}`, {
      exact: true,
    }),
  ).toBeVisible();

  const decisionResponse = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/publish-requests\/[^/]+$/.test(response.url()) &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  );
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  const response = await decisionResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  await expect(page.locator('[aria-label="Status messages"]')).toContainText(
    `Approved — ${state.subjectCode} · ${state.sectionCode}. The entry is published.`,
  );
  await expect(drawer).toBeHidden();

  // The approval transaction must also write this term's saved version.
  const versions = await apiGet(page, '/v1/schedules/published-versions', {
    semester: '1st',
  });
  const current = (versions.data as JsonRecord[]).find(
    (version) => String(version.termId) === String(state.termId),
  );
  expect(current, JSON.stringify(versions)).toBeTruthy();
  const detail = await apiGet(
    page,
    `/v1/schedules/published-versions/${current!.versionId}`,
  );
  expect(detail.data.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: 'published',
        subject_code: E2E_DATA.subjectCode,
        section_code: E2E_DATA.sectionCode,
      }),
    ]),
  );
});

test('published schedule is visible on the timetable', async ({ page }) => {
  await loginAs(page, 'head');
  await openTimetable(page);
  await openScheduleDetails(page);

  const drawer = page.getByRole('dialog', { name: 'Class details' });
  await expect(drawer.getByText('Published', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('combobox')).toHaveCount(0);
  await expect(
    drawer.getByText(state.subjectCode, { exact: true }),
  ).toBeVisible();
});
