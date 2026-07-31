import type { APIRequestContext } from '@playwright/test';

export interface TestTournament {
  email: string;
  password: string;
  tournamentName: string;
  userToken: string;
  token: string;
  slug: string;
}

// Registers a fresh, one-off organizer account, then creates a tournament for
// it — the real two-step flow (account registration is separate from
// tournament creation; an account may own several tournaments), via the real
// /api/auth/register + /api/tournaments endpoints.
export async function createTestTournament(request: APIRequestContext): Promise<TestTournament> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${unique}@example.com`;
  const password = 'TestPassword123!';
  const tournamentName = `E2E Tournament ${unique}`;

  const register = await request.post('/api/auth/register', {
    data: { email, password },
  });
  if (!register.ok()) {
    throw new Error(`Failed to register test account: ${register.status()} ${await register.text()}`);
  }
  const { token: userToken } = await register.json();

  const created = await request.post('/api/tournaments', {
    headers: { Authorization: `Bearer ${userToken}` },
    data: { name: tournamentName },
  });
  if (!created.ok()) {
    throw new Error(`Failed to create test tournament: ${created.status()} ${await created.text()}`);
  }
  const body = await created.json();
  return { email, password, tournamentName, userToken, token: body.token as string, slug: body.tournament.slug as string };
}

// Both tokens are needed for a page load to land straight in the tournament
// dashboard — App.tsx validates the user-token via /api/auth/me, then (if
// present) restores the active tournament from the session-token.
export async function signInAsTestTournament(page: { addInitScript: (fn: (t: TestTournament) => void, arg: TestTournament) => Promise<void> }, tournament: TestTournament): Promise<void> {
  await page.addInitScript((t: TestTournament) => {
    localStorage.setItem('bjj_user_token', t.userToken);
    localStorage.setItem('bjj_session_token', t.token);
  }, tournament);
}
