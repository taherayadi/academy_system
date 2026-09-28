import { describe, it, expect } from 'vitest';
import { TIME_BANDS, bandIndexFor, bandStartTime, CATEGORY_COLORS, validateActivity, groupActivities } from './planner';
import { Activity } from '../types';

const validBase: Partial<Activity> = {
  title: 'Atelier',
  category: 'art',
  weekday: 2,
  timeStart: '10:00',
  timeEnd: '11:00'
};

describe('TIME_BANDS', () => {
  it('covers 08:00–20:00 in 24 half-hour bands (remark 3: the grid starts at 08:00)', () => {
    expect(TIME_BANDS.length).toBe(24);
    expect(TIME_BANDS[0].start).toBe('08:00');
    expect(TIME_BANDS[0].end).toBe('08:30');
    expect(TIME_BANDS[23].start).toBe('19:30');
    expect(TIME_BANDS[23].end).toBe('20:00');
  });

  it('contains no 06:00–07:30 bands', () => {
    const starts = TIME_BANDS.map(b => b.start);
    for (const gone of ['06:00', '06:30', '07:00', '07:30']) {
      expect(starts, gone).not.toContain(gone);
    }
  });
});

describe('bandIndexFor', () => {
  it('maps edge times to the first and last bands', () => {
    expect(bandIndexFor('08:00')).toBe(0);
    expect(bandIndexFor('08:29')).toBe(0);
    expect(bandIndexFor('19:30')).toBe(23);
    expect(bandIndexFor('19:59')).toBe(23);
  });

  it('snaps minute offsets into the containing band', () => {
    expect(bandIndexFor('10:00')).toBe(4);  // 08:00 + 2h
    expect(bandIndexFor('10:15')).toBe(4);  // minutes ignored
    expect(bandIndexFor('10:29')).toBe(4);
    expect(bandIndexFor('10:30')).toBe(5);  // next band boundary
  });

  it('clamps out-of-range times into the grid (pre-08:00 → first band)', () => {
    expect(bandIndexFor('06:00')).toBe(0);  // stored pre-08:00 activity clamps, no data loss
    expect(bandIndexFor('07:15')).toBe(0);
    expect(bandIndexFor('00:00')).toBe(0);
    expect(bandIndexFor('20:00')).toBe(23);
    expect(bandIndexFor('23:45')).toBe(23);
    expect(bandIndexFor('')).toBe(0);
  });

  it('snaps a moved chip back to a band start time', () => {
    expect(bandStartTime(4)).toBe('10:00');
    expect(bandStartTime(23)).toBe('19:30');
  });
});

describe('CATEGORY_COLORS', () => {
  it('assigns the fixed palette per category', () => {
    expect(CATEGORY_COLORS.motricite).toBe('bg-emerald');
    expect(CATEGORY_COLORS.art).toBe('bg-violet');
    expect(CATEGORY_COLORS.musique).toBe('bg-amber');
    expect(CATEGORY_COLORS.jeu).toBe('bg-sky');
  });
});

describe('validateActivity', () => {
  it('accepts a well-formed weekly activity', () => {
    expect(validateActivity(validBase)).toBe(true);
  });

  it('accepts a date-mode activity (XOR: date present, weekday ignored)', () => {
    expect(validateActivity({ ...validBase, date: '2026-10-15', weekday: 9 })).toBe(true);
  });

  it('rejects an empty or whitespace title', () => {
    expect(validateActivity({ ...validBase, title: '' })).toBe(false);
    expect(validateActivity({ ...validBase, title: '   ' })).toBe(false);
    expect(validateActivity({ ...validBase, title: undefined })).toBe(false);
  });

  it('rejects a category outside the enum', () => {
    expect(validateActivity({ ...validBase, category: 'sport' as any })).toBe(false);
    expect(validateActivity({ ...validBase, category: undefined })).toBe(false);
  });

  it('rejects missing or out-of-range weekday in weekly mode', () => {
    expect(validateActivity({ ...validBase, weekday: undefined })).toBe(false);
    expect(validateActivity({ ...validBase, weekday: 7 })).toBe(false);
    expect(validateActivity({ ...validBase, weekday: -1 })).toBe(false);
  });

  it('rejects a malformed date string in date mode', () => {
    expect(validateActivity({ ...validBase, date: '15/10/2026' })).toBe(false);
  });

  it('rejects timeEnd <= timeStart and malformed times', () => {
    expect(validateActivity({ ...validBase, timeEnd: '10:00' })).toBe(false);
    expect(validateActivity({ ...validBase, timeEnd: '09:59' })).toBe(false);
    expect(validateActivity({ ...validBase, timeStart: '25:00' })).toBe(false);
    expect(validateActivity({ ...validBase, timeStart: 'abc' })).toBe(false);
    expect(validateActivity({ ...validBase, timeEnd: undefined })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateActivity(null as any)).toBe(false);
    expect(validateActivity(undefined as any)).toBe(false);
  });
});

describe('groupActivities', () => {
  const mk = (id: string, levelClass?: string, location?: string): Activity => ({
    id, title: id, category: 'jeu', weekday: 1, timeStart: '09:00', timeEnd: '10:00', levelClass, location
  });

  it('buckets alphabetically with the unassigned group last', () => {
    const list = [mk('a', 'Zebra'), mk('b'), mk('c', 'Alpha')];
    const groups = groupActivities(list, 'class');
    expect(groups.map(g => g.key)).toEqual(['Alpha', 'Zebra', 'بدون تصنيف']);
    expect(groups[2].items.map(i => i.id)).toEqual(['b']);
  });

  it('groups by location when requested', () => {
    const list = [mk('a', 'PS', 'Salle B'), mk('b', 'PS', 'Salle A')];
    const groups = groupActivities(list, 'location');
    expect(groups.map(g => g.key)).toEqual(['Salle A', 'Salle B']);
  });

  it('never emits empty groups and never mutates the input', () => {
    const list = [mk('a', 'PS'), mk('b')];
    const snapshot = [...list];
    const groups = groupActivities(list, 'class');
    expect(groups.every(g => g.items.length > 0)).toBe(true);
    expect(list).toEqual(snapshot);
  });

  it('treats whitespace-only keys as unassigned', () => {
    const groups = groupActivities([mk('a', '   ')], 'class');
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe('بدون تصنيف');
  });
});
