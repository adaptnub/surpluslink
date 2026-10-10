// HTTP routes. Each route is one line that hands the request to the store;
// all the logic lives in store.js and rules.js.

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Refusal } from './rules.js';

export function createApp(store, { staticDir } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/api/state', (req, res) => res.json(store.snapshot()));

  app.post('/api/clock', (req, res) => res.json(store.setClock(req.body.now)));

  app.post('/api/donations', (req, res) => res.status(201).json(store.postDonation(req.body)));
  app.post('/api/donations/:id/cancel', (req, res) =>
    res.json(store.cancelDonation(req.body.donor_id, req.params.id)),
  );

  app.post('/api/claims/check', (req, res) => res.json(store.checkClaim(req.body)));
  app.post('/api/claims', (req, res) => res.status(201).json(store.createClaim(req.body)));
  app.post('/api/claims/:id/collect', (req, res) =>
    res.json(store.collectClaim(req.body.volunteer_id, req.params.id)),
  );
  app.post('/api/claims/:id/cancel', (req, res) =>
    res.json(store.cancelClaim(req.body.volunteer_id, req.params.id)),
  );

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found', reasons: [] }));

  // Serve the built React app (after `npm run build`).
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // Turn refusals into JSON: { error, reasons: [{ rule?, field?, message }] }
  app.use((err, req, res, next) => {
    if (err instanceof Refusal) {
      return res.status(err.status).json({ error: err.message, reasons: err.reasons });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Body must be valid JSON', reasons: [] });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', reasons: [] });
  });

  return app;
}
