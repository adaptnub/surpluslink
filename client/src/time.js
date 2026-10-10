// Formatting helpers for "YYYY-MM-DDTHH:MM" strings. Like the server, the UI
// never reads the real clock: "now" always comes from the API.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const asDate = (t) => new Date(`${t}:00Z`); // read as UTC so no time zone shifts it

export const toMinutes = (t) => asDate(t).getTime() / 60_000;
export const addMinutes = (t, minutes) => new Date((toMinutes(t) + minutes) * 60_000).toISOString().slice(0, 16);
export const isBefore = (a, b) => toMinutes(a) < toMinutes(b);

export const hhmm = (t) => t.slice(11, 16);
export const sameDay = (a, b) => a.slice(0, 10) === b.slice(0, 10);

export function dayLabel(t) {
  const d = asDate(t);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "18:00" if it is on the same day as now, otherwise "Wed 11 Mar 18:00". */
export const shortTime = (t, now) => (sameDay(t, now) ? hhmm(t) : `${dayLabel(t)} ${hhmm(t)}`);

/** "in 2h 30m", "45m ago", or "now". */
export function relative(t, now) {
  const diff = toMinutes(t) - toMinutes(now);
  if (diff === 0) return 'now';
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = abs % 60;
  const text = days ? `${days}d ${hours}h` : hours ? (minutes ? `${hours}h ${minutes}m` : `${hours}h`) : `${minutes}m`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}
