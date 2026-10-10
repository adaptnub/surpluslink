// What a restaurant sees: a form to post surplus food, and its donations with
// every claim on them. The server checks all the rules; this view only shows
// the result.

import { useState } from 'react';
import { api } from '../api.js';
import { addMinutes, shortTime } from '../time.js';
import DonationTicket from './DonationTicket.jsx';
import { ClaimPill, ConfirmButton, Empty, ProfileHeader, ReasonList, SectionTitle, ZoneTag } from './bits.jsx';

export default function DonorView({ donor, state, perform }) {
  const mine = state.donations.filter((d) => d.donor_id === donor.id).reverse(); // newest first
  const volunteerName = (id) => state.volunteers.find((v) => v.id === id)?.name ?? id;
  const collected = state.dashboard.per_donor.find((d) => d.id === donor.id)?.collected_kg ?? 0;
  const listed = mine.filter((d) => d.status !== 'CANCELLED').reduce((sum, d) => sum + d.quantity_kg, 0);

  return (
    <>
      <ProfileHeader
        eyebrow="Restaurant"
        name={donor.name}
        zone={donor.zone}
        stats={[
          ['Listed', listed, 'kg'],
          ['Collected', collected, 'kg'],
          ['Open now', mine.filter((d) => d.status === 'OPEN').length],
        ]}
      >
        <ZoneTag zone={donor.zone} />
        <span className="muted">Donations are picked up by volunteers who cover {donor.zone}.</span>
      </ProfileHeader>

      <div className="donor-grid">
        <PostDonationForm donor={donor} now={state.now} perform={perform} />

        <section>
          <SectionTitle title="Your donations" count={mine.length} />
          {mine.length === 0 ? (
            <Empty title="Nothing posted yet">Post your first surplus using the form.</Empty>
          ) : (
            <div className="stack">
              {mine.map((d) => (
                <DonationTicket
                  key={d.id}
                  donation={d}
                  now={state.now}
                  footer={<ClaimTable claims={d.claims} volunteerName={volunteerName} now={state.now} />}
                >
                  {d.status === 'OPEN' && (
                    <ConfirmButton
                      confirmLabel="Confirm cancel"
                      onConfirm={() => perform(() => api.cancelDonation(d.id, donor.id), { success: `${d.id} cancelled` })}
                    >
                      Cancel donation
                    </ConfirmButton>
                  )}
                </DonationTicket>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ClaimTable({ claims, volunteerName, now }) {
  if (claims.length === 0) return <p className="ticket__foot muted">No claims yet.</p>;
  return (
    <div className="ticket__foot">
      <table className="claims-table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Volunteer</th>
            <th className="num">Kg</th>
            <th>Pickup</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.id}</td>
              <td>{volunteerName(c.volunteer_id)}</td>
              <td className="num mono">{c.kg}</td>
              <td className="mono">{shortTime(c.planned_time, now)}</td>
              <td>
                <ClaimPill status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostDonationForm({ donor, now, perform }) {
  const blank = () => ({ description: '', quantity_kg: '', pickup_from: now, pickup_until: addMinutes(now, 120) });
  const [form, setForm] = useState(blank);
  const [refusal, setRefusal] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const hasError = (field) => refusal?.reasons.some((r) => r.field === field);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const outcome = await perform(
      () =>
        api.postDonation({
          donor_id: donor.id,
          description: form.description,
          // Send exactly what was typed; the server rejects non-whole kg.
          quantity_kg: form.quantity_kg === '' ? null : Number(form.quantity_kg),
          pickup_from: form.pickup_from,
          pickup_until: form.pickup_until,
        }),
      { success: `Posted ${form.quantity_kg} kg of ${form.description}`, inline: true },
    );
    setBusy(false);
    if (outcome.ok) {
      setForm(blank());
      setRefusal(null);
    } else {
      setRefusal(outcome);
    }
  }

  return (
    <form className="panel post-form" onSubmit={submit} noValidate>
      <p className="eyebrow">New listing</p>
      <h2 className="panel__title">Post surplus food</h2>

      <label className={`field ${hasError('description') ? 'has-error' : ''}`}>
        <span>What is it?</span>
        <input value={form.description} onChange={update('description')} placeholder="e.g. Veg biryani, 6 trays" />
      </label>

      <label className={`field ${hasError('quantity_kg') ? 'has-error' : ''}`}>
        <span>Quantity</span>
        <div className="input-suffix">
          <input type="number" min="1" step="1" inputMode="numeric" value={form.quantity_kg} onChange={update('quantity_kg')} placeholder="0" />
          <em>kg</em>
        </div>
      </label>

      <div className="field-row">
        <label className={`field ${hasError('pickup_from') ? 'has-error' : ''}`}>
          <span>Pickup from</span>
          <input type="datetime-local" value={form.pickup_from} onChange={update('pickup_from')} />
        </label>
        <label className={`field ${hasError('pickup_until') ? 'has-error' : ''}`}>
          <span>Pickup until</span>
          <input type="datetime-local" value={form.pickup_until} onChange={update('pickup_until')} />
        </label>
      </div>

      {refusal && (
        <div className="refusal">
          <strong>{refusal.title}</strong>
          <ReasonList reasons={refusal.reasons} />
        </div>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Posting…' : 'Post donation'}
      </button>
    </form>
  );
}
