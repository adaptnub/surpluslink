// Entry point: open the database, build the app, start listening.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createStore } from './store.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DB_PATH ?? path.join(root, 'data', 'surpluslink.db');
const seedPath = process.env.SEED_PATH ?? path.join(root, 'seed.json');
const port = Number(process.env.PORT ?? 3000);

const db = openDatabase(dbPath, seedPath);
const app = createApp(createStore(db), { staticDir: path.join(root, 'dist') });

app.listen(port, () => {
  console.log(`SurplusLink API on http://localhost:${port}  (data: ${dbPath})`);
});
