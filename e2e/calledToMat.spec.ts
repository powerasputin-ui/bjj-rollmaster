import { test, expect, type Page } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

async function submitRegistration(page: Page, name: string, weight: string, email: string): Promise<string> {
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

test.describe('real-time "called to mat" notification for the athlete cabinet', () => {
  test('an athlete watching their cabinet sees a banner the instant the organizer calls their match to a mat', async ({ page, request, browser }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `called-e2e-${unique}@example.com`;
    const opponentId = `opponent-${unique}`;
    const tournament = await createTestTournament(request);
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    // Athlete self-registers, confirms email (mints an athlete session), and
    // the organizer approves them — WS notification only fires for approved
    // (competing) registrations, per AthleteCabinet.tsx.
    await page.goto(`/?register=true&t=${tournament.slug}`);
    const verifyToken = await submitRegistration(page, `Called Athlete ${unique}`, '70', email);
    const verify = await request.post('/api/public/verify-registration', { data: { token: verifyToken } });
    const { token: athleteToken } = await verify.json();

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/Requests|Заявки/i).click();
    const row = page.locator(`text=Called Athlete ${unique}`).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.locator('xpath=ancestor::div[contains(@class, "rounded-[2rem]")]').getByRole('button', { name: /Approve|Подтвердить/i }).click();
    await expect(page.locator(`text=Called Athlete ${unique}`)).toHaveCount(0, { timeout: 8000 });

    // Look up the resulting competitor id (needed to seed a real match).
    const competitorsRes = await request.get('/api/competitors', { headers: orgHeaders });
    const competitor = (await competitorsRes.json()).find((c: { name: string }) => c.name === `Called Athlete ${unique}`);
    expect(competitor).toBeTruthy();

    await request.post('/api/competitors', { headers: orgHeaders, data: { id: opponentId, name: `Opponent ${unique}`, belt: 'White', weight: '70', team: 'T2', ageGroup: 'Adult' } });

    const bracketId = `Adult_White_calledtest${unique}`;
    const matchId = `m_called_test_${unique}`;
    await request.put(`/api/matches/bracket/${bracketId}`, {
      headers: orgHeaders,
      data: {
        matches: [
          { id: matchId, competitor1Id: competitor.id, competitor2Id: opponentId, score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'pending', round: 1, bracketId },
        ],
      },
    });

    // Athlete opens their cabinet in a fresh, unauthenticated-as-organizer context.
    const athleteContext = await browser.newContext();
    const athletePage = await athleteContext.newPage();
    await athletePage.addInitScript((t: string) => localStorage.setItem('bjj_athlete_token', t), athleteToken);
    await athletePage.goto('/?cabinet=true');
    await expect(athletePage.locator(`text=${tournament.tournamentName}`)).toBeVisible({ timeout: 8000 });
    await expect(athletePage.locator('text=/Called to the mat|Вызвали на ковёр/i')).toHaveCount(0);

    // Organizer calls the match to Mat 4 — the athlete's cabinet must show the banner without a page reload.
    await request.post(`/api/matches/${matchId}/call-to-mat`, { headers: orgHeaders, data: { mat: '4' } });

    await expect(athletePage.locator('text=/Called to the mat|Вызвали на ковёр/i')).toBeVisible({ timeout: 8000 });
    await expect(athletePage.locator('text=/Mat 4|Ковер 4/i')).toBeVisible();

    await athleteContext.close();
  });
});
