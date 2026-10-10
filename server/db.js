// Opens the SQLite database, creates the tables, and loads seed.json once.
//
// We use Node's built-in SQLite module (node:sqlite), so there is nothing native
// to compile and no database server to install. State lives in one file, which
// is why it survives a backend restart.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS donors (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    zone TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS volunteers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    capacity_kg INTEGER NOT NULL,
    zones       TEXT NOT NULL -- JSON array, e.g. ["NORTH","EAST"]
  );

  CREATE TABLE IF NOT EXISTS donations (
    id           TEXT PRIMARY KEY,
    donor_id     TEXT NOT NULL REFERENCES donors(id),
    description  TEXT NOT NULL,
    quantity_kg  INTEGER NOT NULL CHECK (quantity_kg >= 1),
    pickup_from  TEXT NOT NULL,
    pickup_until TEXT NOT NULL,
    cancelled    INTEGER NOT NULL DEFAULT 0 -- the only stored status; the rest is derived
  );

  CREATE TABLE IF NOT EXISTS claims (
    id           TEXT PRIMARY KEY,
    donation_id  TEXT NOT NULL REFERENCES donations(id),
    volunteer_id TEXT NOT NULL REFERENCES volunteers(id),
    kg           INTEGER NOT NULL CHECK (kg >= 1),
    planned_time TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COLLECTED', 'CANCELLED', 'MISSED'))
  );
`;

export function openDatabase(dbPath, seedPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  // "Load seed.json only when your app has no saved state."
  const hasState = db.prepare("SELECT 1 FROM meta WHERE key = 'clock'").get();
  if (!hasState) loadSeed(db, seedPath);
  return db;
}

function loadSeed(db, seedPath) {
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const insertDonor = db.prepare('INSERT INTO donors (id, name, zone) VALUES (?, ?, ?)');
  const insertVolunteer = db.prepare('INSERT INTO volunteers (id, name, capacity_kg, zones) VALUES (?, ?, ?, ?)');
  const insertDonation = db.prepare(
    `INSERT INTO donations (id, donor_id, description, quantity_kg, pickup_from, pickup_until)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  try {
    db.prepare("INSERT INTO meta (key, value) VALUES ('clock', ?)").run(seed.clock);
    for (const d of seed.donors) insertDonor.run(d.id, d.name, d.zone);
    for (const v of seed.volunteers) insertVolunteer.run(v.id, v.name, v.capacity_kg, JSON.stringify(v.zones));
    for (const d of seed.donations ?? []) {
      insertDonation.run(d.id, d.donor_id, d.description, d.quantity_kg, d.pickup_from, d.pickup_until);
    }
    db.exec('COMMIT');
    console.log(`Loaded seed from ${seedPath}`);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
