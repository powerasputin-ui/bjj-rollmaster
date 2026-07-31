import { test, expect, type Page } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

// Plays every currently-clickable match slot (competitor1 vs competitor2, both
// filled, no winner yet) to completion, always crowning whichever athlete is
// listed first in the slot — mirrors the deterministic "always pick
// competitor1" strategy used by services/__tests__/bracketGenerator.test.ts's
// simulate() helper, which is what proves this converges for both formats.
async function playAllMatches(page: Page): Promise<void> {
  const finalizeButton = page.getByRole('button', { name: /Finalize Match|Завершить схватку/i });
  for (let i = 0; i < 30; i++) {
    const slot = page.locator('main div.cursor-pointer').first();
    if ((await slot.count()) === 0) return;
    await slot.click();
    await finalizeButton.click();
    await expect(finalizeButton).toHaveCount(0, { timeout: 8000 });
  }
  throw new Error('playAllMatches did not converge within 30 iterations — possible dead/unplayable match');
}

async function addAthlete(page: Page, name: string, weight: string): Promise<void> {
  await page.getByTitle(/Athletes|Атлеты/i).click();
  await page.getByRole('button', { name: /Add Athlete|Добавить атлета/i }).click();
  await page.locator('input[placeholder="Иван Иванов"]').fill(name);
  await page.locator('input[placeholder="88.3"]').fill(weight);
  await page.getByRole('button', { name: /^Register$|^Зарегистрировать$/i }).click();
  await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 8000 });
}

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

test.describe('double elimination and round robin bracket formats', () => {
  test('a round-robin-default tournament generates round-robin matches and a standings table once all are played', async ({ page, request }) => {
    const tournament = await createTestTournament(request, { defaultBracketFormat: 'round_robin' });
    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    await addAthlete(page, 'RR Athlete A', '70');
    await addAthlete(page, 'RR Athlete B', '70');
    await addAthlete(page, 'RR Athlete C', '70');

    await selectOnlyCategory(page);

    // Default format is round-robin — generate without switching the picker.
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    // n=3 round robin -> exactly 3 matches, 2 clickable athlete slots each.
    await expect(page.locator('main div.cursor-pointer')).toHaveCount(6, { timeout: 8000 });

    await playAllMatches(page);

    const standingsRows = page.locator('table tbody tr');
    await expect(standingsRows).toHaveCount(3, { timeout: 8000 });
    // Sorted descending by win count, and 3 matches total means wins sum to 3.
    const winCounts = await standingsRows.evaluateAll(rows =>
      rows.map(r => parseInt((r as HTMLElement).querySelectorAll('td')[2].textContent || '0', 10))
    );
    expect(winCounts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(winCounts[0]).toBeGreaterThanOrEqual(winCounts[1]);
    expect(winCounts[1]).toBeGreaterThanOrEqual(winCounts[2]);
  });

  test('overriding to double elimination for a 4-athlete category produces winners/losers/grand-final sections and a single-bronze podium', async ({ page, request }) => {
    const tournament = await createTestTournament(request, { defaultBracketFormat: 'single' });
    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    await addAthlete(page, 'DE Athlete A', '80');
    await addAthlete(page, 'DE Athlete B', '80');
    await addAthlete(page, 'DE Athlete C', '80');
    await addAthlete(page, 'DE Athlete D', '80');

    await selectOnlyCategory(page);

    // Override the tournament default (single) to double elimination for this category.
    await page.getByRole('button', { name: /Double elimination/i }).click();
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await expect(page.locator('text=/Winners bracket|Сетка победителей/i')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=/Losers bracket|Сетка проигравших/i')).toBeVisible();
    await expect(page.locator('text=/Grand final|Гранд-финал/i')).toBeVisible();

    // n=4 double-elim: 3 WB + 2 LB + 1 GF = 6 total matches to play through.
    await playAllMatches(page);

    // Podium: gold + silver + exactly ONE bronze (double-elim simplification).
    await expect(page.locator('text=/1st|1 место/i')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=/2nd|2 место/i')).toBeVisible();
    const thirdPlaceLabels = page.locator('text=/3rd|3 место/i');
    await expect(thirdPlaceLabels).toHaveCount(1);
  });
});
