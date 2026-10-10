// Time helpers for the simulated clock.
//
// Every time in SurplusLink is a local "YYYY-MM-DDTHH:MM" string with no time zone.
// The real system clock is never read anywhere in the app. To compare or add
// minutes we turn a string into "minutes since 1970" using UTC arithmetic. That
// is only arithmetic: no time zone is applied, so differences are always exact.

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parts(text) {
  return PATTERN.exec(text).slice(1).map(Number); // [year, month, day, hour, minute]
}

/** True if `text` is a real date-time in the YYYY-MM-DDTHH:MM format. */
export function isValidTime(text) {
  if (typeof text !== 'string' || !PATTERN.test(text)) return false;
  const [y, mo, d, h, mi] = parts(text);
  // Rebuild the date and check nothing rolled over (rejects 2026-02-31 or 25:00).
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi
  );
}

export function toMinutes(text) {
  const [y, mo, d, h, mi] = parts(text);
  return Date.UTC(y, mo - 1, d, h, mi) / 60_000;
}

export function fromMinutes(minutes) {
  return new Date(minutes * 60_000).toISOString().slice(0, 16);
}

export function addMinutes(text, minutes) {
  return fromMinutes(toMinutes(text) + minutes);
}

export const isBefore = (a, b) => toMinutes(a) < toMinutes(b);
export const isAfter = (a, b) => toMinutes(a) > toMinutes(b);
export const minutesBetween = (a, b) => Math.abs(toMinutes(a) - toMinutes(b));

/** True if from <= t <= until (both ends inclusive). */
export const isWithin = (t, from, until) => !isBefore(t, from) && !isAfter(t, until);
