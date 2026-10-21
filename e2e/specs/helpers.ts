import { expect, type Locator, type Page } from '@playwright/test';

import {
  E2E_DATA,
  E2E_SCHEDULE,
  loadE2eState,
  type E2eState,
} from '../seed';

export type E2eRole = 'head' | 'dean';

export function e2eState(): E2eState {
  return loadE2eState();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The plotted class block on the timetable (label includes the time range). */
export function scheduleBlock(page: Page): Locator {
  const label =
    `${E2E_DATA.subjectCode} ${E2E_DATA.sectionCode}, ` +
    `${E2E_SCHEDULE.startLabel} to ${E2E_SCHEDULE.endLabel}`;
  return page.getByRole('button', { name: new RegExp(escapeRegExp(label)) });
}

/**
 * Sign in through the real login form. Each test starts with a fresh browser
 * context, so this also verifies that the test users can authenticate against
 * the dedicated Supabase project.
 */
export async function loginAs(page: Page, role: E2eRole): Promise<void> {
  const state = e2eState();
  const email = role === 'head' ? state.headEmail : state.deanEmail;
  const password =
    role === 'head' ? state.headPassword : state.deanPassword;

  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(
    role === 'head'
      ? /\/dashboard(?:\?.*)?$/
      : /\/dean\/dashboard(?:\?.*)?$/,
    { timeout: 30_000 },
  );
}

export async function openTimetable(page: Page): Promise<void> {
  await page.goto('/timetable');
  const plotButton = page.getByRole('button', { name: 'Plot Subject' }).first();
  await expect(plotButton).toBeVisible();
  await expect(plotButton).toBeEnabled();
}

export async function selectById(
  page: Page | Locator,
  selectName: string,
  value: string,
): Promise<void> {
  const select = page.locator(`select[name="${selectName}"]`);
  await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1);
  await select.selectOption(value);
}

export async function selectTime(
  page: Page,
  fieldLabel: 'Start time' | 'End time',
  value: string,
): Promise<void> {
  await page.getByRole('button', { name: fieldLabel }).click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await listbox.getByRole('button', { name: value, exact: true }).click();
}

export async function openScheduleDetails(page: Page): Promise<void> {
  const block = scheduleBlock(page);
  await expect(block).toBeVisible();
  await block.click();
  await expect(
    page.getByRole('dialog', { name: 'Class details' }),
  ).toBeVisible();
}
