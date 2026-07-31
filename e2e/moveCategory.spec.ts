import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

test.describe('moving a lone competitor to another category', () => {
  test('a category with a single athlete is flagged, and moving them changes their belt/weight/age group', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await request.post('/api/competitors', {
      headers: orgHeaders,
      data: { id: `lonely-${unique}`, name: `Lonely Athlete ${unique}`, belt: 'Blue', weight: '70', team: 'T1', ageGroup: 'Adult' },
    });

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/Athletes|Атлеты/i).click();

    const card = page.locator(`text=Lonely Athlete ${unique}`).locator('xpath=ancestor::div[contains(@class,"rounded-[2rem]")]');
    await expect(card).toBeVisible({ timeout: 8000 });
    // The "alone in category" badge lives on the category header, a sibling of the card.
    await expect(page.locator('text=/Alone|Один/i')).toBeVisible();

    await card.getByRole('button', { name: /^Move$|^Перенести$/ }).click();

    const modal = page.getByRole('heading', { name: /Move to another category|Перенести в другую категорию/i }).locator('xpath=ancestor::div[contains(@class,"rounded-[3rem]")]');
    await modal.locator('select').first().selectOption('Kid');
    await modal.locator('input[placeholder="88.3"]').fill('35');
    await modal.getByRole('button', { name: /^Move$|^Перенести$/ }).click();

    // Modal closes and the athlete now shows up under the Kid age group instead of Adult.
    await expect(page.getByRole('heading', { name: /Move to another category|Перенести в другую категорию/i })).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator(`text=Lonely Athlete ${unique}`)).toHaveCount(0);

    await page.getByRole('button', { name: /^Juvenile\/Kids$|^Дети\/Юниоры$/ }).click();
    await expect(page.locator(`text=Lonely Athlete ${unique}`)).toBeVisible({ timeout: 8000 });

    const competitorsRes = await request.get('/api/competitors', { headers: orgHeaders });
    const moved = (await competitorsRes.json()).find((c: { id: string }) => c.id === `lonely-${unique}`);
    expect(moved.ageGroup).toBe('Kid');
    expect(moved.weight).toBe('35');
  });
});
