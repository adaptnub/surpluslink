// The store: every action the app can take, on top of the database.
//
// Each action that changes data runs inside transaction(), which starts with
// BEGIN IMMEDIATE. That takes SQLite's write lock *before* we read anything, so
// the "check the rules, then write" steps can never interleave with another
// request. This is what stops two volunteers from both getting the last kg.
// (Node also runs our JS on one thread and node:sqlite is synchronous, so even
// inside one process nothing can run between the check and the insert.)

import {
  Refusal,
  remainingKg,
  donationStatus,
  donationInputProblems,
  donationRuleViolations,
  donationCancelProblems,
  claimInputProblems,
  claimViolations,
  collectProblems,
  claimCancelProblems,
  buildDashboard,
} from './rules.js';
import { isValidTime, isBefore } from './time.js';

export function createStore(db) {
  const sql = {
    clock: db.prepare("SELECT value FROM meta WHERE key = 'clock'"),
    setClock: db.prepare("UPDATE meta SET value = ? WHERE key = 'clock'"),
    // Times share one fixed format, so comparing them as text gives the right order.
    markMissed: db.prepare(`
      UPDATE claims SET status = 'MISSED'
      WHERE status = 'ACTIVE'
        AND donation_id IN (SELECT id FROM donations WHERE pickup_until < ?)`),

    donors: db.prepare('SELECT * FROM donors ORDER BY rowid'),
    volunteers: db.prepare('SELECT * FROM volunteers ORDER BY rowid'),
    donations: db.prepare('SELECT * FROM donations ORDER BY rowid'),
    donation: db.prepare('SELECT * FROM donations WHERE id = ?'),
    claims: db.prepare('SELECT * FROM claims ORDER BY rowid'),
    claim: db.prepare('SELECT * FROM claims WHERE id = ?'),
    claimsOfDonation: db.prepare('SELECT * FROM claims WHERE donation_id = ? ORDER BY rowid'),
    liveClaimsOfVolunteer: db.prepare(
      "SELECT * FROM claims WHERE volunteer_id = ? AND status IN ('ACTIVE', 'COLLECTED')",
    ),

    lastDonationNumber: db.prepare('SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS n FROM donations'),
    lastClaimNumber: db.prepare('SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) AS n FROM claims'),
    insertDonation: db.prepare(
      `INSERT INTO donations (id, donor_id, description, quantity_kg, pickup_from, pickup_until)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    cancelDonation: db.prepare('UPDATE donations SET cancelled = 1 WHERE id = ?'),
    insertClaim: db.prepare(
      `INSERT INTO claims (id, donation_id, volunteer_id, kg, planned_time, status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
    ),
    setClaimStatus: db.prepare('UPDATE claims SET status = ? WHERE id = ?'),
  };

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  // ------------------------------------------------------------ reading

  const now = () => sql.clock.get().value;

  const donors = () => sql.donors.all();
  const donorById = (id) => donors().find((d) => d.id === id);
  const volunteers = () => sql.volunteers.all().map((v) => ({ ...v, zones: JSON.parse(v.zones) }));
  const volunteerById = (id) => volunteers().find((v) => v.id === id);

  /** Adds the derived fields (zone, remaining_kg, status, claims) to a donation row. */
  function describe(row, claims, clock) {
    const donor = donorById(row.donor_id);
    const remaining = remainingKg(row.quantity_kg, claims);
    return {
      ...row,
      cancelled: row.cancelled === 1,
      donor_name: donor.name,
      zone: donor.zone, // a donation is in its donor's zone
      remaining_kg: remaining,
      status: donationStatus({ cancelled: row.cancelled === 1, pickup_until: row.pickup_until, remaining_kg: remaining }, clock),
      claims,
    };
  }

  function donationById(id) {
    const row = sql.donation.get(id);
    return row ? describe(row, sql.claimsOfDonation.all(id), now()) : null;
  }

  function allDonations() {
    const clock = now();
    const claims = sql.claims.all();
    return sql.donations.all().map((row) => describe(row, claims.filter((c) => c.donation_id === row.id), clock));
  }

  /** Everything the UI needs in one response. */
  function snapshot() {
    const donations = allDonations();
    const people = { donors: donors(), volunteers: volunteers() };
    return {
      now: now(),
      ...people,
      donations,
      dashboard: buildDashboard(donations, people.donors, people.volunteers),
    };
  }

  // -------------------------------------------------------------- clock

  function setClock(newNow) {
    if (!isValidTime(newNow)) {
      throw new Refusal(400, 'Invalid time', [{ field: 'now', message: 'Use the format YYYY-MM-DDTHH:MM.' }]);
    }
    return transaction(() => {
      const current = now();
      if (isBefore(newNow, current)) {
        throw new Refusal(422, 'The clock cannot move backwards', [
          { message: `${newNow} is before the current time ${current}.` },
        ]);
      }
      sql.setClock.run(newNow);
      // Moving past a donation's pickup_until turns its ACTIVE claims into MISSED.
      const missed = Number(sql.markMissed.run(newNow).changes);
      return { now: newNow, newly_missed: missed };
    });
  }

  // ---------------------------------------------------------- donations

  function postDonation(input) {
    if (!donorById(input.donor_id)) throw new Refusal(404, 'Unknown donor');
    const problems = donationInputProblems(input);
    if (problems.length) throw new Refusal(400, 'Invalid donation', problems);

    return transaction(() => {
      const violations = donationRuleViolations(input, now());
      if (violations.length) throw new Refusal(422, 'Donation refused', violations);

      const id = `DN${(sql.lastDonationNumber.get().n ?? 0) + 1}`;
      sql.insertDonation.run(
        id, input.donor_id, input.description.trim(), input.quantity_kg, input.pickup_from, input.pickup_until,
      );
      return donationById(id);
    });
  }

  function cancelDonation(donorId, donationId) {
    return transaction(() => {
      const donation = donationById(donationId);
      if (!donation) throw new Refusal(404, 'Unknown donation');
      if (donation.donor_id !== donorId) throw new Refusal(403, 'Only the donor who posted it can cancel it');

      const problems = donationCancelProblems(donation);
      if (problems.length) throw new Refusal(422, 'Cannot cancel this donation', problems);

      sql.cancelDonation.run(donationId);
      return donationById(donationId);
    });
  }

  // ------------------------------------------------------------- claims

  /** Runs all claim checks without saving anything. */
  function evaluateClaim(input) {
    const volunteer = volunteerById(input.volunteer_id);
    const donation = donationById(input.donation_id);
    const problems = claimInputProblems(input, volunteer, donation);
    if (problems.length) return { problems, violations: [] };

    const violations = claimViolations({
      donation,
      volunteer,
      kg: input.kg,
      time: input.planned_time,
      now: now(),
      otherClaims: sql.liveClaimsOfVolunteer.all(volunteer.id),
    });
    return { problems, violations };
  }

  /** Dry run used by the claim form to show live rule checks. */
  function checkClaim(input) {
    const { problems, violations } = evaluateClaim(input);
    return { ok: problems.length === 0 && violations.length === 0, problems, violations };
  }

  function createClaim(input) {
    return transaction(() => {
      const { problems, violations } = evaluateClaim(input);
      if (problems.length) throw new Refusal(400, 'Invalid claim', problems);
      if (violations.length) throw new Refusal(422, 'Claim refused', violations);

      const id = `C${(sql.lastClaimNumber.get().n ?? 0) + 1}`;
      sql.insertClaim.run(id, input.donation_id, input.volunteer_id, input.kg, input.planned_time);
      return sql.claim.get(id);
    });
  }

  /** Shared steps for collect and cancel: find the claim and check who owns it. */
  function ownClaim(volunteerId, claimId) {
    const claim = sql.claim.get(claimId);
    if (!claim) throw new Refusal(404, 'Unknown claim');
    if (claim.volunteer_id !== volunteerId) throw new Refusal(403, 'This claim belongs to another volunteer');
    return claim;
  }

  function collectClaim(volunteerId, claimId) {
    return transaction(() => {
      const claim = ownClaim(volunteerId, claimId);
      const problems = collectProblems(claim, sql.donation.get(claim.donation_id), now());
      if (problems.length) throw new Refusal(422, 'Cannot collect yet', problems);
      sql.setClaimStatus.run('COLLECTED', claimId);
      return sql.claim.get(claimId);
    });
  }

  function cancelClaim(volunteerId, claimId) {
    return transaction(() => {
      const claim = ownClaim(volunteerId, claimId);
      const problems = claimCancelProblems(claim, now());
      if (problems.length) throw new Refusal(422, 'Cannot cancel this claim', problems);
      sql.setClaimStatus.run('CANCELLED', claimId); // its kg return to the donation automatically
      return sql.claim.get(claimId);
    });
  }

  return { snapshot, setClock, postDonation, cancelDonation, checkClaim, createClaim, collectClaim, cancelClaim };
}
