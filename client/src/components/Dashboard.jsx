// The dashboard. All numbers come from the server (rules.js buildDashboard);
// this view just lays them out as a ledger that must balance.

import { Avatar } from './bits.jsx';

// Same order as the problem statement.
const FIGURES = [
  ['collected', 'Collected', 'kg in collected claims'],
  ['missed', 'Missed', 'kg in missed claims'],
  ['wasted', 'Wasted', 'left on expired donations'],
  ['in_progress', 'In progress', 'kg in active claims'],
  ['still_open', 'Still open', 'left, not yet expired'],
];

export default function Dashboard({ state }) {
  const { totals, balanced, per_donor, per_volunteer } = state.dashboard;
  const parts = FIGURES.reduce((sum, [key]) => sum + totals[key], 0);
  const rescued = totals.listed ? Math.round((totals.collected / totals.listed) * 100) : 0;
  const topDonor = Math.max(1, ...per_donor.map((d) => d.collected_kg));
  const topVolunteer = Math.max(1, ...per_volunteer.map((v) => v.collected_kg));

  return (
    <>
      <section className="ledger">
        <div className="ledger__head">
          <div>
            <p className="eyebrow">Food rescue ledger · cancelled donations excluded</p>
            <h1 className="display">
              {totals.collected} kg <em>rescued</em>
            </h1>
            <p className="lede">
              {rescued}% of the {totals.listed} kg listed has reached people instead of the bin.
            </p>
          </div>
          <div className={`seal ${balanced ? 'seal--ok' : 'seal--bad'}`} role="status">
            <span className="seal__icon">{balanced ? '✓' : '!'}</span>
            <span className="seal__title">{balanced ? 'Books balance' : 'Out of balance'}</span>
            <span className="seal__math">
              {totals.listed} {balanced ? '=' : '≠'} {parts}
            </span>
          </div>
        </div>

        <div className="ledger__bar" aria-hidden="true">
          {FIGURES.map(([key]) =>
            totals[key] > 0 ? <span key={key} className={`fill--${key}`} style={{ flexGrow: totals[key] }} /> : null,
          )}
        </div>

        <div className="equation">
          <div className="figure figure--listed">
            <span className="figure__label">Listed</span>
            <span className="figure__kg">
              {totals.listed}
              <small>kg</small>
            </span>
            <span className="figure__note">total posted</span>
          </div>
          <span className="op">=</span>
          <div className="equation__parts">
            {FIGURES.map(([key, label, note], i) => (
              <div className={`figure figure--${key}`} key={key}>
                {i > 0 && (
                  <span className="figure__plus" aria-hidden="true">
                    +
                  </span>
                )}
                <span className="figure__label">
                  <i className={`dot fill--${key}`} />
                  {label}
                </span>
                <span className="figure__kg">
                  {totals[key]}
                  <small>kg</small>
                </span>
                <span className="figure__note">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <h2 className="panel__title">Collected per restaurant</h2>
          <ul className="bars">
            {[...per_donor]
              .sort((a, b) => b.collected_kg - a.collected_kg)
              .map((d) => (
                <li key={d.id}>
                  <Avatar name={d.name} zone={d.zone} />
                  <span className="bars__name">{d.name}</span>
                  <span className="bars__track">
                    <span className="fill--collected" style={{ width: `${(d.collected_kg / topDonor) * 100}%` }} />
                  </span>
                  <span className="bars__kg">{d.collected_kg} kg</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="panel__title">Volunteers</h2>
          <table className="vol-table">
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Collected</th>
                <th className="num">Missed claims</th>
              </tr>
            </thead>
            <tbody>
              {per_volunteer.map((v) => {
                const person = state.volunteers.find((x) => x.id === v.id);
                return (
                  <tr key={v.id}>
                    <td>
                      <span className="vol-name">
                        <Avatar name={v.name} zone={person?.zones[0]} />
                        {v.name}
                      </span>
                    </td>
                    <td>
                      <span className="bars__track bars__track--inline">
                        <span className="fill--collected" style={{ width: `${(v.collected_kg / topVolunteer) * 100}%` }} />
                      </span>
                      <span className="mono">{v.collected_kg} kg</span>
                    </td>
                    <td className="num">
                      <span className={`miss-count ${v.missed_claims ? 'has-missed' : ''}`}>{v.missed_claims}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
