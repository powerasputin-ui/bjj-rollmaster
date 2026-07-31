process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { attachMatSync, broadcastMatchCalled } from '../ws/matSync.js';
import { getDb } from '../db/client.js';
import { signSession } from '../lib/jwt.js';

let server: http.Server;
let baseUrl: string;
let slugA: string;
let slugB: string;
let tournamentIdA: string;
let tournamentIdB: string;

function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(baseUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for a message')), timeoutMs);
    ws.once('message', (raw) => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

const sampleState = {
  timeLeft: 250,
  isActive: true,
  isResting: false,
  currentRound: 1,
  score1: { points: 4, advantages: 1, penalties: 0 },
  score2: { points: 0, advantages: 0, penalties: 0 },
  medTime: null,
  matchLog: [],
  config: { roundDuration: 300, restDuration: 60, rounds: 1 },
};

beforeAll(async () => {
  const db = getDb();
  const ownerId = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(ownerId, 'matsync-owner@example.com', 'x');
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  slugA = 'tournament-a-' + crypto.randomBytes(3).toString('hex');
  slugB = 'tournament-b-' + crypto.randomBytes(3).toString('hex');
  db.prepare('INSERT INTO tournaments (id, owner_user_id, name, slug) VALUES (?, ?, ?, ?)').run(idA, ownerId, 'Tournament A', slugA);
  db.prepare('INSERT INTO tournaments (id, owner_user_id, name, slug) VALUES (?, ?, ?, ?)').run(idB, ownerId, 'Tournament B', slugB);
  tournamentIdA = idA;
  tournamentIdB = idB;

  server = http.createServer();
  attachMatSync(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `ws://127.0.0.1:${port}/ws`;
});

afterAll(() => {
  server.close();
});

describe('mat sync WebSocket channel (tournament-scoped)', () => {
  it('relays a controller state update to another client watching the same tournament + mat', async () => {
    const controller = await openSocket();
    const display = await openSocket();

    display.send(JSON.stringify({ type: 'join', slug: slugA, mat: '1' }));
    await nextMessage(display); // initial sync (null, nobody has sent state yet)

    controller.send(JSON.stringify({ type: 'join', slug: slugA, mat: '1' }));
    await nextMessage(controller); // initial sync

    controller.send(JSON.stringify({ type: 'state', slug: slugA, mat: '1', payload: sampleState }));
    const msg = await nextMessage(display);

    expect(msg.type).toBe('sync');
    expect(msg.mat).toBe('1');
    expect(msg.payload).toEqual(sampleState);

    controller.close();
    display.close();
  });

  it('sends the last known state immediately to a client joining later', async () => {
    const controller = await openSocket();
    controller.send(JSON.stringify({ type: 'join', slug: slugA, mat: '2' }));
    await nextMessage(controller);
    controller.send(JSON.stringify({ type: 'state', slug: slugA, mat: '2', payload: sampleState }));

    await new Promise((r) => setTimeout(r, 50));

    const lateJoiner = await openSocket();
    lateJoiner.send(JSON.stringify({ type: 'join', slug: slugA, mat: '2' }));
    const msg = await nextMessage(lateJoiner);

    expect(msg.payload).toEqual(sampleState);

    controller.close();
    lateJoiner.close();
  });

  it('does not leak state between different mats within the same tournament', async () => {
    const matA = await openSocket();
    const matB = await openSocket();

    matA.send(JSON.stringify({ type: 'join', slug: slugA, mat: '3' }));
    await nextMessage(matA);
    matB.send(JSON.stringify({ type: 'join', slug: slugA, mat: '4' }));
    await nextMessage(matB);

    const controllerA = await openSocket();
    controllerA.send(JSON.stringify({ type: 'join', slug: slugA, mat: '3' }));
    await nextMessage(controllerA);
    controllerA.send(JSON.stringify({ type: 'state', slug: slugA, mat: '3', payload: sampleState }));

    await expect(nextMessage(matB, 300)).rejects.toThrow('timed out waiting for a message');

    matA.close();
    matB.close();
    controllerA.close();
  });

  it('does not leak state between two different tournaments using the same mat number', async () => {
    const tournamentAViewer = await openSocket();
    const tournamentBViewer = await openSocket();

    tournamentAViewer.send(JSON.stringify({ type: 'join', slug: slugA, mat: '5' }));
    await nextMessage(tournamentAViewer);
    tournamentBViewer.send(JSON.stringify({ type: 'join', slug: slugB, mat: '5' }));
    await nextMessage(tournamentBViewer);

    const controllerA = await openSocket();
    controllerA.send(JSON.stringify({ type: 'join', slug: slugA, mat: '5' }));
    await nextMessage(controllerA);
    controllerA.send(JSON.stringify({ type: 'state', slug: slugA, mat: '5', payload: sampleState }));

    await expect(nextMessage(tournamentBViewer, 300)).rejects.toThrow('timed out waiting for a message');

    tournamentAViewer.close();
    tournamentBViewer.close();
    controllerA.close();
  });

  it('ignores messages with an unresolvable tournament slug', async () => {
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: 'join', slug: 'does-not-exist', mat: '1' }));
    await expect(nextMessage(ws, 300)).rejects.toThrow('timed out waiting for a message');
    ws.close();
  });

  it('reset clears the stored state for that tournament + mat', async () => {
    const controller = await openSocket();
    controller.send(JSON.stringify({ type: 'join', slug: slugA, mat: '6' }));
    await nextMessage(controller);
    controller.send(JSON.stringify({ type: 'state', slug: slugA, mat: '6', payload: sampleState }));
    await new Promise((r) => setTimeout(r, 50));

    controller.send(JSON.stringify({ type: 'reset', slug: slugA, mat: '6' }));
    await new Promise((r) => setTimeout(r, 50));

    const lateJoiner = await openSocket();
    lateJoiner.send(JSON.stringify({ type: 'join', slug: slugA, mat: '6' }));
    const msg = await nextMessage(lateJoiner);

    expect(msg.payload).toBeNull();

    controller.close();
    lateJoiner.close();
  });
});

