import { test, expect, type Page } from '@playwright/test';
import { createTestTournament, signInAsTestTournament } from './helpers/testTournament';

async function fillBaseRegistration(page: Page, name: string, weight: string, email: string): Promise<void> {
  await page.locator('input[placeholder="Иван Иванов"]').fill(name);
  await page.locator('input[placeholder="88.3"]').fill(weight);
  await page.locator('input[placeholder="you@example.com"]').fill(email);
}

async function submitRegistration(page: Page): Promise<string> {
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/registrations') && res.request().method() === 'POST'),
    page.getByRole('button', { name: /Submit Request|Отправить заявку/i }).click(),
  ]);
  const body = await response.json();
  return body.devVerifyToken as string;
}

test.describe('Gi / No-Gi sparring format', () => {
  test('a "both" tournament shows the format picker and blocks submission until one is chosen', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tournament = await createTestTournament(request, { sparringFormat: 'both' });

    await page.goto(`/?register=true&t=${tournament.slug}`);
    await fillBaseRegistration(page, `Both Picker ${unique}`, '70', `bothpicker-${unique}@example.com`);

    const giButton = page.getByRole('button', { name: /^Gi$|^Ги$/ });
    const noGiButton = page.getByRole('button', { name: /^No-Gi$|^Ноги$/ });
    await expect(giButton).toBeVisible();
    await expect(noGiButton).toBeVisible();

    // Gi is checked by default per the form's initial state — uncheck it so neither is selected.
    await giButton.click();
    await expect(page.getByRole('button', { name: /Submit Request|Отправить заявку/i })).toBeDisabled();

    await noGiButton.click();
    await expect(page.getByRole('button', { name: /Submit Request|Отправить заявку/i })).toBeEnabled();
  });

  test('an athlete registered for both formats appears in two independent categories on Brackets', async ({ page, request }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tournament = await createTestTournament(request, { sparringFormat: 'both' });
    const orgHeaders = { Authorization: `Bearer ${tournament.token}` };

    await page.goto(`/?register=true&t=${tournament.slug}`);
    await fillBaseRegistration(page, `Both Formats ${unique}`, '70', `bothformats-${unique}@example.com`);
    // Leave Gi checked (default) and also check No-Gi.
    await page.getByRole('button', { name: /^No-Gi$|^Ноги$/ }).click();
    const verifyToken = await submitRegistration(page);
    await request.post('/api/public/verify-registration', { data: { token: verifyToken } });

    // A second, gi-only athlete in the same weight/belt so each bracket has 2 competitors.
    await page.goto(`/?register=true&t=${tournament.slug}`);
    await fillBaseRegistration(page, `Zeta Opponent ${unique}`, '70', `giopponent-${unique}@example.com`);
    const verifyToken2 = await submitRegistration(page);
    await request.post('/api/public/verify-registration', { data: { token: verifyToken2 } });
    // A third, no-gi-only athlete for the no-gi bracket's second slot.
    await page.goto(`/?register=true&t=${tournament.slug}`);
    await fillBaseRegistration(page, `Wombat Opponent ${unique}`, '70', `nogiopponent-${unique}@example.com`);
    await page.getByRole('button', { name: /^Gi$|^Ги$/ }).click();
    await page.getByRole('button', { name: /^No-Gi$|^Ноги$/ }).click();
    const verifyToken3 = await submitRegistration(page);
    await request.post('/api/public/verify-registration', { data: { token: verifyToken3 } });

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/Requests|Заявки/i).click();
    for (const name of [`Both Formats ${unique}`, `Zeta Opponent ${unique}`, `Wombat Opponent ${unique}`]) {
      const row = page.locator(`text=${name}`).first();
      await expect(row).toBeVisible({ timeout: 8000 });
      await row.locator('xpath=ancestor::div[contains(@class, "rounded-[2rem]")]').getByRole('button', { name: /Approve|Подтвердить/i }).click();
      await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 8000 });
    }

    await page.getByTitle(/Brackets|Сетки/i).click();
    const categorySelect = page.locator('select').filter({ has: page.getByRole('option', { name: /All Divisions|Все категории/i }) });
    let giOption: string | undefined;
    let noGiOption: string | undefined;
    await expect.poll(async () => {
      const options = await categorySelect.locator('option').allTextContents();
      giOption = options.find(o => /^Gi \|/.test(o) || /^Ги \|/.test(o));
      noGiOption = options.find(o => /^No-Gi \|/.test(o) || /^Ноги \|/.test(o));
      return !!giOption && !!noGiOption;
    }, { timeout: 8000 }).toBe(true);

    // Gi category: "Both Formats" + "Zeta Opponent" = 2. No-Gi category: "Both Formats" + "Wombat Opponent" = 2.
    expect(giOption).toMatch(/\(\d+\/2\)/);
    expect(noGiOption).toMatch(/\(\d+\/2\)/);

    // Generate the Gi bracket and confirm it holds exactly the two Gi-side athletes.
    await categorySelect.selectOption({ label: giOption! });
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();
    await expect(page.locator(`text=Both Formats ${unique}`)).toBeVisible({ timeout: 8000 });
    await expect(page.locator(`text=Zeta Opponent ${unique}`)).toBeVisible();

    // Generate the No-Gi bracket (an independent category/bracketId) too.
    await categorySelect.selectOption({ label: noGiOption! });
    await page.getByRole('button', { name: /Build Bracket|Создать сетку/i }).click();
    await expect(page.locator(`text=Wombat Opponent ${unique}`)).toBeVisible({ timeout: 8000 });

    // Verify via the API that the two brackets are independent: each has its
    // own bracketId, and the two "only" opponents never appear in the other's bracket.
    const matchesRes = await request.get('/api/matches', { headers: orgHeaders });
    const allMatches = await matchesRes.json() as { bracketId: string; competitor1Id: string | null; competitor2Id: string | null }[];
    const byBracket = new Map<string, { competitor1Id: string | null; competitor2Id: string | null }[]>();
    allMatches.forEach(m => {
      const list = byBracket.get(m.bracketId) ?? [];
      list.push(m);
      byBracket.set(m.bracketId, list);
    });
    const giBracketIds = Array.from(byBracket.keys()).filter(id => id.startsWith('gi_'));
    const noGiBracketIds = Array.from(byBracket.keys()).filter(id => id.startsWith('nogi_'));
    expect(giBracketIds.length).toBeGreaterThan(0);
    expect(noGiBracketIds.length).toBeGreaterThan(0);

    const competitorsRes = await request.get('/api/competitors', { headers: orgHeaders });
    const allCompetitors = await competitorsRes.json() as { id: string; name: string }[];
    const nameOf = (id: string | null) => allCompetitors.find(c => c.id === id)?.name;

    const giCompetitorIds = giBracketIds.flatMap(id => byBracket.get(id)!).flatMap(m => [m.competitor1Id, m.competitor2Id]).filter(Boolean).map(id => nameOf(id!));
    const noGiCompetitorIds = noGiBracketIds.flatMap(id => byBracket.get(id)!).flatMap(m => [m.competitor1Id, m.competitor2Id]).filter(Boolean).map(id => nameOf(id!));

    expect(giCompetitorIds).toContain(`Both Formats ${unique}`);
    expect(giCompetitorIds).toContain(`Zeta Opponent ${unique}`);
    expect(giCompetitorIds).not.toContain(`Wombat Opponent ${unique}`);

    expect(noGiCompetitorIds).toContain(`Both Formats ${unique}`);
    expect(noGiCompetitorIds).toContain(`Wombat Opponent ${unique}`);
    expect(noGiCompetitorIds).not.toContain(`Zeta Opponent ${unique}`);
  });

  test('a "gi" (default) tournament shows no format picker and behaves exactly as before', async ({ page, request }) => {
    const tournament = await createTestTournament(request);
    expect(tournament).toBeTruthy();

    await page.goto(`/?register=true&t=${tournament.slug}`);
    await expect(page.getByRole('button', { name: /^Gi$|^Ги$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^No-Gi$|^Ноги$/ })).toHaveCount(0);

    await signInAsTestTournament(page, tournament);
    await page.goto('/');
    await page.getByTitle(/Brackets|Сетки/i).click();
    // No sparring-format filter toggle in the header for a single-format tournament.
    await expect(page.getByRole('button', { name: /^No-Gi$|^Ноги$/ })).toHaveCount(0);
  });
});
