// Business rules from the problem statement, written as pure functions.
//
// Nothing in this file touches the database or HTTP. Each function takes plain
// objects and returns a value or a list of "reasons", which makes every rule
// easy to read and easy to unit test (see tests/rules.test.js).
//
// A reason looks like { rule?: number, field?: string, message: string }.

import { isValidTime, isBefore, isAfter, isWithin, minutesBetween } from './time.js';

export const MIN_GAP_MINUTES = 60;

/** A refusal carries an HTTP status and the list of reasons shown to the user. */
export class Refusal extends Error {
  constructor(status, message, reasons = []) {
    super(message);
    this.status = status;
    this.reasons = reasons;
  }
}

const isWholeKg = (value) => Number.isInteger(value) && value >= 1;

// ---------------------------------------------------------------- donations

/** Remaining kg = quantity minus the kg of every claim that is not CANCELLED. */
export function remainingKg(quantityKg, claims) {
  const taken = claims
    .filter((claim) => claim.status !== 'CANCELLED')
    .reduce((sum, claim) => sum + claim.kg, 0);
  return quantityKg - taken;
}

/** Status is the first that applies: CANCELLED, EXPIRED, FULLY_CLAIMED, OPEN. */
export function donationStatus({ cancelled, pickup_until, remaining_kg }, now) {
  if (cancelled) return 'CANCELLED';
  if (isAfter(now, pickup_until)) return 'EXPIRED';
  if (remaining_kg === 0) return 'FULLY_CLAIMED';
  return 'OPEN';
}

/** Bad input shape (missing text, non-whole kg, malformed time). Rejected with 400. */
export function donationInputProblems(input) {
  const problems = [];
  if (typeof input.description !== 'string' || input.description.trim() === '') {
    problems.push({ field: 'description', message: 'Describe the food.' });
  }
  if (!isWholeKg(input.quantity_kg)) {
    problems.push({ field: 'quantity_kg', message: 'Quantity must be a whole number of kg, at least 1.' });
  }
  for (const field of ['pickup_from', 'pickup_until']) {
    if (!isValidTime(input[field])) {
      problems.push({ field, message: 'Use a valid date and time (YYYY-MM-DDTHH:MM).' });
    }
  }
  return problems;
}

/** Valid input that breaks a donation rule. Rejected with 422. */
export function donationRuleViolations(input, now) {
  const violations = [];
  if (!isBefore(input.pickup_from, input.pickup_until)) {
    violations.push({ field: 'pickup_from', message: 'Pickup must start before it ends.' });
  }
  if (isBefore(input.pickup_until, now)) {
    violations.push({ field: 'pickup_until', message: `The pickup window has already ended (now is ${now}).` });
  }
  return violations;
}

/** A donor can cancel only while the donation is OPEN with no ACTIVE or COLLECTED claims. */
export function donationCancelProblems(donation) {
  const problems = [];
  if (donation.status !== 'OPEN') {
    problems.push({ message: `It is ${donation.status}. Only OPEN donations can be cancelled.` });
  }
  const blocking = donation.claims.filter((c) => c.status === 'ACTIVE' || c.status === 'COLLECTED');
  if (blocking.length > 0) {
    problems.push({ message: `It has ${blocking.length} active or collected claim(s).` });
  }
  return problems;
}

// ------------------------------------------------------------------- claims

/** Bad input shape for a claim (unknown people, non-whole kg, malformed time). */
export function claimInputProblems(input, volunteer, donation) {
  const problems = [];
  if (!volunteer) problems.push({ field: 'volunteer_id', message: 'Unknown volunteer.' });
  if (!donation) problems.push({ field: 'donation_id', message: 'Unknown donation.' });
  if (!isWholeKg(input.kg)) {
    problems.push({ field: 'kg', message: 'kg must be a whole number, at least 1.' });
  }
  if (!isValidTime(input.planned_time)) {
    problems.push({ field: 'planned_time', message: 'Use a valid date and time (YYYY-MM-DDTHH:MM).' });
  }
  return problems;
}

/**
 * Checks the seven claim rules and returns EVERY violated one, not just the first.
 *
 * @param donation    the donation with its derived status, zone and remaining_kg
 * @param volunteer   { capacity_kg, zones }
 * @param kg          whole kg requested
 * @param time        planned pickup time T
 * @param now         the simulated clock
 * @param otherClaims this volunteer's ACTIVE or COLLECTED claims
 */
