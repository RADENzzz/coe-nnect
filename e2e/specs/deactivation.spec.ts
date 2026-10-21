import { expect, test } from '@playwright/test';
import { e2eState, gotoApp, loginAs } from './helpers';

test('Dean deactivates the E2E department and the DH gets walled', async ({
  page,
  browser,
}) => {
  const state = e2eState();

  // ── 1. Dean deactivates the dept from Manage Departments ──
  await loginAs(page, 'dean');
  await gotoApp(page, '/dean/departments/manage');

  await expect(
    page.getByText(state.deptCode, { exact: true }).first(),
  ).toBeVisible();

  // Find the row specifically containing the deptCode
  await page
    .getByRole('row', { name: new RegExp(state.deptCode) })
    .getByRole('button', { name: 'Row actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Deactivate' }).click();

  const confirm = page.getByRole('dialog', { name: /Confirm Deactivation/i });
  await confirm.getByPlaceholder('Admin password').fill(state.deanPassword);
  await confirm.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText(/deactivated/i)).toBeVisible({ timeout: 15_000 });

  // ── 2. Fresh context: DH login should land on the wall ──
  const dhContext = await browser.newContext();
  const dhPage = await dhContext.newPage();

  await dhPage.goto('/login', { waitUntil: 'domcontentloaded' });
  await dhPage.locator('input[name="email"]').fill(state.headEmail);
  await dhPage.locator('input[name="password"]').fill(state.headPassword);
  await dhPage.getByRole('button', { name: 'Sign in' }).click();

  await expect(dhPage).toHaveURL(/\/department-deactivated/, {
    timeout: 30_000,
  });
  await expect(dhPage.getByText('Department Deactivated')).toBeVisible();

  // ── 3. Reactivate to leave the suite green ──
  await page.reload();
  await page
    .getByRole('row', { name: new RegExp(state.deptCode) })
    .getByRole('button', { name: 'Row actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Activate' }).click();
  await expect(page.getByText(/reactivated/i)).toBeVisible({ timeout: 15_000 });

  await dhContext.close();
});