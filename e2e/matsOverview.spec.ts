import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

test.describe('all-mats coordinator overview', () => {
  test('shows the ongoing match on its mat and a fully-paired pending match as next up, per mat', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const c1 = `mats-c1-${unique}`;
    const c2 = `mats-c2-${unique}`;
    const c3 = `mats-c3-${unique}`;
    const c4 = `mats-c4-${unique}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c1, name: `Mats Current A ${unique}`, belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c2, name: `Mats Current B ${unique}`, belt: 'White', weight: '70', team: 'T2', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c3, name: `Mats Next A ${unique}`, belt: 'White', weight: '80', team: 'T3', ageGroup: 'Adult' } });
    await request.post('/api/competitors', { headers: orgHeaders, data: { id: c4, name: `Mats Next B ${unique}`, belt: 'White', weight: '80', team: 'T4', ageGroup: 'Adult' } });

    await request.put(`/api/matches/bracket/Adult_White_ongoing${unique}`, {
      headers: orgHeaders,
      data: {
        matches: [
          { id: `m_ongoing_${unique}`, competitor1Id: c1, competitor2Id: c2, score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'ongoing', round: 1, bracketId: `Adult_White_ongoing${unique}`, mat: '3' },
        ],
      },
    });
    await request.put(`/api/matches/bracket/Adult_White_next${unique}`, {
      headers: orgHeaders,
      data: {
        matches: [
          { id: `m_next_${unique}`, competitor1Id: c3, competitor2Id: c4, score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'pending', round: 1, bracketId: `Adult_White_next${unique}`, mat: '3' },
        ],
      },
    });

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/^All Mats$|^Все ковры$/i).click();

    await expect(page.locator('span').getByText('Mat 3', { exact: true }).or(page.locator('span').getByText('Ковер 3', { exact: true }))).toBeVisible({ timeout: 8000 });
    const mat3Card = page.locator('span').getByText('Mat 3', { exact: true }).or(page.locator('span').getByText('Ковер 3', { exact: true }))
      .locator('xpath=ancestor::div[contains(@class,"rounded-[2rem]")]');
    await expect(mat3Card.locator(`text=Mats Current A ${unique}`)).toBeVisible();
    await expect(mat3Card.locator(`text=Mats Current B ${unique}`)).toBeVisible();
    await expect(mat3Card.locator(`text=Mats Next A ${unique}`)).toBeVisible();
    await expect(mat3Card.locator(`text=Mats Next B ${unique}`)).toBeVisible();

    // A mat with nothing assigned (e.g. Mat 1) shows the empty placeholder twice (current + next).
    const mat1Card = page.locator('span').getByText('Mat 1', { exact: true }).or(page.locator('span').getByText('Ковер 1', { exact: true }))
      .locator('xpath=ancestor::div[contains(@class,"rounded-[2rem]")]');
    await expect(mat1Card.locator('text=/Nothing assigned|Ничего не назначено/i')).toHaveCount(2);
  });
});
