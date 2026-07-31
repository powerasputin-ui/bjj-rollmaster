import { test, expect, type Page } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

async function playAllMatches(page: Page): Promise<void> {
  const finalizeButton = page.getByRole('button', { name: /Finalize Match|Завершить схватку/i });
  for (let i = 0; i < 30; i++) {
    const slot = page.locator('main div.cursor-pointer').first();
    if ((await slot.count()) === 0) return;
    await slot.click();
    await finalizeButton.click();
    await expect(finalizeButton).toHaveCount(0, { timeout: 8000 });
  }
  throw new Error('playAllMatches did not converge within 30 iterations');
}

async function addAthlete(page: Page, name: string, team: string, weight: string): Promise<void> {
  await page.getByTitle(/Athletes|Атлеты/i).click();
  await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
  await page.locator('input[placeholder="Иван Иванов"]').fill(name);
  await page.locator('input[placeholder="88.3"]').fill(weight);
  await page.locator('input[placeholder="Академия Джиу-Джитсу"]').fill(team);
  await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
  await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 8000 });
}

test.describe('team standings', () => {
  test('a category podium credits the winning athletes\' teams on the Teams page', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    await addAthlete(page, 'Standings Athlete A', 'Team Falcon', '75');
    await addAthlete(page, 'Standings Athlete B', 'Team Hawk', '75');

    await page.getByTitle(/Brackets|Сетки/i).click();
    const categorySelect = page.locator('select').filter({ has: page.getByRole('option', { name: /All Divisions|Все категории/i }) });
    let option: string | undefined;
    await expect.poll(async () => {
      const options = await categorySelect.locator('option').allTextContents();
      option = options.find(o => o !== 'All Divisions' && o !== 'Все категории');
      return option;
    }, { timeout: 8000 }).toBeTruthy();
    await categorySelect.selectOption({ label: option! });
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await playAllMatches(page);

    await page.getByTitle(/Team Points|Team Standings|Командные очки|Командный/i).click();
    await expect(page.locator('text=Team Falcon')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Team Hawk')).toBeVisible();

    // Whoever won the only match (competitor1, by the deterministic click order) is gold at 9 points.
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow.locator('td').nth(5)).toHaveText('9');
  });
});
