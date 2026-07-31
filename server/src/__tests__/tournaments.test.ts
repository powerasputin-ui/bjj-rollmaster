process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let userToken: string;

beforeAll(async () => {
  const res = await request(app).post('/api/auth/register').send({ email: 'organizer@example.com', password: 'password1' });
  userToken = res.body.token;
});

describe('creating and listing tournaments', () => {
  it('rejects an empty name', async () => {
    const res = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('creates a tournament with just a name and mints a tournament-scoped token', async () => {
    const res = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: 'Spring Open' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tournament.name).toBe('Spring Open');
    expect(res.body.tournament.slug).toBeTruthy();
    expect(res.body.tournament.status).toBe('draft');
  });

  it('creates a second tournament with full details for the same account', async () => {
    const res = await request(app)
      .post('/api/tournaments')
      .set({ Authorization: `Bearer ${userToken}` })
      .send({ name: 'Summer Cup', eventDate: '2026-08-15', location: 'Miami, FL', description: 'Gi & No-Gi' });
    expect(res.status).toBe(201);
    expect(res.body.tournament.eventDate).toBe('2026-08-15');
    expect(res.body.tournament.location).toBe('Miami, FL');
    expect(res.body.tournament.description).toBe('Gi & No-Gi');
  });

  it('lists both tournaments for the owning account', async () => {
    const res = await request(app).get('/api/tournaments').set({ Authorization: `Bearer ${userToken}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(['Spring Open', 'Summer Cup']);
  });
});

describe('selecting and editing a tournament', () => {
  it('mints a tournament-scoped token for an owned tournament', async () => {
    const list = await request(app).get('/api/tournaments').set({ Authorization: `Bearer ${userToken}` });
    const id = list.body[0].id;

    const select = await request(app).post(`/api/tournaments/${id}/select`).set({ Authorization: `Bearer ${userToken}` });
    expect(select.status).toBe(200);
    expect(select.body.token).toBeTruthy();

    // That token works on tenant-scoped routes.
    const roster = await request(app).get('/api/competitors').set({ Authorization: `Bearer ${select.body.token}` });
    expect(roster.status).toBe(200);

    // And can be used to look up which tournament it belongs to — used by the
    // frontend to restore the active tournament's details after a reload.
    const current = await request(app).get('/api/tournament').set({ Authorization: `Bearer ${select.body.token}` });
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(id);

    // A bare user-token (no tournamentId claim) must not work here either.
    const bareAttempt = await request(app).get('/api/tournament').set({ Authorization: `Bearer ${userToken}` });
    expect(bareAttempt.status).toBe(401);
  });

  it('404s selecting a nonexistent tournament id', async () => {
    const res = await request(app).post('/api/tournaments/does-not-exist/select').set({ Authorization: `Bearer ${userToken}` });
    expect(res.status).toBe(404);
  });

  it('publishes a tournament via PATCH', async () => {
    const list = await request(app).get('/api/tournaments').set({ Authorization: `Bearer ${userToken}` });
    const springOpen = list.body.find((t: { name: string }) => t.name === 'Spring Open');

    const patch = await request(app)
      .patch(`/api/tournaments/${springOpen.id}`)
      .set({ Authorization: `Bearer ${userToken}` })
      .send({ status: 'published' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('published');
  });
});

describe('public catalog', () => {
  it('lists only published tournaments, not drafts', async () => {
    const res = await request(app).get('/api/public/tournaments');
    expect(res.status).toBe(200);
    const names = res.body.map((t: { name: string }) => t.name);
    expect(names).toContain('Spring Open');
    expect(names).not.toContain('Summer Cup');
  });
});
