import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

test.describe('mat referee console', () => {
  test('a referee link is locked to its mat, can finish a match, and the organizer sees the result', async ({ page, request, browser }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const c1 = `ref-c1-${unique}`;
    const c2 = `ref-c2-${unique}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c1, name: 'Referee Test Athlete A', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c2, name: 'Referee Test Athlete B', belt: 'White', weight: '70', team: 'T2', ageGroup: 'Adult' } });

    const bracketId = `Adult_White_feather${unique}`;
    const matchId = `m_ref_test_${unique}`;
    await request.put(`/api/matches/bracket/${bracketId}`, {
      headers: orgHeaders,
      data: {
        matches: [
          { id: matchId, competitor1Id: c1, competitor2Id: c2, score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'ongoing', round: 1, bracketId, mat: '2' },
        ],
      },
    });

    // Organizer generates the referee link for Mat 2 in Settings.
    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/Settings|Настройки/i).click();
    await page.getByRole('button', { name: /Generate|Сгенерировать/i }).nth(1).click(); // rows are Mat 1..5, index 1 = Mat 2

    const linkInput = page.locator('input[readonly]').filter({ hasNot: page.locator('[value*="register=true"]') });
    let refereeUrl: string | undefined;
    await expect.poll(async () => {
      const values = await linkInput.evaluateAll(els => els.map(e => (e as HTMLInputElement).value));
      refereeUrl = values.find(v => v.includes('operator=true') && v.includes('mat=2'));
      return refereeUrl;
    }, { timeout: 8000 }).toBeTruthy();

    // Referee opens the link in a fresh context — no tokens at all.
    const refContext = await browser.newContext();
    const refPage = await refContext.newPage();
    await refPage.goto(refereeUrl!);

    // Locked to Mat 2 — no mat switcher, no global settings toggle.
    await expect(refPage.locator('text=/Mat 2|Ковер 2/i')).toBeVisible({ timeout: 8000 });
    await expect(refPage.locator('select')).toHaveCount(0);
    await expect(refPage.getByRole('button', { name: /⚙️/ })).toHaveCount(0);
    await expect(refPage.locator('text=Referee Test Athlete A').first()).toBeVisible();
    await expect(refPage.locator('text=Referee Test Athlete B').first()).toBeVisible();

    // Finish the match declaring Athlete A the winner.
    await refPage.getByRole('button', { name: /Finalize Match|Завершить схватку/i }).first().click();
    await refPage.getByRole('button', { name: 'Referee Test Athlete A' }).click();
    await refPage.getByRole('button', { name: /Finalize Match|Завершить схватку/i }).last().click();

    // Organizer sees the finished result via the API.
    await expect.poll(async () => {
      const res = await request.get('/api/matches', { headers: orgHeaders });
      const body = await res.json();
      const m = body.find((mm: { id: string }) => mm.id === matchId);
      return m?.status;
    }, { timeout: 8000 }).toBe('finished');

    const finalRes = await request.get('/api/matches', { headers: orgHeaders });
    const finalMatch = (await finalRes.json()).find((mm: { id: string }) => mm.id === matchId);
    expect(finalMatch.winnerId).toBe(c1);

    await refContext.close();
  });

  test('a referee cannot finish a match on a different mat', async ({ request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const c1 = `wrong-mat-c1-${unique}`;
    const c2 = `wrong-mat-c2-${unique}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c1, name: 'Wrong Mat Athlete A', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c2, name: 'Wrong Mat Athlete B', belt: 'White', weight: '70', team: 'T2', ageGroup: 'Adult' } });

    const bracketId = `Adult_White_light${unique}`;
    const matchId = `m_wrong_mat_test_${unique}`;
    await request.put(`/api/matches/bracket/${bracketId}`, {
      headers: orgHeaders,
      data: {
        matches: [
          { id: matchId, competitor1Id: c1, competitor2Id: c2, score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'ongoing', round: 1, bracketId, mat: '3' },
        ],
      },
    });

    const mint = await request.post('/api/tournament/mats/1/token', { headers: orgHeaders });
    const wrongMatToken = (await mint.json()).token;

    const finish = await request.post(`/api/matches/${matchId}/finish`, {
      headers: { Authorization: `Bearer ${wrongMatToken}` },
      data: { winnerId: c1, method: 'Points', score1: { points: 4, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, logs: [] },
    });
    expect(finish.status()).toBe(403);
  });
});
