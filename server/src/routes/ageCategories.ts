import { Router } from 'express';
import { getAgeCategoryRows, replaceAgeCategoryRows } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { isValidAgeCategoriesReplace } from '../validation.js';

export const ageCategoriesRouter = Router();

ageCategoriesRouter.use(requireAuth);

ageCategoriesRouter.get('/', (req, res) => {
  res.json(getAgeCategoryRows(req.tournamentId));
});

ageCategoriesRouter.put('/', (req, res) => {
  if (!isValidAgeCategoriesReplace(req.body)) {
    res.status(400).json({ error: 'invalid_age_categories' });
    return;
  }
  res.json(replaceAgeCategoryRows(req.tournamentId, req.body));
});
