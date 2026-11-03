import { test, expect, type Page } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
// These tests cover UI/account boundaries with a deterministic adapter, not real OAuth.
const fixture = path.resolve('tests/e2e/fixtures/firebase.mjs');
const errors = new Map<string, string[]>();
test.beforeEach(async ({ page }, info) => {
  const list: string[] = [];
  errors.set(info.testId, list);
  page.on('pageerror', (error) => list.push(error.message));
  await page.route('**/src/data/firebase.ts*', (route) =>
    route.fulfill({ path: fixture, contentType: 'application/javascript' }),
  );
  await page.goto('/');
  await expect(page.locator('#new-task')).toBeEnabled();
});
test.afterEach(async ({}, info) => {
  expect(errors.get(info.testId) ?? []).toEqual([]);
  errors.delete(info.testId);
});
const rows = (page: Page) => page.locator('.tasks>.task');
async function add(page: Page, text: string) {
  await page.locator('#new-task').fill(text);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('#new-task')).toBeEnabled();
}
async function login(page: Page) {
  await page.getByRole('button', { name: 'Войти через Google', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible();
  await expect(page.locator('#new-task')).toBeEnabled();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти через Google', exact: true })).toBeVisible();
  await expect(page.locator('#new-task')).toBeEnabled();
}
test('mocked account: local copy requires consent, preserves completion and is not duplicated', async ({
  page,
}) => {
  await add(page, 'Локальный план');
  await add(page, 'Локальная победа');
  await rows(page).first().getByRole('checkbox').check();
  await login(page);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Перенос локальных задач' })).toContainText(
    '2',
  );
  await page.getByRole('button', { name: 'Скопировать в аккаунт', exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(
    rows(page).filter({ hasText: 'Локальная победа' }).getByRole('checkbox'),
  ).toBeChecked();
  await expect(page.locator('.import-panel')).toHaveCount(0);
  await logout(page);
  await expect(rows(page)).toHaveCount(2);
  await login(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator('.import-panel')).toHaveCount(0);
});
test('mocked account: sign-out and another account never retain the previous list or edit draft', async ({
  page,
}) => {
  await add(page, 'На устройстве');
  await login(page);
  await add(page, 'Личный план Анны');
  await page.getByRole('button', { name: 'Редактировать: Личный план Анны', exact: true }).click();
  await page.getByRole('textbox', { name: 'Изменить текст задачи' }).fill('Не переносить черновик');
  await logout(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('На устройстве');
  await expect(page.getByRole('textbox', { name: 'Изменить текст задачи' })).toHaveCount(0);
  await page.evaluate(() => (window as any).__accountTest.setAccount('bob'));
  await login(page);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.username')).toHaveText('Борис Тестовый');
  await add(page, 'Личный план Бориса');
  await logout(page);
  await page.evaluate(() => (window as any).__accountTest.setAccount('alice'));
  await login(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Личный план Анны');
  await expect(rows(page)).not.toContainText('Личный план Бориса');
});
test('mocked account: offline sign-out remains possible during a pending write; late completion is isolated', async ({
  page,
  context,
}) => {
  await login(page);
  await page.evaluate(() => (window as any).__accountTest.holdWrites());
  await page.locator('#new-task').fill('Отложенная облачная запись');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('#new-task')).toBeDisabled();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeEnabled();
  await logout(page);
  await page.locator('#new-task').fill('Новый локальный черновик');
  await page.evaluate(() => (window as any).__accountTest.releaseWrite());
  await expect(page.locator('#new-task')).toHaveValue('Новый локальный черновик');
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Новый локальный черновик');
  await expect(rows(page)).not.toContainText('Отложенная облачная запись');
  await context.setOffline(false);
});
test('mocked account: import and account layouts have no axe violations or narrow-screen overflow', async ({
  page,
}) => {
  await add(page, 'Задача для копирования');
  await login(page);
  await expect(page.locator('.import-panel')).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});
