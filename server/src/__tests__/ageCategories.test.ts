process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let authA: { Authorization: string };
let userToken: string;

beforeAll(async () => {
  const register = await request(app).post('/api/auth/register').send({ email: 'agecat-organizer@example.com', password: 'password1' });
  userToken = register.body.token;

  const created = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: 'Age Category Open' });
  authA = { Authorization: `Bearer ${created.body.token}` };
});

describe('default age categories', () => {
  it('seeds 9 adult + 4 kid categories on tournament creation', async () => {
    const res = await request(app).get('/api/age-categories').set(authA);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(13);

    const adult = res.body.filter((c: { ageGroup: string }) => c.ageGroup === 'Adult');
    const kid = res.body.filter((c: { ageGroup: string }) => c.ageGroup === 'Kid');
    expect(adult).toHaveLength(9);
    expect(kid).toHaveLength(4);
  });

  it('401s without a tournament session token', async () => {
    const res = await request(app).get('/api/age-categories');
    expect(res.status).toBe(401);
  });

  it('a bare user-token cannot be used here either', async () => {
    const res = await request(app).get('/api/age-categories').set({ Authorization: `Bearer ${userToken}` });
    expect(res.status).toBe(401);
  });

  it('a second tournament gets its own freshly-seeded set, independent of the first', async () => {
    const created = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: 'Second Age Tournament' });
    const authB = { Authorization: `Bearer ${created.body.token}` };

    await request(app)
      .put('/api/age-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'Only Adult', sortOrder: 0 },
        { ageGroup: 'Kid', name: 'Only Kid', sortOrder: 0 },
      ]);

    const resB = await request(app).get('/api/age-categories').set(authB);
    expect(resB.status).toBe(200);
    expect(resB.body).toHaveLength(13);
  });
});

describe('PUT /api/age-categories validation', () => {
  it('replaces the full set with a valid payload', async () => {
    const payload = [
      { ageGroup: 'Adult', name: 'Adult', sortOrder: 0 },
      { ageGroup: 'Adult', name: 'Master 1', sortOrder: 1 },
      { ageGroup: 'Kid', name: 'Kids 1', sortOrder: 0 },
    ];
    const put = await request(app).put('/api/age-categories').set(authA).send(payload);
    expect(put.status).toBe(200);
    expect(put.body).toHaveLength(3);

    const get = await request(app).get('/api/age-categories').set(authA);
    expect(get.body.map((c: { name: string }) => c.name).sort()).toEqual(['Adult', 'Kids 1', 'Master 1']);
  });

  it('rejects a payload missing an age group entirely', async () => {
    const res = await request(app)
      .put('/api/age-categories')
      .set(authA)
      .send([{ ageGroup: 'Adult', name: 'Solo', sortOrder: 0 }]);
    expect(res.status).toBe(400);
  });

  it('rejects an empty or overlong name', async () => {
    const tooLong = 'x'.repeat(61);
    const res = await request(app)
      .put('/api/age-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: tooLong, sortOrder: 0 },
        { ageGroup: 'Kid', name: '', sortOrder: 0 },
      ]);
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric sortOrder', async () => {
    const res = await request(app)
      .put('/api/age-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'A', sortOrder: 'first' },
        { ageGroup: 'Kid', name: 'B', sortOrder: 0 },
      ]);
    expect(res.status).toBe(400);
  });
});

describe('moving a competitor into an age category', () => {
  it('PATCH /api/competitors/:id accepts ageCategoryId and persists it', async () => {
    const created = await request(app).post('/api/competitors').set(authA).send({
      id: 'agecat-c1', name: 'Age Cat Athlete', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult',
    });
    expect(created.status).toBe(201);
    expect(created.body.ageCategoryId).toBeNull();

    const categories = await request(app).get('/api/age-categories').set(authA);
    const masterOne = categories.body.find((c: { name: string }) => c.name === 'Master 1');
    expect(masterOne).toBeTruthy();

    const patched = await request(app).patch(`/api/competitors/${created.body.id}`).set(authA).send({ ageCategoryId: masterOne.id });
    expect(patched.status).toBe(200);
    expect(patched.body.ageCategoryId).toBe(masterOne.id);

    const cleared = await request(app).patch(`/api/competitors/${created.body.id}`).set(authA).send({ ageCategoryId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.ageCategoryId).toBeNull();
  });
});
