process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';

import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { attachMatSync } from '../ws/matSync.js';
import { getDb } from '../db/client.js';

let server: http.Server;
let baseUrl: string;
let slugA: string;
let slugB: string;

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
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  slugA = 'tournament-a-' + crypto.randomBytes(3).toString('hex');
  slugB = 'tournament-b-' + crypto.randomBytes(3).toString('hex');
  db.prepare('INSERT INTO tournaments (id, name, slug) VALUES (?, ?, ?)').run(idA, 'Tournament A', slugA);
  db.prepare('INSERT INTO tournaments (id, name, slug) VALUES (?, ?, ?)').run(idB, 'Tournament B', slugB);

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