export function claimViolations({ donation, volunteer, kg, time, now, otherClaims }) {
  const violations = [];
  const fail = (rule, message) => violations.push({ rule, message });

  if (donation.status === 'CANCELLED' || donation.status === 'EXPIRED') {
    fail(1, `The donation is ${donation.status}.`);
  }
  if (kg > volunteer.capacity_kg) {
    fail(2, `${kg} kg is more than your vehicle capacity of ${volunteer.capacity_kg} kg.`);
  }
  if (kg > donation.remaining_kg) {
    fail(3, `Only ${donation.remaining_kg} kg is left on this donation.`);
  }
  if (!volunteer.zones.includes(donation.zone)) {
    fail(4, `The donation is in ${donation.zone}; you cover ${volunteer.zones.join(', ')}.`);
  }
  if (!isWithin(time, donation.pickup_from, donation.pickup_until)) {
    fail(5, `Pick a time between ${donation.pickup_from} and ${donation.pickup_until}.`);
  }
  if (isBefore(time, now)) {
    fail(6, `${time} is in the past (now is ${now}).`);
  }
  const clashes = otherClaims.filter((c) => minutesBetween(c.planned_time, time) < MIN_GAP_MINUTES);
  if (clashes.length > 0) {
    const list = clashes.map((c) => `${c.id} at ${c.planned_time}`).join(', ');
    fail(7, `Less than ${MIN_GAP_MINUTES} minutes from your other pickup(s): ${list}.`);
  }
  return violations;
}

/** Collect: only an ACTIVE claim, only while now is inside the pickup window. */
export function collectProblems(claim, donation, now) {
  const problems = [];
  if (claim.status !== 'ACTIVE') problems.push({ message: `The claim is ${claim.status}, not ACTIVE.` });
  if (!isWithin(now, donation.pickup_from, donation.pickup_until)) {
    problems.push({ message: `You can collect only between ${donation.pickup_from} and ${donation.pickup_until}.` });
  }
  return problems;
}

/** Cancel a claim: only an ACTIVE claim, only while now is strictly before T. */
export function claimCancelProblems(claim, now) {
  const problems = [];
  if (claim.status !== 'ACTIVE') problems.push({ message: `The claim is ${claim.status}, not ACTIVE.` });
  if (!isBefore(now, claim.planned_time)) {
    problems.push({ message: `Too late to cancel: the planned time ${claim.planned_time} has been reached.` });
  }
  return problems;
}

// ---------------------------------------------------------------- dashboard

/**
 * Totals over every donation that is not CANCELLED. Each donation's quantity
 * splits into exactly one of the five buckets per kg, so
 * Listed = Collected + Missed + Wasted + In progress + Still open.
 */
export function buildDashboard(donations, donors, volunteers) {
  const totals = { listed: 0, collected: 0, missed: 0, wasted: 0, in_progress: 0, still_open: 0 };
  const perDonor = new Map(donors.map((d) => [d.id, { id: d.id, name: d.name, zone: d.zone, collected_kg: 0 }]));
  const perVolunteer = new Map(
    volunteers.map((v) => [v.id, { id: v.id, name: v.name, collected_kg: 0, missed_claims: 0 }]),
  );

  for (const donation of donations) {
    if (donation.status === 'CANCELLED') continue;
    totals.listed += donation.quantity_kg;

    for (const claim of donation.claims) {
      if (claim.status === 'COLLECTED') {
        totals.collected += claim.kg;
        perDonor.get(donation.donor_id).collected_kg += claim.kg;
        perVolunteer.get(claim.volunteer_id).collected_kg += claim.kg;
      } else if (claim.status === 'MISSED') {
        totals.missed += claim.kg;
        perVolunteer.get(claim.volunteer_id).missed_claims += 1;
      } else if (claim.status === 'ACTIVE') {
        totals.in_progress += claim.kg;
      }
    }

    if (donation.status === 'EXPIRED') totals.wasted += donation.remaining_kg;
    else totals.still_open += donation.remaining_kg;
  }

  const parts = totals.collected + totals.missed + totals.wasted + totals.in_progress + totals.still_open;
  return {
    totals,
    balanced: totals.listed === parts,
    per_donor: [...perDonor.values()],
    per_volunteer: [...perVolunteer.values()],
  };
}
