import { test, expect, type Page } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
const errors = new Map<string, string[]>();
test.beforeEach(async ({ page }, info) => {
  const list: string[] = [];
  errors.set(info.testId, list);
  page.on('pageerror', (error) => list.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Новая задача', exact: true })).toBeEnabled();
});
test.afterEach(async ({}, info) => {
  expect(errors.get(info.testId) ?? []).toEqual([]);
  errors.delete(info.testId);
});
async function add(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Новая задача', exact: true }).fill(text);
  await page.locator('.add').first().click();
  await expect(page.getByRole('textbox', { name: 'Новая задача', exact: true })).toBeEnabled();
}
const rows = (page: Page) => page.locator('.tasks>.task');
test('all four assignment requirements persist after reload', async ({ page }) => {
  await add(page, 'Купить продукты 🥑');
  await expect(rows(page)).toHaveCount(1);
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).getByRole('checkbox').check();
  await page.reload();
  await expect(rows(page).getByRole('checkbox')).toBeChecked();
  await rows(page)
    .getByRole('button', { name: /Удалить:/ })
    .click();
  await expect(rows(page)).toHaveCount(0);
  await page.reload();
  await expect(rows(page)).toHaveCount(0);
});
test('edit by Enter persists and returns focus to edit control', async ({ page }) => {
  await add(page, 'Черновик');
  await page.getByRole('button', { name: 'Редактировать: Черновик', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Изменить текст задачи' });
  await expect(edit).toBeFocused();
  await edit.fill('  Готовый план  ');
  await edit.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Редактировать: Готовый план', exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(rows(page)).toContainText('Готовый план');
});
test('Escape cancels editing without saving', async ({ page }) => {
  await add(page, 'Оригинал');
  await page.getByRole('button', { name: 'Редактировать: Оригинал', exact: true }).click();
  const edit = page.getByRole('textbox', { name: 'Изменить текст задачи' });
  await edit.fill('Не сохранять');
  await edit.press('Escape');
  await expect(rows(page)).toContainText('Оригинал');
  await expect(rows(page)).not.toContainText('Не сохранять');
});
test('invalid editing keeps original task and shows an accessible error', async ({ page }) => {
  await add(page, 'Оригинал');
  await page.getByRole('button', { name: 'Редактировать: Оригинал', exact: true }).click();
  await page.getByRole('textbox', { name: 'Изменить текст задачи' }).fill('   ');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Напиши');
  await expect(page.getByRole('textbox', { name: 'Изменить текст задачи' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(rows(page)).toContainText('Оригинал');
});
test('undo restores a completed task and survives reload', async ({ page }) => {
  await add(page, 'Вернуть');
  await rows(page).getByRole('checkbox').check();
  await rows(page)
    .getByRole('button', { name: /Удалить:/ })
    .click();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByRole('checkbox')).toBeChecked();
  await expect(page.locator('#new-task')).toBeFocused();
  await page.reload();
  await expect(rows(page).getByRole('checkbox')).toBeChecked();
});
test('undo notice can be dismissed without restoring deleted task', async ({ page }) => {
  await add(page, 'Удалить');
  await rows(page)
    .getByRole('button', { name: /Удалить:/ })
    .click();
  await page.getByRole('button', { name: 'Закрыть уведомление' }).click();
  await expect(page.locator('.undo-notice')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
});
test('deletion keeps keyboard focus visible above the undo notice', async ({ page }) => {
  for (const text of ['Последняя', 'Удалить', 'Вторая', 'Первая']) await add(page, text);
  await page.getByRole('button', { name: 'Удалить: Удалить', exact: true }).press('Enter');
  const focused = page.getByRole('checkbox', { name: 'Выполнено: Последняя', exact: true });
  await expect(focused).toBeFocused();
  const target = await focused.boundingBox();
  const toast = await page.locator('.undo-notice').boundingBox();
  const overlaps =
    target!.x < toast!.x + toast!.width &&
    target!.x + target!.width > toast!.x &&
    target!.y < toast!.y + toast!.height &&
    target!.y + target!.height > toast!.y;
  expect(overlaps).toBe(false);
  expect(target!.y).toBeGreaterThanOrEqual(0);
});
test('filters and progress are consistent; new task exits completed filter', async ({ page }) => {
  await add(page, 'Первая');
  await add(page, 'Вторая');
  await rows(page).first().getByRole('checkbox').check();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50');
  await page.getByRole('button', { name: /^Готово/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).getByRole('checkbox')).toBeChecked();
  await add(page, 'Третья');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Мои задачи/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('whitespace is rejected and unsafe markup is rendered as text', async ({ page }) => {
  await add(page, '   ');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Напиши');
  await add(page, '<img src=x onerror=alert(1)>');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('<img src=x onerror=alert(1)>');
  await expect(rows(page).locator('img')).toHaveCount(0);
});
test('rapid double submit creates one task', async ({ page }) => {
  await page.locator('#new-task').fill('Один раз');
  await page.locator('.form').evaluate((form) => {
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(rows(page)).toHaveCount(1);
});
test('local mode remains editable while the open page is offline', async ({ page, context }) => {
  await context.setOffline(true);
  try {
    await expect(page.getByRole('status').filter({ hasText: 'Нет подключения' })).toBeVisible();
    await add(page, 'Без сети');
    await expect(rows(page)).toHaveCount(1);
  } finally {
    await context.setOffline(false);
  }
});
test('two tabs synchronize local changes', async ({ page, context }) => {
  await add(page, 'Из первой вкладки');
  const second = await context.newPage();
  try {
    await second.goto('/');
    await expect(rows(second)).toHaveCount(1);
    await add(second, 'Из второй вкладки');
    await expect(rows(page)).toHaveCount(2);
  } finally {
    await second.close();
  }
});
test('storage write failure never reports a successful addition', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.reload();
  await add(page, 'Не потерять');
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('#new-task')).toHaveValue('Не потерять');
});
test('corrupted storage is not overwritten', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('my-day.local.v2', 'broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await add(page, 'Не перезаписать');
  expect(await page.evaluate(() => localStorage.getItem('my-day.local.v2'))).toBe('broken');
});
test('blocked localStorage does not crash the app', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Мои задачи', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('локальное хранение');
});
test('keyboard can add a task and skip directly to the list', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к задачам' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#task-heading')).toBeFocused();
  await page.locator('#new-task').focus();
  await page.keyboard.type('С клавиатуры');
  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('#new-task')).toBeFocused();
});
test('no horizontal overflow from 320px to desktop; mobile add form is above the fold', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `width ${width}`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const form = await page.locator('.form').boundingBox();
  expect(form!.y + form!.height).toBeLessThan(844);
});
test('WCAG A/AA automated accessibility checks: empty, filled, editing', async ({ page }) => {
  for (const state of ['empty', 'filled', 'editing']) {
    if (state === 'filled') await add(page, 'Проверка доступности');
    if (state === 'editing')
      await page
        .getByRole('button', { name: 'Редактировать: Проверка доступности', exact: true })
        .click();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  }
});
