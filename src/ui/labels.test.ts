import { describe, expect, it } from 'vitest';
import { longDate, shortDate, shortDayDate } from './labels';

describe('date labels', () => {
  it('formats a date without the ISO string leaking through', () => {
    expect(shortDate('2026-11-05')).toBe('5 Nov');
    expect(shortDayDate('2026-11-05')).toBe('Thu 5 Nov');
    expect(longDate('2026-11-09')).toBe('Monday 9 November');
  });

  it('keeps the calendar day whatever the zone', () => {
    expect(shortDate('2026-01-01')).toBe('1 Jan');
    expect(shortDate('2026-12-31')).toBe('31 Dec');
  });
});