describe('mat-token scoping', () => {
  it('a mat-token can join and write its own mat', async () => {
    const matToken = signSession({ sub: 'ref-1', kind: 'mat', tournamentId: tournamentIdA, mat: '7', email: '' }, { expiresIn: '1d' });
    const operator = await openSocket();
    const display = await openSocket();

    display.send(JSON.stringify({ type: 'join', slug: slugA, mat: '7' }));
    await nextMessage(display);

    operator.send(JSON.stringify({ type: 'join', token: matToken, mat: '7' }));
    await nextMessage(operator);

    operator.send(JSON.stringify({ type: 'state', token: matToken, mat: '7', payload: sampleState }));
    const msg = await nextMessage(display);
    expect(msg.payload).toEqual(sampleState);

    operator.close();
    display.close();
  });

  it("a mat-token cannot join or write a different mat, even in the same tournament", async () => {
    const matToken = signSession({ sub: 'ref-1', kind: 'mat', tournamentId: tournamentIdA, mat: '8', email: '' }, { expiresIn: '1d' });
    const wrongMatDisplay = await openSocket();
    wrongMatDisplay.send(JSON.stringify({ type: 'join', slug: slugA, mat: '9' }));
    await nextMessage(wrongMatDisplay);

    const operator = await openSocket();
    // Attempts to join/write mat 9 using a token scoped to mat 8 — must be silently ignored.
    operator.send(JSON.stringify({ type: 'join', token: matToken, mat: '9' }));
    await expect(nextMessage(operator, 300)).rejects.toThrow('timed out waiting for a message');

    operator.send(JSON.stringify({ type: 'state', token: matToken, mat: '9', payload: sampleState }));
    await expect(nextMessage(wrongMatDisplay, 300)).rejects.toThrow('timed out waiting for a message');

    operator.close();
    wrongMatDisplay.close();
  });

  it('an organizer tournament-token remains unrestricted across mats (regression)', async () => {
    const orgToken = signSession({ sub: 'organizer-1', kind: 'tournament', tournamentId: tournamentIdA, email: 'org@example.com' });
    const display = await openSocket();
    display.send(JSON.stringify({ type: 'join', slug: slugA, mat: '10' }));
    await nextMessage(display);

    const controller = await openSocket();
    controller.send(JSON.stringify({ type: 'join', token: orgToken, mat: '10' }));
    await nextMessage(controller);
    controller.send(JSON.stringify({ type: 'state', token: orgToken, mat: '10', payload: sampleState }));
    const msg = await nextMessage(display);
    expect(msg.payload).toEqual(sampleState);

    controller.close();
    display.close();
  });
});

describe('subscribe / "called to mat" broadcast', () => {
  it('a subscribed client receives a broadcastMatchCalled event for its tournament, without needing to pick a mat', async () => {
    const subscriber = await openSocket();
    subscriber.send(JSON.stringify({ type: 'subscribe', slug: slugA }));
    await new Promise((r) => setTimeout(r, 50)); // subscribe has no ack; give it a beat to register

    broadcastMatchCalled(tournamentIdA, { matchId: 'm1', competitor1Id: 'c1', competitor2Id: 'c2', mat: '3' });
    const msg = await nextMessage(subscriber);

    expect(msg).toEqual({ type: 'called', tournamentId: tournamentIdA, matchId: 'm1', competitor1Id: 'c1', competitor2Id: 'c2', mat: '3' });
    subscriber.close();
  });

  it('does not deliver a "called" broadcast to a client subscribed to a different tournament', async () => {
    const subscriber = await openSocket();
    subscriber.send(JSON.stringify({ type: 'subscribe', slug: slugB }));
    await new Promise((r) => setTimeout(r, 50));

    broadcastMatchCalled(tournamentIdA, { matchId: 'm2', competitor1Id: 'c3', competitor2Id: 'c4', mat: '1' });
    await expect(nextMessage(subscriber, 300)).rejects.toThrow('timed out waiting for a message');

    subscriber.close();
  });

  it('a mat-scoped join client also receives "called" broadcasts for its tournament (harmless — client-side ignores unknown types)', async () => {
    const matClient = await openSocket();
    matClient.send(JSON.stringify({ type: 'join', slug: slugA, mat: '1' }));
    await nextMessage(matClient); // initial sync

    broadcastMatchCalled(tournamentIdA, { matchId: 'm3', competitor1Id: 'c5', competitor2Id: 'c6', mat: '2' });
    const msg = await nextMessage(matClient);
    expect(msg.type).toBe('called');

    matClient.close();
  });

  it('ignores a subscribe request with an unresolvable slug', async () => {
    const subscriber = await openSocket();
    subscriber.send(JSON.stringify({ type: 'subscribe', slug: 'does-not-exist' }));
    await new Promise((r) => setTimeout(r, 50));

    broadcastMatchCalled(tournamentIdA, { matchId: 'm4', competitor1Id: 'c7', competitor2Id: 'c8', mat: '1' });
    await expect(nextMessage(subscriber, 300)).rejects.toThrow('timed out waiting for a message');

    subscriber.close();
  });
});
