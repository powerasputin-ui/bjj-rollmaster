import { test, expect } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

// Submits the public registration form and returns the dev-mode verification
// token from the response — the same anti-spam gate covered by
// server/src/__tests__/api.test.ts, exercised here through the real UI.
async function submitRegistration(page: import('@playwright/test').Page, name: string, weight: string, email: string): Promise<string> {
  await page.locator('input[placeholder="Иван Иванов"]').fill(name);
  await page.locator('input[placeholder="88.3"]').fill(weight);
  await page.locator('input[placeholder="you@example.com"]').fill(email);

  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/registrations') && res.request().method() === 'POST'),
    page.getByRole('button', { name: /Submit Request|Отправить заявку/i }).click(),
  ]);
  const body = await response.json();
  return body.devVerifyToken as string;
}

test.describe('Self-registration and moderation', () => {
  test('athlete submits a public registration request', async ({ page, request }) => {
    const tournament = await createTestTournament(request);

    await page.goto(`/?register=true&t=${tournament.slug}`);
    await expect(page.locator('h1')).toContainText(/Tournament Registration|Регистрация на турнир/i);

    await submitRegistration(page, 'E2E Test Athlete', '77', 'e2e-submit@example.com');
    await expect(page.locator('text=/Request submitted|Заявка отправлена/i')).toBeVisible({ timeout: 5000 });
  });

  test('organizer approves the request and the athlete appears in the roster', async ({ page, request }) => {
    const tournament = await createTestTournament(request);

    // Submit a request to this tournament's public registration link, then
    // confirm the email (dev-mode token) — unverified registrations never
    // reach the organizer's pending queue.
    await page.goto(`/?register=true&t=${tournament.slug}`);
    const verifyToken = await submitRegistration(page, 'Approval Flow Athlete', '82', 'e2e-approval@example.com');
    await expect(page.locator('text=/Request submitted|Заявка отправлена/i')).toBeVisible({ timeout: 5000 });
    await request.post('/api/public/verify-registration', { data: { token: verifyToken } });

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
    const verifyToken = await submitRegistration(page, 'Isolation Test Athlete', '70', 'e2e-isolation@example.com');
    await expect(page.locator('text=/Request submitted|Заявка отправлена/i')).toBeVisible({ timeout: 5000 });
    await request.post('/api/public/verify-registration', { data: { token: verifyToken } });

    await signInAsTestTournament(page, tournamentB);
    await page.goto('/');
    await page.getByTitle(/Requests|Заявки/i).click();
    await expect(page.locator('text=Isolation Test Athlete')).toHaveCount(0);
  });
});
