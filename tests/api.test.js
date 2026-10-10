// End-to-end tests through real HTTP, on a fresh database file per test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

const seedPath = path.resolve('seed.json');
const tempDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'surpluslink-')), 'test.db');

/** Starts the app on a free port; it is stopped automatically when the test ends. */
async function startServer(t, dbPath) {
  const db = openDatabase(dbPath, seedPath);
  const server = createApp(createStore(db)).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${server.address().port}/api`;

  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  let stopped = false;
  const stop = () =>
    new Promise((resolve) => {
      if (stopped) return resolve();
      stopped = true;
      server.close(() => { db.close(); resolve(); });
      server.closeAllConnections(); // drop fetch's keep-alive sockets so close() can finish
    });
  t.after(stop);
  return { call, stop };
}

test('two volunteers racing for the last kg: exactly one wins', async (t) => {
  const { call } = await startServer(t, tempDb());
  // DN2 has 10 kg in NORTH; V1 and V2 both cover NORTH and can carry 10 kg.
  const attempts = await Promise.all([
    call('POST', '/claims', { volunteer_id: 'V1', donation_id: 'DN2', kg: 10, planned_time: '2026-03-10T18:00' }),
    call('POST', '/claims', { volunteer_id: 'V2', donation_id: 'DN2', kg: 10, planned_time: '2026-03-10T18:00' }),
  ]);
  assert.deepEqual(attempts.map((a) => a.status).sort(), [201, 422]);
  const loser = attempts.find((a) => a.status === 422);
  assert.deepEqual(loser.body.reasons.map((r) => r.rule), [3]);

  const state = (await call('GET', '/state')).body;
  assert.equal(state.donations.find((d) => d.id === 'DN2').status, 'FULLY_CLAIMED');
});

test('moving the clock past pickup_until marks claims MISSED; clock never goes back', async (t) => {
  const { call } = await startServer(t, tempDb());
  await call('POST', '/claims', { volunteer_id: 'V1', donation_id: 'DN4', kg: 5, planned_time: '2026-03-10T17:30' });

  assert.equal((await call('POST', '/clock', { now: '2026-03-10T11:00' })).status, 422);
  const moved = await call('POST', '/clock', { now: '2026-03-10T19:01' });
  assert.equal(moved.body.newly_missed, 1);

  const state = (await call('GET', '/state')).body;
  const dn4 = state.donations.find((d) => d.id === 'DN4');
  assert.equal(dn4.status, 'EXPIRED');
  assert.equal(dn4.claims[0].status, 'MISSED');
  assert.equal(state.dashboard.totals.missed, 5);
  assert.equal(state.dashboard.totals.wasted, 25 + 7); // DN3 (ended 16:00) and DN4's unclaimed 7 kg
  assert.equal(state.dashboard.balanced, true);
});

test('state survives a restart and the seed is not loaded twice', async (t) => {
  const dbPath = tempDb();
  const first = await startServer(t, dbPath);
  await first.call('POST', '/clock', { now: '2026-03-10T15:00' });
  await first.call('POST', '/donations', {
    donor_id: 'D1', description: 'Paneer curry', quantity_kg: 8,
    pickup_from: '2026-03-10T16:00', pickup_until: '2026-03-10T17:00',
  });
  await first.stop();

  const second = await startServer(t, dbPath);
  const state = (await second.call('GET', '/state')).body;
  assert.equal(state.now, '2026-03-10T15:00');
  assert.equal(state.donations.length, 6);
  assert.equal(state.donations.at(-1).id, 'DN6');
});

test('donor rules: refuse bad windows, cancel only clean OPEN donations', async (t) => {
  const { call } = await startServer(t, tempDb());
  const bad = await call('POST', '/donations', {
    donor_id: 'D1', description: 'Soup', quantity_kg: 5,
    pickup_from: '2026-03-10T10:00', pickup_until: '2026-03-10T09:00',
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.reasons.length, 2); // from not before until AND until before now

  const nonWhole = await call('POST', '/donations', {
    donor_id: 'D1', description: 'Soup', quantity_kg: 1.5,
    pickup_from: '2026-03-10T13:00', pickup_until: '2026-03-10T14:00',
  });
  assert.equal(nonWhole.status, 400);

  await call('POST', '/claims', { volunteer_id: 'V3', donation_id: 'DN3', kg: 5, planned_time: '2026-03-10T14:00' });
  assert.equal((await call('POST', '/donations/DN3/cancel', { donor_id: 'D3' })).status, 422);
  assert.equal((await call('POST', '/donations/DN1/cancel', { donor_id: 'D2' })).status, 403);
  assert.equal((await call('POST', '/donations/DN1/cancel', { donor_id: 'D1' })).status, 200);
});
