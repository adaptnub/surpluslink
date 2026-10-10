# SurplusLink

A web app where restaurants post surplus cooked food with a pickup window, and
volunteers with vehicles reserve and collect it. The backend enforces capacity,
zone and timing rules, never over-books a donation, and reports how much food
was saved or wasted.

## What I built

| Area | What it does |
|---|---|
| **Act as** | Left rail: pick any restaurant, any volunteer, or the dashboard. There is no login. |
| **Clock** | Simulated clock in the top bar. Jump +15m / +1h / +3h or set an exact time. It never moves backwards; the real system time is never used. |
| **Restaurants** | Post a donation (description, whole kg, pickup window). See every donation with its status, a kg breakdown bar and all claims on it. Cancel while it is OPEN with no active or collected claims. |
| **Volunteers** | See OPEN donations in their zones. Reserve one in a side panel that checks all 7 claim rules **live** as you type, and lists **every** violated rule on refusal. Mark pickups collected or cancel them. |
| **Dashboard** | Listed = Collected + Missed + Wasted + In progress + Still open, with a "books balance" check, collected kg per restaurant, and collected kg + missed claims per volunteer. |
| **Persistence** | State lives in a SQLite file (`data/surpluslink.db`) and survives restarts. `seed.json` is loaded only when there is no saved state. |

### Tech stack

- **Backend:** Node.js 22 + Express. Storage uses Node's **built-in SQLite** (`node:sqlite`), so there is no database server and nothing native to compile.
- **Frontend:** React 18 + Vite, plain CSS (no UI kit). Fonts are bundled from npm, so it works offline.
- **Tests:** Node's built-in test runner (`node --test`).

No paid services and no API keys are needed.

## How to run it

**Prerequisite:** Node.js **22.13 or newer** (check with `node --version`).

```bash
npm install
npm run build
npm start
```

Open **http://localhost:3000**.

Development mode with hot reload (API on :3000, UI on :5173):

```bash
npm run dev
```

Then open **http://localhost:5173**.

Run the tests:

```bash
npm test
```

**To reset to the seed:** stop the server, delete the `data/` folder, and start it again.

Optional environment variables: `PORT` (default 3000), `DB_PATH` (default `data/surpluslink.db`), `SEED_PATH` (default `seed.json`).

## Project layout

```
server/
  time.js     time strings <-> minutes; the only time maths in the backend
  rules.js    every business rule as a pure function (status, remaining kg,
              7 claim rules, collect/cancel rules, dashboard totals)
  db.js       opens SQLite, creates tables, loads seed.json once
  store.js    every action (post, cancel, claim, collect, move clock),
              each wrapped in a write-locked transaction
  app.js      Express routes (one line each) + error -> JSON mapping
  index.js    entry point
client/src/
  App.jsx               loads state, remembers who you are acting as, picks a view
  components/Header.jsx           brand + simulated clock controls
  components/PeopleRail.jsx       "act as" picker
  components/DonorView.jsx        post form + your donations with claims
  components/VolunteerView.jsx    your pickups + open donations in your zones
  components/ClaimDrawer.jsx      reserve panel with live 7-rule check
  components/Dashboard.jsx        ledger + per-donor + per-volunteer
  components/DonationTicket.jsx   one donation card
  components/bits.jsx             small shared pieces (tags, bars, buttons)
tests/
  rules.test.js   unit tests for each rule
  api.test.js     HTTP tests: race for the last kg, MISSED, restart, donor rules
```

## How the key requirements are met

**Derived status, never stale.** Only `cancelled` is stored on a donation.
`remaining_kg` and `status` (CANCELLED → EXPIRED → FULLY_CLAIMED → OPEN, first
match wins) are computed from the claims and the clock every time
(`rules.js: remainingKg`, `donationStatus`).

**Every violated rule is reported.** `claimViolations()` checks all seven rules
and collects every failure into a list, each tagged with its rule number. Bad
input (non-whole kg, malformed time, unknown ids) is rejected separately with
HTTP 400. Rule violations use HTTP 422.

