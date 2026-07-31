import type { LiveState } from '../types';

interface MatSocketHandlers {
  onSync: (payload: LiveState | null) => void;
}

// Identifies which tournament this mat channel belongs to: a JWT for the
// authenticated operator console (server derives tournamentId from it,
// never trusting a client-supplied id), or a public slug for the TV display.
export type MatSocketAuth = { token: string } | { slug: string };

export interface MatSocket {
  send: (msg: Record<string, unknown>) => void;
  setMat: (mat: string) => void;
  close: () => void;
}

// Thin WebSocket client for the per-mat live scoreboard channel (see
// server/src/ws/matSync.ts). Reconnects with backoff so a TV display left
// running for hours recovers from dropped wifi/sleep without a page reload.
export function connectMatSocket(initialMat: string, auth: MatSocketAuth, handlers: MatSocketHandlers): MatSocket {
  let ws: WebSocket | null = null;
  let currentMat = initialMat;
  let closed = false;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const wsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  const join = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', mat: currentMat, ...auth }));
    }
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      return;
    }

    ws.onopen = () => {
      reconnectDelay = 1000;
      join();
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'sync' && data.mat === currentMat) {
          handlers.onSync(data.payload ?? null);
        }
      } catch {
        /* ignore malformed message */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    send: (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ...msg, mat: currentMat, ...auth }));
      }
    },
    setMat: (mat) => {
      if (mat === currentMat) return;
      currentMat = mat;
      join();
    },
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

export interface MatchCalledEvent {
  matchId: string;
  competitor1Id: string | null;
  competitor2Id: string | null;
  mat: string;
}

export interface CalledSocket {
  close: () => void;
}

// Tournament-wide (not mat-scoped) "your match was called" listener, used by
// AthleteCabinet.tsx — subscribes via the tournament's public slug, same
// unauthenticated trust level as the TV display, but read-only (never sends
// join/state/reset). See server/src/ws/matSync.ts's 'subscribe'/'called'
// handling and routes/matches.ts's call-to-mat handler, which triggers it.
export function connectCalledSocket(slug: string, onCalled: (event: MatchCalledEvent) => void): CalledSocket {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const wsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      return;
    }

    ws.onopen = () => {
      reconnectDelay = 1000;
      ws?.send(JSON.stringify({ type: 'subscribe', slug }));
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'called') {
          onCalled({
            matchId: data.matchId,
            competitor1Id: data.competitor1Id ?? null,
            competitor2Id: data.competitor2Id ?? null,
            mat: data.mat,
          });
        }
      } catch {
        /* ignore malformed message */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
