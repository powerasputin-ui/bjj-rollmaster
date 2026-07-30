process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
delete process.env.RESEND_API_KEY;

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => ({
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({ sub: 'google-uid-1', email: 'googleuser@example.com' }),
      }),
    })),
  };
});

const app = createApp();

describe('register / login / me', () => {
  it('registers a new organizer with their own tournament', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password1', tournamentName: 'Tournament A' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tournament.name).toBe('Tournament A');
    expect(res.body.tournament.slug).toBeTruthy();
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password1', tournamentName: 'Tournament A2' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: '123', tournamentName: 'X' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const good = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'password1' });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  it('/me returns the authenticated user and tournament', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'password1' });
    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${login.body.token}` });
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@example.com');
    expect(me.body.tournament.name).toBe('Tournament A');
  });

  it('rejects /me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('concurrent registration', () => {
  it('does not crash when two requests race to register the same email — exactly one succeeds', async () => {
    const email = 'race@example.com';
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/auth/register')
          .send({ email, password: 'password1', tournamentName: `Race ${i}` })
      )
    );
    const succeeded = attempts.filter(r => r.status === 201);
    const conflicted = attempts.filter(r => r.status === 409);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(4);
    conflicted.forEach(r => expect(r.body.error).toBe('email_taken'));

    // The server must still be responsive afterwards, not crashed.
    const health = await request(app).get('/api/auth/me');
    expect(health.status).toBe(401);
  });
});

describe('tenant isolation', () => {
  it('one tournament cannot see or modify another tournament\'s data', async () => {
    const regA = await request(app)
      .post('/api/auth/register')
      .send({ email: 'tenantA@example.com', password: 'password1', tournamentName: 'Tenant A' });
    const regB = await request(app)
      .post('/api/auth/register')
      .send({ email: 'tenantB@example.com', password: 'password1', tournamentName: 'Tenant B' });
    const tokenA = regA.body.token;
    const tokenB = regB.body.token;
    const authA = { Authorization: `Bearer ${tokenA}` };
    const authB = { Authorization: `Bearer ${tokenB}` };

    const created = await request(app)
      .post('/api/competitors')
      .set(authA)
      .send({ id: 'tenantA-athlete', name: 'A Athlete', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(created.status).toBe(201);

    const rosterB = await request(app).get('/api/competitors').set(authB);
    expect(rosterB.body.find((c: { id: string }) => c.id === 'tenantA-athlete')).toBeUndefined();

    const patchAttempt = await request(app).patch('/api/competitors/tenantA-athlete').set(authB).send({ isAbsolute: true });
    expect(patchAttempt.status).toBe(404);

    const deleteAttempt = await request(app).delete('/api/competitors/tenantA-athlete').set(authB);
    expect(deleteAttempt.status).toBe(204); // no-op delete, doesn't error, but must not have removed A's row

    const rosterAAfter = await request(app).get('/api/competitors').set(authA);
    expect(rosterAAfter.body.find((c: { id: string }) => c.id === 'tenantA-athlete')).toBeTruthy();

    const bracketId = 'iso-cat';
    await request(app)
      .put(`/api/matches/bracket/${bracketId}`)
      .set(authA)
      .send({
        matches: [{
          id: 'iso-match',
          competitor1Id: null,
          competitor2Id: null,
          score1: { points: 0, advantages: 0, penalties: 0 },
          score2: { points: 0, advantages: 0, penalties: 0 },
          status: 'pending',
          round: 1,
          bracketId,
        }],
      });

    const matchesB = await request(app).get('/api/matches').set(authB);
    expect(matchesB.body.find((m: { id: string }) => m.id === 'iso-match')).toBeUndefined();

    const finishAttempt = await request(app)
      .post('/api/matches/iso-match/finish')
      .set(authB)
      .send({ winnerId: 'x', method: 'Points', score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, logs: [] });
    expect(finishAttempt.status).toBe(404);

    // /reset on tenant B must not wipe tenant A's data.
    await request(app).post('/api/reset').set(authB);
    const matchesAAfter = await request(app).get('/api/matches').set(authA);
    expect(matchesAAfter.body.find((m: { id: string }) => m.id === 'iso-match')).toBeTruthy();
  });
});

describe('google sign-in (mocked verifier)', () => {
  it('creates a new account + tournament on first Google sign-in', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token', tournamentName: 'Google Tournament' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tournament.name).toBe('Google Tournament');
  });

  it('logs the same Google account back in without creating a duplicate tournament', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'fake-id-token' });
    expect(res.status).toBe(200);
    expect(res.body.tournament.name).toBe('Google Tournament');
  });
});

describe('forgot / reset password', () => {
  it('always responds ok, and in dev exposes a reset token for a known email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'reset-me@example.com', password: 'oldpassword', tournamentName: 'Reset Co' });

    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.devResetToken).toBeUndefined();

    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'reset-me@example.com' });
    expect(known.status).toBe(200);
    expect(known.body.devResetToken).toBeTruthy();

    const resetToken = known.body.devResetToken as string;

    const badReset = await request(app).post('/api/auth/reset-password').send({ token: 'garbage', newPassword: 'newpassword1' });
    expect(badReset.status).toBe(400);

    const goodReset = await request(app).post('/api/auth/reset-password').send({ token: resetToken, newPassword: 'newpassword1' });
    expect(goodReset.status).toBe(200);

    const loginOld = await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'oldpassword' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'newpassword1' });
    expect(loginNew.status).toBe(200);
  });
});
