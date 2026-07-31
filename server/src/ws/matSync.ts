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

interface ResolvedAuth {
  tournamentId: string;
  // null = unrestricted (organizer tournament-token, or the unauthenticated
  // TV display) — may join/write any mat. A mat-token's own mat number
  // otherwise, which the caller must match against the message's mat.
  mat: string | null;
}

// The operator console authenticates with its session JWT (tournamentId is
// derived server-side, never trusted from the client); the unauthenticated TV
// display instead sends the tournament's public slug, resolved the same way
// as server/src/routes/public.ts. A mat-token additionally locks the
// connection to its own mat — see the mat check at the call site.
function resolveAuth(msg: Record<string, unknown>): ResolvedAuth | null {
  if (typeof msg.token === 'string' && msg.token) {
    try {
      const payload = verifySession(msg.token);
      if (!payload.tournamentId) return null;
      return { tournamentId: payload.tournamentId, mat: payload.kind === 'mat' ? payload.mat ?? null : null };
    } catch {
      return null;
    }
  }
  if (typeof msg.slug === 'string' && msg.slug) {
    const row = getDb().prepare('SELECT id FROM tournaments WHERE slug = ?').get(msg.slug) as { id: string } | undefined;
    return row ? { tournamentId: row.id, mat: null } : null;
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

export interface MatchCalledPayload {
  matchId: string;
  competitor1Id: string | null;
  competitor2Id: string | null;
  mat: string;
}

// Broadcast a "your match was called" event to every client subscribed to
// this tournament — not mat-scoped, unlike broadcastToMat, since a listener
// here (an athlete's cabinet) doesn't know in advance which mat it'll be
// called to. Called from routes/matches.ts's call-to-mat handler. Clients
// filter for themselves by checking competitor1Id/competitor2Id against
// their own registrations — the server doesn't track athlete identity here.
export function broadcastMatchCalled(tournamentId: string, payload: MatchCalledPayload): void {
  const msg = JSON.stringify({ type: 'called', tournamentId, ...payload });
  clients.forEach((meta, ws) => {
    if (meta.tournamentId === tournamentId && ws.readyState === WebSocket.OPEN) {
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

      // Subscribe-only clients (an athlete's cabinet, listening for "called"
      // broadcasts) don't pick a mat — they just want every event for their
      // tournament. Handled before the mat-required gate below, which every
      // other message type (join/state/reset) still needs.
      if (msg.type === 'subscribe') {
        const auth = resolveAuth(msg);
        if (!auth) return;
        clients.set(ws, { tournamentId: auth.tournamentId, mat: null });
        return;
      }

      if (typeof msg.mat !== 'string' || !msg.mat) return;
      const mat = msg.mat;

      const auth = resolveAuth(msg);
      if (!auth) return;
      // A mat-token is locked to its own mat — it can't even join/observe a
      // different mat's channel, let alone write to it.
      if (auth.mat !== null && auth.mat !== mat) return;
      const tournamentId = auth.tournamentId;
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
