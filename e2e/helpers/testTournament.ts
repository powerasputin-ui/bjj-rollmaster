import type { APIRequestContext } from '@playwright/test';

export interface TestTournament {
  email: string;
  password: string;
  tournamentName: string;
  token: string;
  slug: string;
}

// Registers a fresh, one-off organizer account + tournament for a single test,
// via the real /api/auth/register endpoint (no more shared ADMIN_TOKEN — every
// tenant is now isolated, so each e2e test needs its own account).
export async function createTestTournament(request: APIRequestContext): Promise<TestTournament> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${unique}@example.com`;
  const password = 'TestPassword123!';
  const tournamentName = `E2E Tournament ${unique}`;

  const res = await request.post('/api/auth/register', {
    data: { email, password, tournamentName },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create test tournament: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return { email, password, tournamentName, token: body.token as string, slug: body.tournament.slug as string };
}
