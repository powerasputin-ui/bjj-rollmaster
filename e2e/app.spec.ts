import { test, expect } from '@playwright/test';
import { createTestTournament } from './helpers/testTournament';

test.describe('BJJ RollMaster', () => {
  test('home page loads and shows dashboard', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await page.addInitScript((token) => localStorage.setItem('bjj_session_token', token), tournament.token);
    await page.goto('/');
    await expect(page).toHaveTitle(/BJJ RollMaster/i);
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });

  test('navigation between views works', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await page.addInitScript((token) => localStorage.setItem('bjj_session_token', token), tournament.token);
    await page.goto('/');
    await page.getByRole('button', { name: /timer|табло|scoreboard/i }).first().click();
    await expect(page.locator('text=/START|СТАРТ|Pause|Пауза/i').first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /athletes|атлеты|tournament/i }).first().click();
    await expect(page.locator('text=/Roster|Список|Add Athlete|Добавить/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('language toggle exists', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await page.addInitScript((token) => localStorage.setItem('bjj_session_token', token), tournament.token);
    await page.goto('/');
    const langButton = page.locator('button').filter({ hasText: /^EN$|^RU$/ });
    await expect(langButton).toBeVisible();
  });

  test('unauthenticated visitor sees the login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/Sign In|Вход/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('display mode from URL works without login', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    await page.goto(`/?display=true&lang=en&t=${tournament.slug}`);
    await expect(page.locator('text=/Competitor A|Спортсмен А/i').first()).toBeVisible({ timeout: 5000 });
  });
});
