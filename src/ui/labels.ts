/**
 * Date labels for the English UI. Pure helpers (no React, no store) so every screen formats a date the
 * same way. Word labels for ids (cooking methods, origins, rule sources) live in the i18n catalogue.
 */

/** ISO dates carry no zone; noon keeps the calendar day stable in every timezone. */
function atNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** "5 Nov" */
export function shortDate(iso: string): string {
  return atNoon(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Thu 5 Nov" */
export function shortDayDate(iso: string): string {
  return atNoon(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Thursday 5 November" */
export function longDate(iso: string): string {
  return atNoon(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
