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
  it('registers a new organizer account (no tournament yet)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password1' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tournament).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password1' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const good = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'password1' });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  it('/me returns the authenticated user', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'password1' });
    const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${login.body.token}` });
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@example.com');
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
          .send({ email, password: `password${i}1` })
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

describe('tournament ownership isolation', () => {
  it('one user cannot see or select or modify another user\'s tournament data', async () => {
    const regA = await request(app).post('/api/auth/register').send({ email: 'tenantA@example.com', password: 'password1' });
    const regB = await request(app).post('/api/auth/register').send({ email: 'tenantB@example.com', password: 'password1' });
    const userAuthA = { Authorization: `Bearer ${regA.body.token}` };
    const userAuthB = { Authorization: `Bearer ${regB.body.token}` };

    const createA = await request(app).post('/api/tournaments').set(userAuthA).send({ name: 'Tenant A' });
    expect(createA.status).toBe(201);
    const tournamentAId = createA.body.tournament.id;
    const authA = { Authorization: `Bearer ${createA.body.token}` };

    const createB = await request(app).post('/api/tournaments').set(userAuthB).send({ name: 'Tenant B' });
    const authB = { Authorization: `Bearer ${createB.body.token}` };

    // B cannot list-and-find A's tournament, nor mint a token for it.
    const listB = await request(app).get('/api/tournaments').set(userAuthB);
    expect(listB.body.find((t: { id: string }) => t.id === tournamentAId)).toBeUndefined();

    const selectAttempt = await request(app).post(`/api/tournaments/${tournamentAId}/select`).set(userAuthB);
    expect(selectAttempt.status).toBe(404);

    const patchAttempt = await request(app).patch(`/api/tournaments/${tournamentAId}`).set(userAuthB).send({ name: 'Hijacked' });
    expect(patchAttempt.status).toBe(404);

    // A bare user-token (no tournamentId claim) must not work on tenant-scoped routes.
    const bareTokenAttempt = await request(app).get('/api/competitors').set(userAuthA);
    expect(bareTokenAttempt.status).toBe(401);

    // Existing tenant-scoped data isolation still holds via the tournament-token.
    const created = await request(app)
      .post('/api/competitors')
      .set(authA)
      .send({ id: 'tenantA-athlete', name: 'A Athlete', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(created.status).toBe(201);

    const rosterB = await request(app).get('/api/competitors').set(authB);
    expect(rosterB.body.find((c: { id: string }) => c.id === 'tenantA-athlete')).toBeUndefined();
  });
});

describe('google sign-in (mocked verifier)', () => {
  it('creates a new account on first Google sign-in (no tournament)', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'fake-id-token' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tournament).toBeUndefined();
  });

  it('logs the same Google account back in without creating a duplicate account', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'fake-id-token' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('forgot / reset password', () => {
  it('always responds ok, and in dev exposes a reset token for a known email', async () => {
    await request(app).post('/api/auth/register').send({ email: 'reset-me@example.com', password: 'oldpassword' });

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
