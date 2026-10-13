import express from 'express';
import { cancelOrder, getOrder } from './clients/orders-client';
import { logger } from './logger';

/** The public HTTP gateway in front of the services. */
const app = express();

app.get('/api/orders/:id', async (req, res) => {
  res.json(await getOrder(req.params.id));
});

app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    res.json(await cancelOrder(req.params.id));
  } catch (error) {
    logger.error('Cancel failed for order %s', req.params.id);
    res.status(502).json({ error: String(error) });
  }
});

app.listen(3000);
