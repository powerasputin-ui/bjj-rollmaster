process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let orgAuth: { Authorization: string };
let userToken: string;
let bracketId: string;
let matchOnMat1: string;
let matchOnMat2: string;

beforeAll(async () => {
  const register = await request(app).post('/api/auth/register').send({ email: 'mat-operator-organizer@example.com', password: 'password1' });
  userToken = register.body.token;

  const created = await request(app).post('/api/tournaments').set({ Authorization: `Bearer ${userToken}` }).send({ name: 'Mat Operator Open' });
  orgAuth = { Authorization: `Bearer ${created.body.token}` };

  await request(app).post('/api/competitors').set(orgAuth).send({ id: 'op-c1', name: 'Op Athlete 1', belt: 'White', weight: '70', team: 'T1', ageGroup: 'Adult' });
  await request(app).post('/api/competitors').set(orgAuth).send({ id: 'op-c2', name: 'Op Athlete 2', belt: 'White', weight: '70', team: 'T2', ageGroup: 'Adult' });
  await request(app).post('/api/competitors').set(orgAuth).send({ id: 'op-c3', name: 'Op Athlete 3', belt: 'White', weight: '70', team: 'T3', ageGroup: 'Adult' });
  await request(app).post('/api/competitors').set(orgAuth).send({ id: 'op-c4', name: 'Op Athlete 4', belt: 'White', weight: '70', team: 'T4', ageGroup: 'Adult' });

  bracketId = 'Adult_White_feather';
  matchOnMat1 = 'm_mat1';
  matchOnMat2 = 'm_mat2';
  await request(app)
    .put(`/api/matches/bracket/${bracketId}`)
    .set(orgAuth)
    .send({
      matches: [
        { id: matchOnMat1, competitor1Id: 'op-c1', competitor2Id: 'op-c2', score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'ongoing', round: 1, bracketId, mat: '1' },
        { id: matchOnMat2, competitor1Id: 'op-c3', competitor2Id: 'op-c4', score1: { points: 0, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, status: 'ongoing', round: 1, bracketId, mat: '2' },
      ],
    });
});

describe('POST /api/tournament/mats/:mat/token', () => {
  it('requires an organizer tournament-token', async () => {
    const res = await request(app).post('/api/tournament/mats/1/token');
    expect(res.status).toBe(401);
  });

  it('rejects a bare user-token (no tournamentId claim)', async () => {
    const res = await request(app).post('/api/tournament/mats/1/token').set({ Authorization: `Bearer ${userToken}` });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid mat number', async () => {
    const res = await request(app).post('/api/tournament/mats/9/token').set(orgAuth);
    expect(res.status).toBe(400);
  });

  it('mints a token for a valid mat', async () => {
    const res = await request(app).post('/api/tournament/mats/1/token').set(orgAuth);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('mat-token restrictions on /api/matches', () => {
  it('finishes a match on its own mat', async () => {
    const mint = await request(app).post('/api/tournament/mats/1/token').set(orgAuth);
    const matToken = mint.body.token;

    const finish = await request(app)
      .post(`/api/matches/${matchOnMat1}/finish`)
      .set({ Authorization: `Bearer ${matToken}` })
      .send({ winnerId: 'op-c1', method: 'Points', score1: { points: 4, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, logs: [] });
    expect(finish.status).toBe(200);
    expect(finish.body.status).toBe('finished');
    expect(finish.body.winnerId).toBe('op-c1');
  });

  it('403s finishing a match on a different mat', async () => {
    const mint = await request(app).post('/api/tournament/mats/1/token').set(orgAuth);
    const matToken = mint.body.token;

    const finish = await request(app)
      .post(`/api/matches/${matchOnMat2}/finish`)
      .set({ Authorization: `Bearer ${matToken}` })
      .send({ winnerId: 'op-c3', method: 'Points', score1: { points: 4, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, logs: [] });
    expect(finish.status).toBe(403);
  });

  it('401s a mat-token on organizer-only routes', async () => {
    const mint = await request(app).post('/api/tournament/mats/2/token').set(orgAuth);
    const matToken = mint.body.token;
    const matAuth = { Authorization: `Bearer ${matToken}` };

    const list = await request(app).get('/api/matches').set(matAuth);
    expect(list.status).toBe(401);

    const bracket = await request(app).put(`/api/matches/bracket/${bracketId}`).set(matAuth).send({ matches: [] });
    expect(bracket.status).toBe(401);

    const callToMat = await request(app).post(`/api/matches/${matchOnMat2}/call-to-mat`).set(matAuth).send({ mat: '2' });
    expect(callToMat.status).toBe(401);
  });

  it('rejects a garbage/forged token', async () => {
    const res = await request(app)
      .post(`/api/matches/${matchOnMat2}/finish`)
      .set({ Authorization: 'Bearer garbage-token' })
      .send({ winnerId: 'op-c3', method: 'Points' });
    expect(res.status).toBe(401);
  });

  it('the organizer tournament-token can still finish matches on any mat (regression)', async () => {
    const finish = await request(app)
      .post(`/api/matches/${matchOnMat2}/finish`)
      .set(orgAuth)
      .send({ winnerId: 'op-c3', method: 'Points', score1: { points: 4, advantages: 0, penalties: 0 }, score2: { points: 0, advantages: 0, penalties: 0 }, logs: [] });
    expect(finish.status).toBe(200);
    expect(finish.body.winnerId).toBe('op-c3');
  });
});
