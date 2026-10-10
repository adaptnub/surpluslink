// Small presentational pieces shared by several views.

import { useEffect, useState } from 'react';
import { toMinutes, shortTime, relative } from '../time.js';

export function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#F0B13F" />
      <path d="M6 15h20a10 10 0 0 1-20 0z" fill="#16261F" />
      <path d="M12 11.5c0-2.2 2-2.2 2-4.5M18 11.5c0-2.2 2-2.2 2-4.5" stroke="#16261F" strokeWidth="1.9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Avatar({ name, zone }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span className="avatar" data-zone={zone} aria-hidden="true">
      {initials}
    </span>
  );
}

export const ZoneTag = ({ zone }) => (
  <span className="zone" data-zone={zone}>
    {zone}
  </span>
);

export const StatusStamp = ({ status }) => (
  <span className={`stamp stamp--${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>
);

export const ClaimPill = ({ status }) => <span className={`pill pill--${status.toLowerCase()}`}>{status}</span>;

/** Splits a donation's kg into collected / in progress / missed / remaining. */
export function KgBar({ donation }) {
  const kgIn = (status) => donation.claims.filter((c) => c.status === status).reduce((sum, c) => sum + c.kg, 0);
  const leftKind = donation.status === 'EXPIRED' ? 'wasted' : 'left';
  const segments = [
    ['collected', kgIn('COLLECTED')],
    ['active', kgIn('ACTIVE')],
    ['missed', kgIn('MISSED')],
    [leftKind, donation.remaining_kg],
  ].filter(([, kg]) => kg > 0);

  return (
    <div className="kgbar" role="img" aria-label={segments.map(([k, kg]) => `${kg} kg ${k}`).join(', ')}>
      {segments.map(([kind, kg]) => (
        <span key={kind} className={`kgbar__seg kgbar__seg--${kind}`} style={{ flexGrow: kg }} title={`${kg} kg ${kind}`} />
      ))}
    </div>
  );
}

/** A tiny timeline: the pickup window as a bar, with a marker for "now". */
export function PickupWindow({ from, until, now }) {
  const [start, end, current] = [toMinutes(from), toMinutes(until), toMinutes(now)];
  const pad = Math.max(30, (end - start) * 0.4);
  const [low, high] = [start - pad, end + pad];
  const pct = (m) => ((m - low) / (high - low)) * 100;

  const phase =
    current < start ? `opens ${relative(from, now)}` : current <= end ? `closes ${relative(until, now)}` : `closed ${relative(until, now)}`;

  return (
    <div className="window">
      <div className="window__labels">
        <span className="mono">
          {shortTime(from, now)} → {shortTime(until, now)}
        </span>
        <span className={`window__phase ${current >= start && current <= end ? 'is-live' : ''}`}>{phase}</span>
      </div>
      <div className="window__track">
        <span className="window__range" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
        {current >= low && current <= high && <span className="window__now" style={{ left: `${pct(current)}%` }} />}
        {current < low && <span className="window__edge window__edge--left">now ◂</span>}
        {current > high && <span className="window__edge window__edge--right">▸ now</span>}
      </div>
    </div>
  );
}

/** A button that asks "Sure?" on the first click, for actions that cannot be undone. */
export function ConfirmButton({ children, confirmLabel = 'Click to confirm', onConfirm, className = '' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`btn ${armed ? 'btn--danger' : 'btn--ghost'} ${className}`}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

/** Lists reasons as "Rule 3 · Only 4 kg is left…". */
export function ReasonList({ reasons }) {
  return (
    <ul className="reasons">
      {reasons.map((r, i) => (
        <li key={i}>
          {r.rule && <span className="reasons__rule">Rule {r.rule}</span>}
          <span>{r.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProfileHeader({ eyebrow, name, zone, children, stats }) {
  return (
    <section className="profile" data-zone={zone}>
      <div className="profile__id">
        <Avatar name={name} zone={zone} />
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display">{name}</h1>
          <div className="profile__tags">{children}</div>
        </div>
      </div>
      <dl className="profile__stats">
        {stats.map(([label, value, unit]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {value}
              {unit && <small>{unit}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export const SectionTitle = ({ title, count, hint }) => (
  <div className="section-title">
    <h2>
      {title}
      {count !== undefined && <span className="count">{count}</span>}
    </h2>
    {hint && <p>{hint}</p>}
  </div>
);

export const Empty = ({ title, children }) => (
  <div className="empty">
    <strong>{title}</strong>
    <p>{children}</p>
  </div>
);
