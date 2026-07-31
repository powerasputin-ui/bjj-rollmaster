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
  const register = await request(app)
    .post('/api/auth/register')
    .send({ email: 'organizer@example.com', password: 'hunter22' });
  expect(register.status).toBe(201);
  const userToken = register.body.token;

  const created = await request(app)
    .post('/api/tournaments')
    .set({ Authorization: `Bearer ${userToken}` })
    .send({ name: 'Test Open' });
  expect(created.status).toBe(201);
  token = created.body.token;
  slug = created.body.tournament.slug;
  authHeader = { Authorization: `Bearer ${token}` };
});

describe('registrations flow', () => {
  it('public registration is created as pending, hidden from the roster and the queue until email is confirmed', async () => {
    const res = await request(app)
      .post(`/api/public/${slug}/registrations`)
      .send({ id: 'reg1', name: 'Иван Петров', belt: 'White', weight: '70', team: 'Alpha', ageGroup: 'Adult', email: 'reg1@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.devVerifyToken).toBeTruthy();

    const roster = await request(app).get('/api/competitors').set(authHeader);
    expect(roster.body.find((c: { id: string }) => c.id === 'reg1')).toBeUndefined();

    const pendingBefore = await request(app).get('/api/registrations/pending').set(authHeader);
    expect(pendingBefore.body.find((c: { id: string }) => c.id === 'reg1')).toBeUndefined();

    const verify = await request(app).post('/api/public/verify-registration').send({ token: res.body.devVerifyToken });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();
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
    const submitted = await request(app)
      .post(`/api/public/${slug}/registrations`)
      .send({ id: 'reg2', name: 'Отклонённый', belt: 'White', weight: '70', team: 'Beta', ageGroup: 'Adult', email: 'reg2@example.com' });
    await request(app).post('/api/public/verify-registration').send({ token: submitted.body.devVerifyToken });

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

describe('gi/no-gi competitor fields', () => {
  it('defaults a new competitor to gi-only when not specified (backward-compatible with single-format tournaments)', async () => {
    const res = await request(app)
      .post('/api/competitors')
      .set(authHeader)
      .send({ id: 'ginogi-default', name: 'Default Format', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(res.status).toBe(201);
    expect(res.body.competesGi).toBe(true);
    expect(res.body.competesNoGi).toBe(false);
  });

  it('accepts explicit competesGi/competesNoGi on create, including both at once', async () => {
    const res = await request(app)
      .post('/api/competitors')
      .set(authHeader)
      .send({ id: 'ginogi-both', name: 'Both Formats', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult', competesGi: true, competesNoGi: true });
    expect(res.status).toBe(201);
    expect(res.body.competesGi).toBe(true);
    expect(res.body.competesNoGi).toBe(true);
  });

  it('toggles competesGi/competesNoGi via PATCH', async () => {
    const created = await request(app)
      .post('/api/competitors')
      .set(authHeader)
      .send({ id: 'ginogi-patch', name: 'Patch Format', belt: 'White', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(created.body.competesGi).toBe(true);
    expect(created.body.competesNoGi).toBe(false);

    const patch = await request(app)
      .patch('/api/competitors/ginogi-patch')
      .set(authHeader)
      .send({ competesGi: false, competesNoGi: true });
    expect(patch.status).toBe(200);
    expect(patch.body.competesGi).toBe(false);
    expect(patch.body.competesNoGi).toBe(true);
  });
});

describe('moving a competitor to another category (age/belt/weight)', () => {
  it('PATCH accepts ageGroup and belt together with weight, moving the competitor into a new bucket', async () => {
    const created = await request(app)
      .post('/api/competitors')
      .set(authHeader)
      .send({ id: 'move-me', name: 'Move Me', belt: 'Blue', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(created.status).toBe(201);

    const patch = await request(app)
      .patch('/api/competitors/move-me')
      .set(authHeader)
      .send({ ageGroup: 'Kid', belt: 'Grey', weight: '35' });
    expect(patch.status).toBe(200);
    expect(patch.body.ageGroup).toBe('Kid');
    expect(patch.body.belt).toBe('Grey');
    expect(patch.body.weight).toBe('35');
  });

  it('rejects an invalid ageGroup or belt value, leaving the competitor unchanged', async () => {
    const created = await request(app)
      .post('/api/competitors')
      .set(authHeader)
      .send({ id: 'move-invalid', name: 'Invalid Move', belt: 'Blue', weight: '70', team: 'T', ageGroup: 'Adult' });
    expect(created.status).toBe(201);

    const patch = await request(app)
      .patch('/api/competitors/move-invalid')
      .set(authHeader)
      .send({ ageGroup: 'Senior', belt: 'Rainbow' });
    expect(patch.status).toBe(400);

    const check = await request(app).get('/api/competitors').set(authHeader);
    const found = check.body.find((c: { id: string }) => c.id === 'move-invalid');
    expect(found.ageGroup).toBe('Adult');
    expect(found.belt).toBe('Blue');
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

describe('bracket format fields and loser propagation (double elimination)', () => {
  const bracketId = 'Adult_White_lightweight_de';

  beforeAll(async () => {
    await request(app)
      .put(`/api/matches/bracket/${bracketId}`)
      .set(authHeader)
      .send({
        matches: [
          {
            id: 'm_de_wb_r1_idx0',
            competitor1Id: 'reg1',
            competitor2Id: 'organizer-added',
            score1: { points: 0, advantages: 0, penalties: 0 },
            score2: { points: 0, advantages: 0, penalties: 0 },
            status: 'pending',
            round: 1,
            bracketId,
            format: 'double',
            bracketSection: 'winners',
            nextMatchId: 'm_de_wb_final',
            nextMatchSlot: 1,
            loserNextMatchId: 'm_de_lb_final',
            loserNextMatchSlot: 2,
          },
          {
            id: 'm_de_wb_final',
            competitor1Id: null,
            competitor2Id: null,
            score1: { points: 0, advantages: 0, penalties: 0 },
            score2: { points: 0, advantages: 0, penalties: 0 },
            status: 'pending',
            round: 2,
            bracketId,
            format: 'double',
            bracketSection: 'winners',
          },
          {
            id: 'm_de_lb_final',
            competitor1Id: 'some-other-competitor',
            competitor2Id: null,
            score1: { points: 0, advantages: 0, penalties: 0 },
            score2: { points: 0, advantages: 0, penalties: 0 },
            status: 'pending',
            round: 2,
            bracketId,
            format: 'double',
            bracketSection: 'losers',
          },
        ],
      });
  });

  it('persists format/bracketSection/loserNextMatchId/slot fields through the bracket PUT', async () => {
    const matches = await request(app).get('/api/matches').set(authHeader);
    const m = matches.body.find((x: { id: string }) => x.id === 'm_de_wb_r1_idx0');
    expect(m.format).toBe('double');
    expect(m.bracketSection).toBe('winners');
    expect(m.nextMatchSlot).toBe(1);
    expect(m.loserNextMatchId).toBe('m_de_lb_final');
    expect(m.loserNextMatchSlot).toBe(2);
  });

  it('finishing a match propagates the winner via explicit nextMatchSlot and the loser via loserNextMatchId/loserNextMatchSlot', async () => {
    const finish = await request(app)
      .post('/api/matches/m_de_wb_r1_idx0/finish')
      .set(authHeader)
      .send({
        winnerId: 'reg1',
        method: 'Points',
        score1: { points: 4, advantages: 0, penalties: 0 },
        score2: { points: 0, advantages: 0, penalties: 0 },
        logs: [],
      });
    expect(finish.status).toBe(200);

    const matches = await request(app).get('/api/matches').set(authHeader);
    const wbFinal = matches.body.find((x: { id: string }) => x.id === 'm_de_wb_final');
    expect(wbFinal.competitor1Id).toBe('reg1');

    const lbFinal = matches.body.find((x: { id: string }) => x.id === 'm_de_lb_final');
    expect(lbFinal.competitor2Id).toBe('organizer-added');
  });
});
