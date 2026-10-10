// Unit tests for the pure rule functions. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimViolations,
  claimInputProblems,
  donationStatus,
  remainingKg,
  buildDashboard,
  claimCancelProblems,
  collectProblems,
} from '../server/rules.js';
import { isValidTime } from '../server/time.js';

const donation = {
  id: 'DN1',
  donor_id: 'D1',
  zone: 'NORTH',
  quantity_kg: 30,
  pickup_from: '2026-03-10T18:00',
  pickup_until: '2026-03-10T20:00',
  status: 'OPEN',
  remaining_kg: 30,
};
const volunteer = { id: 'V1', capacity_kg: 20, zones: ['NORTH', 'EAST'] };
const now = '2026-03-10T12:00';

test('a valid claim has no violations', () => {
  const v = claimViolations({ donation, volunteer, kg: 10, time: '2026-03-10T18:00', now, otherClaims: [] });
  assert.deepEqual(v, []);
});

test('every violated rule is reported, not only the first', () => {
  const v = claimViolations({
    donation: { ...donation, status: 'CANCELLED', remaining_kg: 5 }, // rule 1, rule 3
    volunteer: { capacity_kg: 10, zones: ['SOUTH'] }, // rule 2, rule 4
    kg: 12,
    time: '2026-03-10T11:30', // outside window (5) and before now (6)
    now,
    otherClaims: [{ id: 'C9', planned_time: '2026-03-10T11:00' }], // 30 min away (7)
  });
  assert.deepEqual(v.map((x) => x.rule), [1, 2, 3, 4, 5, 6, 7]);
});

test('window ends are inclusive and a 60 minute gap is allowed', () => {
  const other = [{ id: 'C1', planned_time: '2026-03-10T19:00' }];
  assert.deepEqual(claimViolations({ donation, volunteer, kg: 1, time: '2026-03-10T20:00', now, otherClaims: other }), []);
  assert.deepEqual(claimViolations({ donation, volunteer, kg: 1, time: '2026-03-10T18:00', now, otherClaims: other }), []);
  const close = claimViolations({ donation, volunteer, kg: 1, time: '2026-03-10T19:59', now, otherClaims: other });
  assert.deepEqual(close.map((x) => x.rule), [7]);
});

test('non-whole kg and bad times are input problems, separate from rules', () => {
  const problems = claimInputProblems({ kg: 2.5, planned_time: '10/03 18:00' }, volunteer, donation);
  assert.deepEqual(problems.map((p) => p.field), ['kg', 'planned_time']);
  assert.equal(isValidTime('2026-02-31T10:00'), false);
});

test('status priority: CANCELLED, EXPIRED, FULLY_CLAIMED, OPEN', () => {
  const d = { cancelled: false, pickup_until: '2026-03-10T20:00', remaining_kg: 0 };
  assert.equal(donationStatus({ ...d, cancelled: true }, '2026-03-11T00:00'), 'CANCELLED');
  assert.equal(donationStatus(d, '2026-03-10T20:01'), 'EXPIRED');
  assert.equal(donationStatus(d, '2026-03-10T20:00'), 'FULLY_CLAIMED');
  assert.equal(donationStatus({ ...d, remaining_kg: 3 }, now), 'OPEN');
});

test('remaining ignores cancelled claims only', () => {
  const claims = [
    { kg: 5, status: 'ACTIVE' },
    { kg: 4, status: 'CANCELLED' },
    { kg: 3, status: 'MISSED' },
    { kg: 2, status: 'COLLECTED' },
  ];
  assert.equal(remainingKg(30, claims), 20);
});

test('collect needs the window; cancel needs now strictly before T', () => {
  const claim = { status: 'ACTIVE', planned_time: '2026-03-10T18:30' };
  assert.equal(collectProblems(claim, donation, '2026-03-10T17:59').length, 1);
  assert.equal(collectProblems(claim, donation, '2026-03-10T20:00').length, 0);
  assert.equal(claimCancelProblems(claim, '2026-03-10T18:29').length, 0);
  assert.equal(claimCancelProblems(claim, '2026-03-10T18:30').length, 1);
});

test('dashboard: Listed equals the sum of the five other figures', () => {
  const donations = [
    { ...donation, status: 'EXPIRED', remaining_kg: 10, claims: [
      { kg: 15, status: 'COLLECTED', volunteer_id: 'V1' },
      { kg: 5, status: 'MISSED', volunteer_id: 'V1' },
    ] },
    { ...donation, id: 'DN2', quantity_kg: 10, status: 'OPEN', remaining_kg: 6, claims: [
      { kg: 4, status: 'ACTIVE', volunteer_id: 'V1' },
    ] },
    { ...donation, id: 'DN3', quantity_kg: 99, status: 'CANCELLED', remaining_kg: 99, claims: [] },
  ];
  const result = buildDashboard(donations, [{ id: 'D1', name: 'Spice Garden' }], [{ id: 'V1', name: 'Rhea' }]);
  assert.deepEqual(result.totals, { listed: 40, collected: 15, missed: 5, wasted: 10, in_progress: 4, still_open: 6 });
  assert.equal(result.balanced, true);
  assert.equal(result.per_donor[0].collected_kg, 15);
  assert.deepEqual(result.per_volunteer[0], { id: 'V1', name: 'Rhea', collected_kg: 15, missed_claims: 1 });
});
