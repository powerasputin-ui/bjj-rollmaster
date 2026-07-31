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

test.describe('recording a no-show or disqualification as a formal match result', () => {
  test('organizer finishes a match by No-show and the result is recorded and propagated', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const c1 = `noshow-c1-${unique}`;
    const c2 = `noshow-c2-${unique}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c1, name: 'Present Athlete', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c2, name: 'Missing Athlete', belt: 'White', weight: '70', team: 'T2', ageGroup: 'Adult' } });

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await selectOnlyCategory(page);
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await page.locator('text=Present Athlete').first().click();
    await expect(page.getByRole('button', { name: /No-show|Неявка/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /No-show|Неявка/i }).click();
    await page.getByRole('button', { name: /Finalize Match|Завершить схватку/i }).last().click();

    await expect(page.locator('text=/No-show|Неявка/i').first()).toBeVisible({ timeout: 8000 });

    const finalRes = await request.get('/api/matches', { headers: orgHeaders });
    const finalMatch = (await finalRes.json()).find((m: { competitor1Id: string; competitor2Id: string }) =>
      [m.competitor1Id, m.competitor2Id].includes(c1) && [m.competitor1Id, m.competitor2Id].includes(c2)
    );
    expect(finalMatch.status).toBe('finished');
    expect(finalMatch.winnerId).toBe(c1);
    expect(finalMatch.winMethod).toMatch(/No-show|Неявка/i);
  });

  test('organizer finishes a match by Disqualification and the result is recorded', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const c1 = `dq-c1-${unique}`;
    const c2 = `dq-c2-${unique}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c1, name: 'Clean Athlete', belt: 'Blue', weight: '75', team: 'T1', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c2, name: 'Disqualified Athlete', belt: 'Blue', weight: '75', team: 'T2', ageGroup: 'Adult' } });

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await selectOnlyCategory(page);
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();

    await page.locator('text=Clean Athlete').first().click();
    await page.getByRole('button', { name: /Disqualification|Дисквалификация/i }).click();
    await page.getByRole('button', { name: /Finalize Match|Завершить схватку/i }).last().click();

    const finalRes = await request.get('/api/matches', { headers: orgHeaders });
    const finalMatch = (await finalRes.json()).find((m: { competitor1Id: string; competitor2Id: string }) =>
      [m.competitor1Id, m.competitor2Id].includes(c1) && [m.competitor1Id, m.competitor2Id].includes(c2)
    );
    expect(finalMatch.status).toBe('finished');
    expect(finalMatch.winnerId).toBe(c1);
    expect(finalMatch.winMethod).toMatch(/Disqualification|Дисквалификация/i);
  });
});
