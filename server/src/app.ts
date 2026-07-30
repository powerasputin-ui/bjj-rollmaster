import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { competitorsRouter } from './routes/competitors.js';
import { registrationsRouter } from './routes/registrations.js';
import { matchesRouter } from './routes/matches.js';
import { timerConfigRouter } from './routes/timerConfig.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/competitors', competitorsRouter);
  app.use('/api/registrations', registrationsRouter);
  app.use('/api/matches', matchesRouter);
  app.use('/api/timer-config', timerConfigRouter);
  app.use('/api', adminRouter);

  // In production the built frontend (`dist/`, produced by `vite build`) sits two
  // levels above the compiled server output (`server/dist/app.js`) — serve it and
  // fall back to index.html for any non-API route so client-side routing works.
  const distDir = path.resolve(__dirname, '../../dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}
