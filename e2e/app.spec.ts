import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

test.describe('BJJ RollMaster', () => {
  test('home page loads and shows dashboard', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await expect(page).toHaveTitle(/BJJ RollMaster/i);
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });

  test('navigation between views works', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByRole('button', { name: /timer|табло|scoreboard/i }).first().click();
    await expect(page.locator('text=/START|СТАРТ|Pause|Пауза/i').first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /athletes|атлеты|tournament/i }).first().click();
    await expect(page.locator('text=/Roster|Список|Add Athlete|Добавить/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('language toggle exists', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    const langButton = page.locator('button').filter({ hasText: /^EN$|^RU$/ });
    await expect(langButton).toBeVisible();
  });

  test('unauthenticated visitor sees the public tournament catalog by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/Upcoming Tournaments|Турниры/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('?login=true shows the organizer sign-in screen', async ({ page }) => {
    await page.goto('/?login=true');
    await expect(page.locator('text=/Welcome|Добро пожаловать/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('a fresh organizer account with no tournaments sees the tournaments hub', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const register = await request.post('/api/auth/register', {
      data: { email: `e2e-hub-${unique}@example.com`, password: 'TestPassword123!' },
    });
    const { token } = await register.json();
    await page.addInitScript((t: string) => localStorage.setItem('bjj_user_token', t), token);
    await page.goto('/');
    await expect(page.locator('text=/Your Tournaments|Ваши турниры/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('display mode from URL works without login', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await page.goto(`/?display=true&lang=en&t=${tournament.slug}`);
    await expect(page.locator('text=/Competitor A|Спортсмен А/i').first()).toBeVisible({ timeout: 5000 });
  });
});
