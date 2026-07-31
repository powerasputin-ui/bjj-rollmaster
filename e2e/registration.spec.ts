import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

test.describe('Self-registration and moderation', () => {
  test('athlete submits a public registration request', async ({ page, request }) => {
    const tournament = await createTestTournament(request);

    await page.goto(`/?register=true&t=${tournament.slug}`);
    await expect(page.locator('h1')).toContainText(/Tournament Registration|Регистрация на турнир/i);

    await page.locator('input[placeholder="Иван Иванов"]').fill('E2E Test Athlete');
    await page.locator('input[placeholder="88.3"]').fill('77');
    await page.locator('input[placeholder="Академия Джиу-Джитсу"]').fill('E2E Academy');

    await page.getByRole('button', { name: /Submit Request|Отправить заявку/i }).click();
    await expect(page.locator('text=/Request submitted|Заявка отправлена/i')).toBeVisible({ timeout: 5000 });
  });

  test('organizer approves the request and the athlete appears in the roster', async ({ page, request }) => {
    const tournament = await createTestTournament(request);

    // Submit a request to this tournament's public registration link.
    await page.goto(`/?register=true&t=${tournament.slug}`);
    await page.locator('input[placeholder="Иван Иванов"]').fill('Approval Flow Athlete');
    await page.locator('input[placeholder="88.3"]').fill('82');
    await page.getByRole('button', { name: /Submit Request|Отправить заявку/i }).click();
    await expect(page.locator('text=/Request submitted|Заявка отправлена/i')).toBeVisible({ timeout: 5000 });

    // Organizer session: authenticate with this tournament's real session token.
    await signInAsTestTournament(page, tournament);
    await page.goto('/');

    await page.getByTitle(/Requests|Заявки/i).click();
    const row = page.locator('text=Approval Flow Athlete').first();
    await expect(row).toBeVisible({ timeout: 8000 });

    await row.locator('xpath=ancestor::div[contains(@class, "rounded-[2rem]")]').getByRole('button', { name: /Approve|Подтвердить/i }).click();
    await expect(page.locator('text=Approval Flow Athlete')).toHaveCount(0, { timeout: 8000 });

    await page.getByTitle(/Athletes|Атлеты/i).click();
    await expect(page.locator('text=Approval Flow Athlete')).toBeVisible({ timeout: 8000 });
  });

  test('registration submitted to tournament A does not appear in tournament B pending queue', async ({ page, request }) => {
    const tournamentA = await createTestTournament(request);
    const tournamentB = await createTestTournament(request);

    await page.goto(`/?register=true&t=${tournamentA.slug}`);
    await page.locator('input[placeholder="Иван Иванов"]').fill('Isolation Test Athlete');
    await page.locator('input[placeholder="88.3"]').fill('70');
    await page.getByRole('button', { name: /Submit Request|Отправить заявку/i }).click();
    await expect(page.locator('text=/Request submitted|Заявка отправлена/i')).toBeVisible({ timeout: 5000 });

    await signInAsTestTournament(page, tournamentB);
    await page.goto('/');
    await page.getByTitle(/Requests|Заявки/i).click();
    await expect(page.locator('text=Isolation Test Athlete')).toHaveCount(0);
  });
});
