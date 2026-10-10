// Top bar with the brand and the simulated clock. The clock can only move
// forward; the server enforces that, the UI just offers handy jumps.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { addMinutes, dayLabel, hhmm } from '../time.js';
import { Logo } from './bits.jsx';

const JUMPS = [
  [15, '+15m'],
  [60, '+1h'],
  [180, '+3h'],
];

export default function Header({ now, perform }) {
  const [target, setTarget] = useState(now);
  useEffect(() => setTarget(now), [now]);

  const moveTo = (time) => perform(() => api.setClock(time), { success: `Clock moved to ${dayLabel(time)}, ${hhmm(time)}` });
  const [hours, minutes] = hhmm(now).split(':');

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <strong>SurplusLink</strong>
          <span>Food rescue dispatch</span>
        </div>
      </div>

      <div className="clock">
        <div className="clock__face" aria-label={`Simulated time ${now}`}>
          <span className="clock__label">Simulated clock · {dayLabel(now)}</span>
          <span className="clock__digits">
            <b>{hours[0]}</b>
            <b>{hours[1]}</b>
            <i>:</i>
            <b>{minutes[0]}</b>
            <b>{minutes[1]}</b>
          </span>
        </div>

        <div className="clock__controls">
          {JUMPS.map(([mins, label]) => (
            <button key={label} type="button" className="jump" onClick={() => moveTo(addMinutes(now, mins))}>
              {label}
            </button>
          ))}
          <form
            className="clock__set"
            onSubmit={(e) => {
              e.preventDefault();
              moveTo(target);
            }}
          >
            <input
              type="datetime-local"
              aria-label="Set the clock to"
              value={target}
              min={now}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
            <button type="submit" className="jump jump--set">
              Set
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
