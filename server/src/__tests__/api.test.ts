process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

let token: string;
let slug: string;
let authHeader: { Authorization: string };

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'organizer@example.com', password: 'hunter22', tournamentName: 'Test Open' });
  expect(res.status).toBe(201);
  token = res.body.token;
  slug = res.body.tournament.slug;
  authHeader = { Authorization: `Bearer ${token}` };
});

describe('registrations flow', () => {
  it('public registration is created as pending and hidden from the approved roster', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/registrations`)
      .send({ id: 'reg1', name: 'Иван Петров', belt: 'White', weight: '70', team: 'Alpha', ageGroup: 'Adult' });
    expect(res.status).toBe(201);

    const roster = await request(app).get('/api/competitors').set(authHeader);
    expect(roster.body.find((c: { id: string }) => c.id === 'reg1')).toBeUndefined();
  });

  it('rejects reading the pending queue without a session token', async () => {
    const res = await request(app).get('/api/registrations/pending');
    expect(res.status).toBe(401);
  });

  it('lists the pending registration with a valid session token', async () => {
    const res = await request(app).get('/api/registrations/pending').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { id: string; name: string }) => c.id === 'reg1' && c.name === 'Иван Петров')).toBe(true);
  });

  it('approving moves the competitor into the approved roster', async () => {
    const approve = await request(app).post('/api/registrations/reg1/approve').set(authHeader);
    expect(approve.status).toBe(200);

    const roster = await request(app).get('/api/competitors').set(authHeader);
    expect(roster.body.find((c: { id: string }) => c.id === 'reg1')).toBeTruthy();

    const pending = await request(app).get('/api/registrations/pending').set(authHeader);
    expect(pending.body.find((c: { id: string }) => c.id === 'reg1')).toBeUndefined();
  });

  it('rejecting a pending registration removes it entirely', async () => {
    await request(app)
      .post(`/api/public/${slug}/registrations`)
      .send({ id: 'reg2', name: 'Отклонённый', belt: 'White', weight: '70', team: 'Beta', ageGroup: 'Adult' });

    const reject = await request(app).post('/api/registrations/reg2/reject').set(authHeader);
    expect(reject.status).toBe(200);

    const pending = await request(app).get('/api/registrations/pending').set(authHeader);
    expect(pending.body.find((c: { id: string }) => c.id === 'reg2')).toBeUndefined();
  });

  it('a nonexistent tournament slug 404s on public registration', async () => {
    const res = await request(app)
      .post('/api/public/no-such-tournament/registrations')
      .send({ id: 'reg3', name: 'X', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(res.status).toBe(404);
  });
});

describe('auth on mutating/organizer endpoints', () => {
  it('rejects requests without a valid session token', async () => {
    const responses = await Promise.all([
      request(app).get('/api/competitors'),
      request(app).post('/api/competitors').send({ id: 'x', name: 'X', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult' }),
      request(app).delete('/api/competitors/reg1'),
      request(app).put('/api/matches/bracket/cat1').send({ matches: [] }),
      request(app).post('/api/matches/m1/finish').send({ winnerId: 'reg1', method: 'Points' }),
    ]);
    responses.forEach(res => expect(res.status).toBe(401));
  });

  it('accepts requests with a valid session token', async () => {
    const res = await request(app)
      .post('/api/competitors')
      .set(authHeader)
      .send({ id: 'organizer-added', name: 'Организатор Добавил', belt: 'Blue', weight: '80', team: 'T', ageGroup: 'Adult' });
    expect(res.status).toBe(201);
  });
});

describe('bracket generation and match finishing', () => {
  const bracketId = 'Adult_White_feather';

  beforeAll(async () => {
    await request(app)
      .put(`/api/matches/bracket/${bracketId}`)
      .set(authHeader)
      .send({
        matches: [
          {
            id: 'm_test_r1_idx0',
            competitor1Id: 'reg1',
            competitor2Id: 'organizer-added',
            score1: { points: 0, advantages: 0, penalties: 0 },
            score2: { points: 0, advantages: 0, penalties: 0 },
            status: 'pending',
            round: 1,
            bracketId,
            nextMatchId: 'm_test_r2_idx0',
          },
          {
            id: 'm_test_r2_idx0',
            competitor1Id: null,
            competitor2Id: null,
            score1: { points: 0, advantages: 0, penalties: 0 },
            score2: { points: 0, advantages: 0, penalties: 0 },
            status: 'pending',
            round: 2,
            bracketId,
          },
        ],
      });
  });

  it('finishing a match sets the winner and propagates into the next round', async () => {
    const finish = await request(app)
      .post('/api/matches/m_test_r1_idx0/finish')
      .set(authHeader)
      .send({
        winnerId: 'reg1',
        method: 'Points',
        score1: { points: 4, advantages: 0, penalties: 0 },
        score2: { points: 0, advantages: 0, penalties: 0 },
        logs: [],
      });
    expect(finish.status).toBe(200);
    expect(finish.body.status).toBe('finished');
    expect(finish.body.winnerId).toBe('reg1');

    const matches = await request(app).get('/api/matches').set(authHeader);
    const nextMatch = matches.body.find((m: { id: string }) => m.id === 'm_test_r2_idx0');
    expect(nextMatch.competitor1Id).toBe('reg1');
  });
});
