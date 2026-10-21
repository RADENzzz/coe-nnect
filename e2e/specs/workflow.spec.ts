import { expect, test } from '@playwright/test';

import {
  e2eState,
  loginAs,
  openScheduleDetails,
  openTimetable,
  scheduleBlock,
  selectById,
  selectTime,
} from './helpers';
import { E2E_SCHEDULE, type E2eState } from '../seed';

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

test('department head signs in and plots a schedule', async ({ page }) => {
  await loginAs(page, 'head');
  await openTimetable(page);

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
  );
  await status.selectOption('review');
  const response = await statusResponse;
  expect(response.ok(), await response.text()).toBeTruthy();

  await expect(status).toHaveValue('review');
  await drawer.getByRole('button', { name: 'Close' }).click();
  await expect(drawer).toBeHidden();
});

test('college dean approves the schedule', async ({ page }) => {
  await loginAs(page, 'dean');
  await page.goto('/dean/approvals');
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

test('college dean publishes the finalized schedule', async ({ page }) => {
  await loginAs(page, 'dean');
  await page.goto('/dean/approvals');
  await expect(
    page.getByRole('heading', { name: /Approvals/i }),
  ).toBeVisible();

  await page.getByPlaceholder(/Subject code or title/).fill(state.subjectCode);
  await page.getByRole('button', { name: /^Finalized \(/ }).click();
  await expect(
    page.getByText(state.subjectCode, { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Row actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Publish', exact: true }).click();

  const confirm = page.getByRole('dialog', { name: 'Publish 1 schedule?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click();

  await expect(page.getByText('Published 1 schedule.')).toBeVisible();
});

test('published schedule is visible on the timetable', async ({ page }) => {
  await loginAs(page, 'head');
  await openTimetable(page);
  await openScheduleDetails(page);

  const drawer = page.getByRole('dialog', { name: 'Class details' });
  await expect(drawer.getByRole('combobox')).toHaveValue('published');
  await expect(
    drawer.getByText(state.subjectCode, { exact: true }),
  ).toBeVisible();
});
