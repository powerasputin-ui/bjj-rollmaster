import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

test.describe('check-in / weigh-in visibility', () => {
  test('marking one athlete as weighed-in filters the roster and updates the category readiness count on Brackets', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const weighedName = `Weighed Athlete ${unique}`;
    const pendingName = `Pending Athlete ${unique}`;
    const tournament = await createTestTournament(request);

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/Athletes|Атлеты/i).click();

    const addAthlete = async (name: string) => {
      await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
      await page.locator('input[placeholder="Иван Иванов"]').fill(name);
      await page.locator('input[placeholder="88.3"]').fill('70');
      await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
      await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 8000 });
    };
    await addAthlete(weighedName);
    await addAthlete(pendingName);

    // Mark only one of them as having made weight.
    const weighedCard = page.locator(`text=${weighedName}`).locator('xpath=ancestor::div[contains(@class,"rounded-[2rem]")]');
    await weighedCard.getByRole('button', { name: /Check Weight|Вес пройден/i }).click();

    // Filter the roster down to "Not Made Weight" — only the other athlete remains.
    const weightCheckSelect = page.locator('select').filter({ has: page.getByRole('option', { name: /All \(weigh-in\)|Все \(взвешивание\)/i }) });
    await weightCheckSelect.selectOption('NotMade');
    await expect(page.locator(`text=${pendingName}`)).toBeVisible({ timeout: 8000 });
    await expect(page.locator(`text=${weighedName}`)).toHaveCount(0);

    // Switch to "Made Weight" — only the weighed-in athlete remains.
    await weightCheckSelect.selectOption('Made');
    await expect(page.locator(`text=${weighedName}`)).toBeVisible({ timeout: 8000 });
    await expect(page.locator(`text=${pendingName}`)).toHaveCount(0);

    // The Brackets category picker shows a "made weight / total" readiness count.
    await page.getByTitle(/Brackets|Сетки/i).click();
    const categorySelect = page.locator('select').filter({ has: page.getByRole('option', { name: /All Divisions|Все категории/i }) });
    let option: string | undefined;
    await expect.poll(async () => {
      const options = await categorySelect.locator('option').allTextContents();
      option = options.find(o => o !== 'All Divisions' && o !== 'Все категории');
      return option;
    }, { timeout: 8000 }).toBeTruthy();
    expect(option).toMatch(/\(1\/2\)/);
  });
});
