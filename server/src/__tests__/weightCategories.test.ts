process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let authA: { Authorization: string };
let userToken: string;

beforeAll(async () => {
  const register = await request(app).post('/api/auth/register').send({ email: 'weightcat-organizer@example.com', password: 'password1' });
  userToken = register.body.token;

  const created = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: 'Weight Category Open' });
  authA = { Authorization: `Bearer ${created.body.token}` };
});

describe('default weight categories', () => {
  it('seeds 9 adult + 5 kid categories, sorted ascending with exactly one null-maxWeight each', async () => {
    const res = await request(app).get('/api/weight-categories').set(authA);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(14);

    const adult = res.body.filter((c: { ageGroup: string }) => c.ageGroup === 'Adult');
    const kid = res.body.filter((c: { ageGroup: string }) => c.ageGroup === 'Kid');
    expect(adult).toHaveLength(9);
    expect(kid).toHaveLength(5);

    for (const group of [adult, kid]) {
      const nullCount = group.filter((c: { maxWeight: number | null }) => c.maxWeight === null).length;
      expect(nullCount).toBe(1);
      const bounds = group.map((c: { maxWeight: number | null }) => c.maxWeight);
      const sorted = [...bounds].sort((a, b) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return a - b;
      });
      expect(bounds).toEqual(sorted);
    }
  });

  it('401s without a tournament session token', async () => {
    const res = await request(app).get('/api/weight-categories');
    expect(res.status).toBe(401);
  });

  it('a bare user-token cannot be used here either', async () => {
    const res = await request(app).get('/api/weight-categories').set({ Authorization: `Bearer ${userToken}` });
    expect(res.status).toBe(401);
  });

  it('a second tournament gets its own freshly-seeded set, independent of the first', async () => {
    const created = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: 'Second Tournament' });
    const authB = { Authorization: `Bearer ${created.body.token}` };

    await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'Only Adult Class', maxWeight: null },
        { ageGroup: 'Kid', name: 'Only Kid Class', maxWeight: null },
      ]);

    const resB = await request(app).get('/api/weight-categories').set(authB);
    expect(resB.status).toBe(200);
    expect(resB.body).toHaveLength(14);
  });
});

describe('PUT /api/weight-categories validation', () => {
  it('replaces the full set with a valid payload', async () => {
    const payload = [
      { ageGroup: 'Adult', name: 'Light', maxWeight: 70 },
      { ageGroup: 'Adult', name: 'Heavy', maxWeight: null },
      { ageGroup: 'Kid', name: 'Small', maxWeight: 30 },
      { ageGroup: 'Kid', name: 'Big', maxWeight: null },
    ];
    const put = await request(app).put('/api/weight-categories').set(authA).send(payload);
    expect(put.status).toBe(200);
    expect(put.body).toHaveLength(4);

    const get = await request(app).get('/api/weight-categories').set(authA);
    expect(get.body.map((c: { name: string }) => c.name).sort()).toEqual(['Big', 'Heavy', 'Light', 'Small']);
  });

  it('rejects a payload missing a null-maxWeight category for an age group', async () => {
    const res = await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'Only Bounded', maxWeight: 70 },
        { ageGroup: 'Kid', name: 'Unbounded Kid', maxWeight: null },
      ]);
    expect(res.status).toBe(400);
  });

  it('rejects a payload with two null-maxWeight categories in the same age group', async () => {
    const res = await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'A', maxWeight: null },
        { ageGroup: 'Adult', name: 'B', maxWeight: null },
        { ageGroup: 'Kid', name: 'C', maxWeight: null },
      ]);
    expect(res.status).toBe(400);
  });

  it('rejects a zero or negative maxWeight', async () => {
    const res = await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'Bad', maxWeight: 0 },
        { ageGroup: 'Adult', name: 'Ok', maxWeight: null },
        { ageGroup: 'Kid', name: 'Ok Kid', maxWeight: null },
      ]);
    expect(res.status).toBe(400);
  });

  it('rejects duplicate maxWeight boundaries within one age group', async () => {
    const res = await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: 'A', maxWeight: 70 },
        { ageGroup: 'Adult', name: 'B', maxWeight: 70 },
        { ageGroup: 'Adult', name: 'C', maxWeight: null },
        { ageGroup: 'Kid', name: 'D', maxWeight: null },
      ]);
    expect(res.status).toBe(400);
  });

  it('rejects an empty or overlong name', async () => {
    const tooLong = 'x'.repeat(61);
    const res = await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([
        { ageGroup: 'Adult', name: tooLong, maxWeight: null },
        { ageGroup: 'Kid', name: '', maxWeight: null },
      ]);
    expect(res.status).toBe(400);
  });

  it('rejects a payload missing an age group entirely', async () => {
    const res = await request(app)
      .put('/api/weight-categories')
      .set(authA)
      .send([{ ageGroup: 'Adult', name: 'Solo', maxWeight: null }]);
    expect(res.status).toBe(400);
  });
});
