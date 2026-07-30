import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { LiveState } from '../types.js';
import { getDb } from '../db/client.js';
import { verifySession } from '../lib/jwt.js';

interface ClientMeta {
  tournamentId: string | null;
  mat: string | null;
}

// In-memory only — this is the ticking scoreboard state for a mat while a
// match is live. Final results are persisted separately via POST /matches/:id/finish.
// Keyed by "<tournamentId>:<mat>" so two different organizers' "Mat 1" never collide.
const liveStates = new Map<string, LiveState>();
const clients = new Map<WebSocket, ClientMeta>();

function compositeKey(tournamentId: string, mat: string): string {
  return `${tournamentId}:${mat}`;
}

// The operator console authenticates with its session JWT (tournamentId is
// derived server-side, never trusted from the client); the unauthenticated TV
// display instead sends the tournament's public slug, resolved the same way
// as server/src/routes/public.ts.
function resolveTournamentId(msg: Record<string, unknown>): string | null {
  if (typeof msg.token === 'string' && msg.token) {
    try {
      return verifySession(msg.token).tournamentId;
    } catch {
      return null;
    }
  }
  if (typeof msg.slug === 'string' && msg.slug) {
    const row = getDb().prepare('SELECT id FROM tournaments WHERE slug = ?').get(msg.slug) as { id: string } | undefined;
    return row?.id ?? null;
  }
  return null;
}

function isValidLiveState(payload: unknown): payload is LiveState {
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as Record<string, unknown>;
  const score1 = o.score1 as Record<string, unknown> | undefined;
  const score2 = o.score2 as Record<string, unknown> | undefined;
  const config = o.config as Record<string, unknown> | undefined;
  return (
    typeof o.timeLeft === 'number' &&
    typeof o.isActive === 'boolean' &&
    typeof o.isResting === 'boolean' &&
    typeof o.currentRound === 'number' &&
    !!score1 && typeof score1.points === 'number' && typeof score1.advantages === 'number' && typeof score1.penalties === 'number' &&
    !!score2 && typeof score2.points === 'number' && typeof score2.advantages === 'number' && typeof score2.penalties === 'number' &&
    (o.medTime === null || typeof o.medTime === 'number') &&
    Array.isArray(o.matchLog) &&
    !!config && typeof config.roundDuration === 'number' && typeof config.restDuration === 'number' && typeof config.rounds === 'number'
  );
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastToMat(tournamentId: string, mat: string, payload: LiveState | null, exclude: WebSocket): void {
  const msg = JSON.stringify({ type: 'sync', tournamentId, mat, payload });
  clients.forEach((meta, ws) => {
    if (meta.tournamentId === tournamentId && meta.mat === mat && ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

export function attachMatSync(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.set(ws, { tournamentId: null, mat: null });

    ws.on('message', (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;
      const msg = data as Record<string, unknown>;
      if (typeof msg.mat !== 'string' || !msg.mat) return;
      const mat = msg.mat;

      const tournamentId = resolveTournamentId(msg);
      if (!tournamentId) return;
      const key = compositeKey(tournamentId, mat);

      if (msg.type === 'join') {
        clients.set(ws, { tournamentId, mat });
        send(ws, { type: 'sync', tournamentId, mat, payload: liveStates.get(key) ?? null });
      } else if (msg.type === 'state' && isValidLiveState(msg.payload)) {
        liveStates.set(key, msg.payload);
        broadcastToMat(tournamentId, mat, msg.payload, ws);
      } else if (msg.type === 'reset') {
        liveStates.delete(key);
        broadcastToMat(tournamentId, mat, null, ws);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  return wss;
}
