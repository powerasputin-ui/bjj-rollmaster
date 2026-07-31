import { test, expect, type Page } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

async function selectOnlyCategory(page: Page): Promise<void> {
  await page.getByTitle(/Brackets|Сетки/i).click();
  const categorySelect = page.locator('select').filter({ has: page.getByRole('option', { name: /All Divisions|Все категории/i }) });
  let option: string | undefined;
  await expect.poll(async () => {
    const options = await categorySelect.locator('option').allTextContents();
    option = options.find(o => o !== 'All Divisions' && o !== 'Все категории');
    return option;
  }, { timeout: 8000 }).toBeTruthy();
  await categorySelect.selectOption({ label: option! });
}

test.describe('tournament results export', () => {
  test('a concluded category shows its medalists on the Results page, supports CSV download, and the print button does not crash the page', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tournament = await createTestTournament(request);

    // Stub window.print before any page script runs — headless Chromium's
    // print() can still attempt to engage a system dialog, which would hang
    // an automated run; we only need to prove the button doesn't throw.
    await page.addInitScript(() => { window.print = () => {}; });
    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    await page.getByTitle(/Athletes|Атлеты/i).click();
    await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
    await page.locator('input[placeholder="Иван Иванов"]').fill(`Results Winner ${unique}`);
    await page.locator('input[placeholder="88.3"]').fill('70');
    await page.locator('input[placeholder="Академия Джиу-Джитсу"]').fill('Team Winner');
    await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
    await expect(page.locator(`text=Results Winner ${unique}`)).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
    await page.locator('input[placeholder="Иван Иванов"]').fill(`Results Loser ${unique}`);
    await page.locator('input[placeholder="88.3"]').fill('70');
    await page.locator('input[placeholder="Академия Джиу-Джитсу"]').fill('Team Loser');
    await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
    await expect(page.locator(`text=Results Loser ${unique}`)).toBeVisible({ timeout: 8000 });

    await selectOnlyCategory(page);
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await page.locator(`text=Results Winner ${unique}`).first().click();
    await page.getByRole('button', { name: /Finalize Match|Завершить схватку/i }).last().click();

    await page.getByTitle(/^Results$|^Результаты$/i).click();
    await expect(page.locator(`text=Results Winner ${unique}`)).toBeVisible({ timeout: 8000 });
    await expect(page.locator(`text=Results Loser ${unique}`)).toBeVisible();
    await expect(page.locator('text=/In progress|В процессе/i')).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download CSV|Скачать CSV/i }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('tournament_results.csv');

    // Print button must not throw/crash the page (window.print is stubbed above).
    await page.getByRole('button', { name: /^Print$|^Печать$/i }).click();
    await expect(page.locator(`text=Results Winner ${unique}`)).toBeVisible();
  });

  test('a category with no finished matches yet is listed as in-progress', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tournament = await createTestTournament(request);

    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    await page.getByTitle(/Athletes|Атлеты/i).click();
    await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
    await page.locator('input[placeholder="Иван Иванов"]').fill(`Pending A ${unique}`);
    await page.locator('input[placeholder="88.3"]').fill('75');
    await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
    await expect(page.locator(`text=Pending A ${unique}`)).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
    await page.locator('input[placeholder="Иван Иванов"]').fill(`Pending B ${unique}`);
    await page.locator('input[placeholder="88.3"]').fill('75');
    await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
    await expect(page.locator(`text=Pending B ${unique}`)).toBeVisible({ timeout: 8000 });

    await selectOnlyCategory(page);
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await page.getByTitle(/^Results$|^Результаты$/i).click();
    await expect(page.locator('text=/In progress|В процессе/i')).toBeVisible({ timeout: 8000 });
  });
});
