import { Router } from 'express';
import { getWeightCategoryRows, replaceWeightCategoryRows } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { isValidWeightCategoriesReplace } from '../validation.js';

export const weightCategoriesRouter = Router();

weightCategoriesRouter.use(requireAuth);

weightCategoriesRouter.get('/', (req, res) => {
  res.json(getWeightCategoryRows(req.tournamentId));
});

weightCategoriesRouter.put('/', (req, res) => {
  if (!isValidWeightCategoriesReplace(req.body)) {
    res.status(400).json({ error: 'invalid_weight_categories' });
    return;
  }
  res.json(replaceWeightCategoryRows(req.tournamentId, req.body));
});
