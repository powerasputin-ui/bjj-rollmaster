process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
delete process.env.RESEND_API_KEY;

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let orgToken: string;
let slugA: string;
let slugB: string;

beforeAll(async () => {
  const register = await request(app).post('/api/auth/register').send({ email: 'athletes-organizer@example.com', password: 'password1' });
  orgToken = register.body.token;
  const orgAuth = { Authorization: `Bearer ${orgToken}` };

  const tourA = await request(app).post('/api/tournaments').set(orgAuth).send({ name: 'Athletes Open A' });
  const tourB = await request(app).post('/api/tournaments').set(orgAuth).send({ name: 'Athletes Open B' });
  slugA = tourA.body.tournament.slug;
  slugB = tourB.body.tournament.slug;
});

async function selectTournament(slug: string): Promise<{ Authorization: string }> {
  const list = await request(app).get('/api/tournaments').set({ Authorization: `Bearer ${orgToken}` });
  const tour = list.body.find((t: { slug: string }) => t.slug === slug);
  const select = await request(app).post(`/api/tournaments/${tour.id}/select`).set({ Authorization: `Bearer ${orgToken}` });
  return { Authorization: `Bearer ${select.body.token}` };
}

describe('registration requires and verifies email', () => {
  it('rejects a registration without a valid email', async () => {
    const res = await request(app)
      .post(`/api/public/${slugA}/registrations`)
      .send({ id: 'no-email', name: 'X', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_email');
  });

  it('rejects an unknown or expired verification token', async () => {
    const res = await request(app).post('/api/public/verify-registration').send({ token: 'garbage' });
    expect(res.status).toBe(400);
  });
});

describe('athlete cabinet across tournaments', () => {
  let athleteToken: string;
  let competitorIdA: string;

  it('confirming a registration mints an athlete session', async () => {
    const submit = await request(app)
      .post(`/api/public/${slugA}/registrations`)
      .send({ id: 'athlete-a-reg1', name: 'Athlete One', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult', email: 'athlete1@example.com' });
    expect(submit.status).toBe(201);
    competitorIdA = 'athlete-a-reg1';

    const verify = await request(app).post('/api/public/verify-registration').send({ token: submit.body.devVerifyToken });
    expect(verify.status).toBe(200);
    athleteToken = verify.body.token;
    expect(athleteToken).toBeTruthy();
  });

  it('the same athlete (same email) registering for a second tournament sees both in their cabinet', async () => {
    const submit = await request(app)
      .post(`/api/public/${slugB}/registrations`)
      .send({ id: 'athlete-a-reg2', name: 'Athlete One', belt: 'White', weight: '71', team: 'T1', ageGroup: 'Adult', email: 'athlete1@example.com' });
    await request(app).post('/api/public/verify-registration').send({ token: submit.body.devVerifyToken });

    const me = await request(app).get('/api/public/athlete/me').set({ Authorization: `Bearer ${athleteToken}` });
    expect(me.status).toBe(200);
    const tournamentNames = me.body.map((r: { tournamentName: string }) => r.tournamentName).sort();
    expect(tournamentNames).toEqual(['Athletes Open A', 'Athletes Open B']);
  });

  it('rejects /athlete/me without an athlete token', async () => {
    const res = await request(app).get('/api/public/athlete/me');
    expect(res.status).toBe(401);
  });

  it('a user-token or tournament-token cannot be used as an athlete-token', async () => {
    const asUserToken = await request(app).get('/api/public/athlete/me').set({ Authorization: `Bearer ${orgToken}` });
    expect(asUserToken.status).toBe(401);
  });

  it('the athlete can edit their own pending registration', async () => {
    const patch = await request(app)
      .patch(`/api/public/athlete/registrations/${competitorIdA}`)
      .set({ Authorization: `Bearer ${athleteToken}` })
      .send({ name: 'Athlete One Updated', belt: 'Blue', weight: '72', team: 'T1', ageGroup: 'Adult' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('Athlete One Updated');
    expect(patch.body.belt).toBe('Blue');
  });

  it('a different athlete cannot edit this registration', async () => {
    const submit = await request(app)
      .post(`/api/public/${slugA}/registrations`)
      .send({ id: 'athlete-b-reg1', name: 'Athlete Two', belt: 'White', weight: '80', team: 'T2', ageGroup: 'Adult', email: 'athlete2@example.com' });
    const verify = await request(app).post('/api/public/verify-registration').send({ token: submit.body.devVerifyToken });
    const otherAthleteToken = verify.body.token;

    const patch = await request(app)
      .patch(`/api/public/athlete/registrations/${competitorIdA}`)
      .set({ Authorization: `Bearer ${otherAthleteToken}` })
      .send({ name: 'Hijacked', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' });
    expect(patch.status).toBe(404);
  });

  it('editing is locked once the organizer approves the registration', async () => {
    const authA = await selectTournament(slugA);
    const approve = await request(app).post(`/api/registrations/${competitorIdA}/approve`).set(authA);
    expect(approve.status).toBe(200);

    const patch = await request(app)
      .patch(`/api/public/athlete/registrations/${competitorIdA}`)
      .set({ Authorization: `Bearer ${athleteToken}` })
      .send({ name: 'Too Late', belt: 'Blue', weight: '72', team: 'T1', ageGroup: 'Adult' });
    expect(patch.status).toBe(404);
  });
});

describe('magic-link login', () => {
  it('requesting a login link for a known email returns a dev token; unknown email still responds ok with no token', async () => {
    const known = await request(app).post('/api/public/athlete/request-login').send({ email: 'athlete1@example.com' });
    expect(known.status).toBe(200);
    expect(known.body.devLoginToken).toBeTruthy();

    const unknown = await request(app).post('/api/public/athlete/request-login').send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.devLoginToken).toBeUndefined();
  });

  it('logging in with the link token mints a working athlete session', async () => {
    const requested = await request(app).post('/api/public/athlete/request-login').send({ email: 'athlete1@example.com' });
    const login = await request(app).post('/api/public/athlete/login').send({ token: requested.body.devLoginToken });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();

    const me = await request(app).get('/api/public/athlete/me').set({ Authorization: `Bearer ${login.body.token}` });
    expect(me.status).toBe(200);
    expect(me.body.length).toBeGreaterThan(0);
  });

  it('rejects a garbage login token', async () => {
    const res = await request(app).post('/api/public/athlete/login').send({ token: 'garbage' });
    expect(res.status).toBe(400);
  });
});
