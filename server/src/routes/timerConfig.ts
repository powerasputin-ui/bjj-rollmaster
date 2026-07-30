import { Router } from 'express';
import { getDb, getTimerConfigRow } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { isValidTimerConfig } from '../validation.js';

export const timerConfigRouter = Router();

timerConfigRouter.use(requireAuth);

timerConfigRouter.get('/', (req, res) => {
  res.json(getTimerConfigRow(req.tournamentId));
});

timerConfigRouter.put('/', (req, res) => {
  if (!isValidTimerConfig(req.body)) {
    res.status(400).json({ error: 'invalid_timer_config' });
    return;
  }
  const { roundDuration, restDuration, rounds } = req.body;
  getDb()
    .prepare('UPDATE timer_config SET round_duration = ?, rest_duration = ?, rounds = ? WHERE tournament_id = ?')
    .run(roundDuration, restDuration, rounds, req.tournamentId);
  res.json(getTimerConfigRow(req.tournamentId));
});
