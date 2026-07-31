import { test, expect, type Page } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

// React-controlled inputs don't reflect their live value onto the DOM
// `value` attribute, so locating a row by its current text requires reading
// `.inputValue()` per candidate rather than an attribute/CSS selector. The
// list also arrives via an async fetch after the Settings view mounts, so
// this polls (via expect.poll) rather than checking just once.
async function findRowIndex(nameInputs: ReturnType<Page['locator']>, match: string): Promise<number> {
  const count = await nameInputs.count();
  for (let i = 0; i < count; i++) {
    if ((await nameInputs.nth(i).inputValue()).includes(match)) return i;
  }
  return -1;
}

async function findRowByNameValue(page: Page, match: string) {
  const section = page.locator('section').filter({ hasText: /Weight Categories|Весовые категории/i });
  const nameInputs = section.locator('input:not([type="number"])');

  await expect.poll(() => findRowIndex(nameInputs, match), { timeout: 10000 }).not.toBe(-1);
  const index = await findRowIndex(nameInputs, match);
  return nameInputs.nth(index).locator('xpath=..');
}

test.describe('per-tournament weight categories', () => {
  test('organizer edits a category boundary, adds athletes spanning it, and the bracket respects the new boundary', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    // Move the Feather boundary down from 70kg to 68kg in Settings.
    await page.getByTitle(/Settings|Настройки/i).click();
    const featherRow = await findRowByNameValue(page, 'Feather (-70');
    await featherRow.locator('input[type="number"]').fill('68');
    await page.getByRole('button', { name: /Save categories|Сохранить категории/i }).click();
    await expect(page.getByRole('button', { name: /Save categories|Сохранить категории/i })).toBeDisabled({ timeout: 8000 });

    // Reloading confirms the boundary persisted server-side.
    await page.reload();
    await page.getByTitle(/Settings|Настройки/i).click();
    const featherRowAfterReload = await findRowByNameValue(page, 'Feather (-70');
    await expect(featherRowAfterReload.locator('input[type="number"]')).toHaveValue('68', { timeout: 8000 });

    // Two athletes under the new 68kg boundary (both land in Feather, giving
    // it a poolable pair) and one over it (lands in the next category up,
    // Light) — a bracket needs >= 2 pooled competitors to generate at all.
    const addAthlete = async (name: string, weight: string) => {
      await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
      await page.locator('input[placeholder="Иван Иванов"]').fill(name);
      await page.locator('input[placeholder="88.3"]').fill(weight);
      await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
    };

    await page.getByTitle(/Athletes|Атлеты/i).click();
    await addAthlete('Feather Athlete A', '65');
    await addAthlete('Feather Athlete B', '67');
    await addAthlete('Light Athlete Over Boundary', '69');

    await expect(page.locator('text=Feather Athlete A')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Feather Athlete B')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Light Athlete Over Boundary')).toBeVisible({ timeout: 8000 });

    // Generate a bracket for the Feather category — only the 67kg athlete should be pooled in.
    await page.getByTitle(/Brackets|Сетки/i).click();

    // Timer stays mounted (hidden) in the background across view switches and
    // has its own "Mat" <select> — scope to the category dropdown specifically
    // (identified by its "All Divisions" placeholder option) rather than
    // `.first()`, which would otherwise grab Timer's hidden select instead.
    const categorySelect = page.locator('select').filter({ has: page.getByRole('option', { name: /All Divisions|Все категории/i }) });

    let featherOption: string | undefined;
    await expect.poll(async () => {
      const options = await categorySelect.locator('option').allTextContents();
      featherOption = options.find(o => /Feather/.test(o) && !/Light Feather/.test(o));
      return featherOption;
    }, { timeout: 8000 }).toBeTruthy();
    await categorySelect.selectOption({ label: featherOption! });

    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await expect(page.locator('text=Feather Athlete A')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Feather Athlete B')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Light Athlete Over Boundary')).toHaveCount(0);
  });
});
