import { test, expect } from '@playwright/test';

async function registerOrganizer(request: import('@playwright/test').APIRequestContext) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-multi-${unique}@example.com`;
  const res = await request.post('/api/auth/register', { data: { email, password: 'TestPassword123!' } });
  const { token } = await res.json();
  return { email, userToken: token as string };
}

async function createTournament(request: import('@playwright/test').APIRequestContext, userToken: string, name: string) {
  const res = await request.post('/api/tournaments', {
    headers: { Authorization: `Bearer ${userToken}` },
    data: { name },
  });
  return await res.json();
}

test.describe('Multi-tournament accounts and the public catalog', () => {
  test('an organizer can create two tournaments, switch between them, and each keeps its own roster', async ({ page, request }) => {
    const { userToken } = await registerOrganizer(request);
    const created1 = await createTournament(request, userToken, `Spring Open ${Date.now()}`);
    const created2 = await createTournament(request, userToken, `Summer Cup ${Date.now()}`);

    // Add a distinct athlete to tournament 1 via its own session token.
    await request.post('/api/competitors', {
      headers: { Authorization: `Bearer ${created1.token}` },
      data: { id: 'switch-athlete-1', name: 'Athlete One', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' },
    });
    await request.post('/api/competitors', {
      headers: { Authorization: `Bearer ${created2.token}` },
      data: { id: 'switch-athlete-2', name: 'Athlete Two', belt: 'White', weight: '80', team: 'T2', ageGroup: 'Adult' },
    });

    await page.addInitScript((t: string) => localStorage.setItem('bjj_user_token', t), userToken);
    await page.goto('/');

    // Lands in the hub with both tournaments listed.
    await expect(page.locator(`text=${created1.tournament.name}`)).toBeVisible({ timeout: 8000 });
    await expect(page.locator(`text=${created2.tournament.name}`)).toBeVisible({ timeout: 8000 });

    // Open tournament 1, verify its roster.
    await page.locator(`text=${created1.tournament.name}`).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]').getByRole('button', { name: /Open|Открыть/i }).click();
    await page.getByTitle(/Athletes|Атлеты/i).click();
    await expect(page.locator('text=Athlete One')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Athlete Two')).toHaveCount(0);

    // Switch tournament — back to the hub, open tournament 2, verify its roster.
    await page.getByTitle(/Settings|Настройки/i).click();
    await page.getByRole('button', { name: /Switch tournament|Сменить турнир/i }).click();
    await expect(page.locator(`text=${created2.tournament.name}`)).toBeVisible({ timeout: 8000 });
    await page.locator(`text=${created2.tournament.name}`).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]').getByRole('button', { name: /Open|Открыть/i }).click();
    await page.getByTitle(/Athletes|Атлеты/i).click();
    await expect(page.locator('text=Athlete Two')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Athlete One')).toHaveCount(0);
  });

  test('athlete finds a published tournament through the public catalog and registers', async ({ page, request }) => {
    const { userToken } = await registerOrganizer(request);
    const created = await createTournament(request, userToken, `Catalog Open ${Date.now()}`);
    await request.patch(`/api/tournaments/${created.tournament.id}`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { status: 'published' },
    });

    await page.goto('/');
    await expect(page.locator(`text=${created.tournament.name}`)).toBeVisible({ timeout: 8000 });

    await page.locator(`text=${created.tournament.name}`).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")]').getByRole('link', { name: /Register|Зарегистрироваться/i }).click();
    await expect(page.locator('h1')).toContainText(/Tournament Registration|Регистрация на турнир/i);
  });

  test('a draft tournament does not appear in the public catalog', async ({ page, request }) => {
    const { userToken } = await registerOrganizer(request);
    const created = await createTournament(request, userToken, `Hidden Draft ${Date.now()}`);

    await page.goto('/');
    await expect(page.locator(`text=${created.tournament.name}`)).toHaveCount(0);
  });
});
