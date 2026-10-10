// What a volunteer sees: OPEN donations in their zones (to reserve), and their
// own pickups (to collect or cancel).

import { useState } from 'react';
import { api } from '../api.js';
import { dayLabel, hhmm, shortTime } from '../time.js';
import DonationTicket from './DonationTicket.jsx';
import ClaimDrawer from './ClaimDrawer.jsx';
import { ClaimPill, ConfirmButton, Empty, ProfileHeader, SectionTitle, ZoneTag } from './bits.jsx';

const STATUS_ORDER = { ACTIVE: 0, COLLECTED: 1, MISSED: 2, CANCELLED: 3 };

export default function VolunteerView({ volunteer, state, perform }) {
  const [claimingId, setClaimingId] = useState(null);

  const available = state.donations.filter((d) => d.status === 'OPEN' && volunteer.zones.includes(d.zone));
  const myClaims = state.donations
    .flatMap((d) => d.claims.filter((c) => c.volunteer_id === volunteer.id).map((c) => ({ ...c, donation: d })))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.planned_time.localeCompare(b.planned_time));

  const stats = state.dashboard.per_volunteer.find((v) => v.id === volunteer.id);
  const claiming = state.donations.find((d) => d.id === claimingId);

  return (
    <>
      <ProfileHeader
        eyebrow="Volunteer"
        name={volunteer.name}
        zone={volunteer.zones[0]}
        stats={[
          ['Vehicle holds', volunteer.capacity_kg, 'kg'],
          ['Collected', stats?.collected_kg ?? 0, 'kg'],
          ['Missed', stats?.missed_claims ?? 0],
        ]}
      >
        {volunteer.zones.map((z) => (
          <ZoneTag key={z} zone={z} />
        ))}
        <span className="muted">Pickups must be at least 60 minutes apart.</span>
      </ProfileHeader>

      <section>
        <SectionTitle title="Your pickups" count={myClaims.length} hint="Collect while the pickup window is open. Cancel before your planned time." />
        {myClaims.length === 0 ? (
          <Empty title="No pickups yet">Reserve food from the list below and it shows up here.</Empty>
        ) : (
          <ul className="pickups">
            {myClaims.map((claim) => (
              <PickupRow key={claim.id} claim={claim} volunteer={volunteer} now={state.now} perform={perform} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle
          title="Open in your zones"
          count={available.length}
          hint={`OPEN donations in ${volunteer.zones.join(' and ')}.`}
        />
        {available.length === 0 ? (
          <Empty title="Nothing to pick up right now">Move the clock or check back when restaurants post more food.</Empty>
        ) : (
          <div className="ticket-grid">
            {available.map((d) => (
              <DonationTicket key={d.id} donation={d} now={state.now}>
                <button type="button" className="btn btn--primary" onClick={() => setClaimingId(d.id)}>
                  Reserve
                </button>
              </DonationTicket>
            ))}
          </div>
        )}
      </section>

      {claiming && (
        <ClaimDrawer
          donation={claiming}
          volunteer={volunteer}
          now={state.now}
          perform={perform}
          onClose={() => setClaimingId(null)}
        />
      )}
    </>
  );
}

function PickupRow({ claim, volunteer, now, perform }) {
  const d = claim.donation;
  return (
    <li className={`pickup is-${claim.status.toLowerCase()}`} data-zone={d.zone}>
      <div className="pickup__time">
        <span className="pickup__clock">{hhmm(claim.planned_time)}</span>
        <span>{dayLabel(claim.planned_time)}</span>
      </div>
      <div className="pickup__what">
        <strong>
          {claim.kg} kg · {d.description}
        </strong>
        <span>
          {d.donor_name} · {d.zone} · window {shortTime(d.pickup_from, now)}–{shortTime(d.pickup_until, now)}
        </span>
      </div>
      <ClaimPill status={claim.status} />
      {claim.status === 'ACTIVE' && (
        <div className="pickup__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => perform(() => api.collectClaim(claim.id, volunteer.id), { success: `Collected ${claim.kg} kg. Thank you!` })}
          >
            Mark collected
          </button>
          <ConfirmButton
            confirmLabel="Confirm cancel"
            onConfirm={() => perform(() => api.cancelClaim(claim.id, volunteer.id), { success: `${claim.kg} kg returned to ${d.id}` })}
          >
            Cancel
          </ConfirmButton>
        </div>
      )}
    </li>
  );
}
