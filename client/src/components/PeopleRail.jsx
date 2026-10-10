// "Who are you acting as?" There is no login: pick a restaurant, a volunteer,
// or the dashboard.

import { Avatar } from './bits.jsx';

export default function PeopleRail({ state, persona, onPick }) {
  const isActive = (kind, id) => persona.kind === kind && (id === undefined || persona.id === id);

  const person = (kind, id, name, zone, sub) => (
    <button
      key={id}
      type="button"
      className={`rail__item ${isActive(kind, id) ? 'is-active' : ''}`}
      onClick={() => onPick({ kind, id })}
    >
      <Avatar name={name} zone={zone} />
      <span className="rail__text">
        <span className="rail__name">{name}</span>
        <span className="rail__sub">{sub}</span>
      </span>
    </button>
  );

  return (
    <nav className="rail" aria-label="Choose who you are acting as">
      <button
        type="button"
        className={`rail__item rail__item--dash ${isActive('dashboard') ? 'is-active' : ''}`}
        onClick={() => onPick({ kind: 'dashboard' })}
      >
        <span className="rail__glyph" aria-hidden="true">
          ▤
        </span>
        <span className="rail__text">
          <span className="rail__name">Dashboard</span>
          <span className="rail__sub">Saved vs wasted</span>
        </span>
      </button>

      <p className="rail__heading">Act as a restaurant</p>
      {state.donors.map((d) => person('donor', d.id, d.name, d.zone, d.zone))}

      <p className="rail__heading">Act as a volunteer</p>
      {state.volunteers.map((v) => person('volunteer', v.id, v.name, v.zones[0], `${v.capacity_kg} kg · ${v.zones.join(' · ')}`))}
    </nav>
  );
}