**No over-booking.** `createClaim` runs inside `BEGIN IMMEDIATE`, which takes
SQLite's write lock *before* reading remaining kg. Two requests for the last kg
are serialised: the second one sees 0 kg left and fails rule 3. Node also runs
the handler synchronously (`node:sqlite` is sync), so nothing can interleave
between the check and the insert. `tests/api.test.js` fires two simultaneous
claims for the last 10 kg and asserts exactly one 201 and one 422.

**MISSED claims.** When the clock moves forward, the same transaction turns
every ACTIVE claim whose donation's `pickup_until` is now in the past into
MISSED.

**Dashboard always balances.** Every kg of a non-cancelled donation is in exactly
one bucket: a claim that is COLLECTED, MISSED or ACTIVE, or the remaining kg
(Wasted if the donation is EXPIRED, Still open otherwise). The dashboard shows
whether Listed equals the sum.

### API

| Method | Path | Body |
|---|---|---|
| GET | `/api/state` | — returns clock, people, donations (with claims, status, remaining) and dashboard |
| POST | `/api/clock` | `{ now }` |
| POST | `/api/donations` | `{ donor_id, description, quantity_kg, pickup_from, pickup_until }` |
| POST | `/api/donations/:id/cancel` | `{ donor_id }` |
| POST | `/api/claims/check` | same as below; dry run, saves nothing |
| POST | `/api/claims` | `{ volunteer_id, donation_id, kg, planned_time }` |
| POST | `/api/claims/:id/collect` | `{ volunteer_id }` |
| POST | `/api/claims/:id/cancel` | `{ volunteer_id }` |

Refusals look like `{ "error": "Claim refused", "reasons": [{ "rule": 3, "message": "Only 4 kg is left on this donation." }] }`.

## Assumptions

1. **Capacity is per claim.** Rule 2 compares the kg of one claim with the volunteer's capacity, as written. Separate claims are not added up, because the 60-minute gap (rule 7) already separates trips.
2. **Rule 7 spans all donations.** It looks at the volunteer's ACTIVE and COLLECTED claims on any donation. A gap of exactly 60 minutes is allowed.
3. **"After" means strictly after.** A donation is EXPIRED only when now > `pickup_until`. Its ACTIVE claims become MISSED only when the clock moves strictly past `pickup_until`. At exactly `pickup_until` you can still collect.
4. **Posting a donation.** It is refused only if `pickup_from` is not before `pickup_until`, or `pickup_until` is before now. So `pickup_until` equal to now is allowed, and `pickup_from` may already have passed. Both problems are reported together.
5. **Collect timing.** Collect depends only on the pickup window, as stated, not on the planned time T.
6. **MISSED kg do not return.** Remaining kg subtracts every claim that is not CANCELLED, so MISSED kg stay subtracted. On an expired donation they count as Missed, not Wasted, which keeps the dashboard sum exact.
7. **Cancelled claims don't block.** A donation whose only claims are CANCELLED can still be cancelled by its donor.
8. **A fully claimed donation fails rule 3, not rule 1.** Rule 1 only covers CANCELLED or EXPIRED.
9. **Ownership.** Only the donor who posted a donation can cancel it, and only the volunteer who made a claim can collect or cancel it (HTTP 403 otherwise). Without a login, the acting person's id is sent with each request.
10. **Volunteer list.** Volunteers see only OPEN donations in their zones. FULLY_CLAIMED, EXPIRED and CANCELLED ones are hidden there; donors still see all of theirs.
11. **Input format.** kg must be a JSON integer of at least 1. Strings like `"5"` or decimals like `2.5` are rejected as invalid input. Times must be real `YYYY-MM-DDTHH:MM` values (for example, `2026-02-31` is rejected).
12. **New ids** continue the seed's style: donations `DN6, DN7…`, claims `C1, C2…`.
13. **Saved state** means the SQLite file already holds a clock value. If it does, `seed.json` is not read again.
14. **Live updates.** The UI polls `/api/state` every 4 seconds so several browser tabs stay in sync.
