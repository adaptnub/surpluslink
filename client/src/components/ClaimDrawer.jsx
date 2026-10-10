// The "Reserve" side panel. As you change kg or time it asks the server
// (POST /api/claims/check, a dry run) which of the 7 rules would fail, and shows
// them live. Submitting still goes through the real, locked check on the server.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { addMinutes, hhmm, isBefore, shortTime } from '../time.js';
import { PickupWindow, ReasonList, ZoneTag } from './bits.jsx';

const RULES = [
  [1, 'Donation is still available', 'Not cancelled or expired'],
  [2, 'Fits in your vehicle', 'kg is at most your capacity'],
  [3, 'Enough food left', 'kg is at most what remains'],
  [4, 'Inside your zones', "Donation is in a zone you cover"],
  [5, 'Within the pickup window', 'Start and end both count'],
  [6, 'Not in the past', 'Planned time is now or later'],
  [7, 'Clear of your other pickups', 'At least 60 minutes apart'],
];

/** Quick time choices every 30 minutes inside the window, skipping the past. */
function timeSlots(donation, now) {
  const slots = [];
  for (let t = donation.pickup_from; !isBefore(donation.pickup_until, t) && slots.length < 8; t = addMinutes(t, 30)) {
    if (!isBefore(t, now)) slots.push(t);
  }
  return slots;
}

export default function ClaimDrawer({ donation, volunteer, now, perform, onClose }) {
  const maxKg = Math.max(1, Math.min(volunteer.capacity_kg, donation.remaining_kg));
  const [kg, setKg] = useState(String(maxKg));
  const [time, setTime] = useState(isBefore(now, donation.pickup_from) ? donation.pickup_from : now);
  const [check, setCheck] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [busy, setBusy] = useState(false);

  const claim = {
    volunteer_id: volunteer.id,
    donation_id: donation.id,
    kg: kg === '' ? null : Number(kg),
    planned_time: time,
  };

  // Live dry run, slightly delayed so we don't call the server on every keystroke.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const result = await api.checkClaim(claim);
        if (current) setCheck(result);
      } catch {
        // the submit button still reports errors properly
      }
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kg, time, now, donation.remaining_kg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const outcome = await perform(() => api.createClaim(claim), {
      success: `Reserved ${kg} kg of ${donation.description} for ${hhmm(time)}`,
      inline: true,
    });
    setBusy(false);
    if (outcome.ok) onClose();
    else setRefusal(outcome);
  }

  const failed = new Map((check?.violations ?? []).map((v) => [v.rule, v.message]));
  const step = (delta) => setKg(String(Math.max(1, (Number(kg) || 0) + delta)));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="claim-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <div>
            <p className="eyebrow">
              Reserve pickup · {donation.id} <ZoneTag zone={donation.zone} />
            </p>
            <h2 id="claim-title" className="display display--sm">
              {donation.description}
            </h2>
            <p className="muted">
              from {donation.donor_name} · <strong>{donation.remaining_kg} kg</strong> left of {donation.quantity_kg}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <PickupWindow from={donation.pickup_from} until={donation.pickup_until} now={now} />

        <form onSubmit={submit} className="drawer__form" noValidate>
          <div className="field">
            <span>How many kg?</span>
            <div className="stepper">
              <button type="button" onClick={() => step(-1)} aria-label="One kg less">
                −
              </button>
              <input type="number" min="1" step="1" inputMode="numeric" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="Kilograms" />
              <button type="button" onClick={() => step(1)} aria-label="One kg more">
                +
              </button>
              <button type="button" className="link-btn" onClick={() => setKg(String(maxKg))}>
                Max {maxKg} kg
              </button>
            </div>
          </div>

          <div className="field">
            <span>Planned pickup time</span>
            <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
            <div className="slots">
              {timeSlots(donation, now).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={`slot ${slot === time ? 'is-picked' : ''}`}
                  onClick={() => setTime(slot)}
                >
                  {shortTime(slot, now)}
                </button>
              ))}
            </div>
          </div>

          <div className="rules">
            <p className="rules__title">
              Rule check
              <span className={`rules__score ${check?.ok ? 'is-ok' : ''}`}>
                {check ? (check.problems.length ? 'fix input' : `${7 - failed.size}/7 pass`) : '…'}
              </span>
            </p>
            {check?.problems.length > 0 ? (
              <ReasonList reasons={check.problems} />
            ) : (
              <ol className="rules__list">
                {RULES.map(([n, title, detail]) => {
                  const message = failed.get(n);
                  return (
                    <li key={n} className={check ? (message ? 'is-fail' : 'is-pass') : ''}>
                      <span className="rules__mark" aria-hidden="true">
                        {check ? (message ? '✕' : '✓') : n}
                      </span>
                      <span>
                        <strong>{title}</strong>
                        <small>{message ?? detail}</small>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {refusal && (
            <div className="refusal">
              <strong>
                {refusal.title} · {refusal.reasons.length} reason{refusal.reasons.length === 1 ? '' : 's'}
              </strong>
              <ReasonList reasons={refusal.reasons} />
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
            {busy ? 'Reserving…' : `Reserve ${kg || 0} kg${time ? ` for ${shortTime(time, now)}` : ''}`}
          </button>
          {time && <p className="drawer__fine">You can cancel until {shortTime(time, now)}.</p>}
        </form>
      </aside>
    </div>
  );
}
