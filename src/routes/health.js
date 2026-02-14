import { Router } from 'express';
import db from '../db/knex.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await db.raw('select 1');
    return res.status(200).json({ status: 'ok', db: 'connected' });
  } catch {
    return res.status(200).json({ status: 'degraded', db: 'disconnected' });
  }
});

export default router;
