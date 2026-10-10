// One donation drawn as a ticket: details on the left, a tear-off stub on the
// right with the kg left and the action buttons. `footer` is optional extra
// content underneath (the donor view puts the claims table there).

import { KgBar, PickupWindow, StatusStamp, ZoneTag } from './bits.jsx';

export default function DonationTicket({ donation, now, children, footer }) {
  const d = donation;
  return (
    <article className={`ticket is-${d.status.toLowerCase()}`} data-zone={d.zone}>
      <div className="ticket__body">
        <div className="ticket__row">
          <span className="ticket__id">{d.id}</span>
          <ZoneTag zone={d.zone} />
          <StatusStamp status={d.status} />
        </div>
        <h3 className="ticket__title">{d.description}</h3>
        <p className="ticket__donor">
          from <strong>{d.donor_name}</strong>
        </p>
        <PickupWindow from={d.pickup_from} until={d.pickup_until} now={now} />
      </div>

      <div className="ticket__stub">
        <div className="ticket__kg">
          <span className="ticket__kg-num">{d.remaining_kg}</span>
          <span className="ticket__kg-unit">kg left</span>
        </div>
        <span className="ticket__kg-of">of {d.quantity_kg} kg posted</span>
        <KgBar donation={d} />
        {children && <div className="ticket__actions">{children}</div>}
      </div>

      {footer}
    </article>
  );
}
