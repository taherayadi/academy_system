import { describe, expect, it } from 'vitest';
import {
  buildFormationDateOptions,
  formatFormationDate,
  groupFormationSeances,
  seancesConflict
} from './formationSchedule';

// La grille des formations est DATÉE : elle part du jour + de la date de début
// de la formation, et un conflit de salle/élève n'existe qu'à la même date.

describe('buildFormationDateOptions', () => {
  it('starts exactly on the formation start day/date (mercredi 21/10/2026)', () => {
    const options = buildFormationDateOptions('2026-10-21', '2026-10-30');
    expect(options[0]).toEqual({
      date: '2026-10-21',
      day: 'الأربعاء',
      label: 'الأربعاء 21/10/2026'
    });
    expect(options[options.length - 1]).toEqual({
      date: '2026-10-30',
      day: 'الجمعة',
      label: 'الجمعة 30/10/2026'
    });
    expect(options).toHaveLength(10);
  });

  it('covers every calendar date of the period (including Sunday)', () => {
    const options = buildFormationDateOptions('2026-10-21', '2026-10-30');
    expect(options.map(o => o.date)).toContain('2026-10-25');
    expect(options.find(o => o.date === '2026-10-25')?.day).toBe('الأحد');
  });

  it('handles a one-day formation and invalid input', () => {
    expect(buildFormationDateOptions('2026-10-21', '2026-10-21').map(o => o.date))
      .toEqual(['2026-10-21']);
    expect(buildFormationDateOptions('', '2026-10-30')).toEqual([]);
    expect(buildFormationDateOptions('2026-13-99', '2026-10-30')).toEqual([]);
  });
});

describe('formatFormationDate', () => {
  it('renders dd/mm/yyyy without timezone drift', () => {
    expect(formatFormationDate('2026-10-21')).toBe('21/10/2026');
    expect(formatFormationDate('')).toBe('');
  });
});

describe('seancesConflict', () => {
  const base = {
    date: '2026-10-21',
    day: 'الأربعاء',
    startTime: '09:00',
    endTime: '10:30'
  };

  it('detects an overlap on the SAME real date', () => {
    expect(seancesConflict(base, { ...base, startTime: '10:00', endTime: '11:00' })).toBe(true);
  });

  it('does NOT conflict for the same weekday on another date', () => {
    expect(seancesConflict(base, { ...base, date: '2026-10-28' })).toBe(false);
  });

  it('does NOT conflict when times do not overlap', () => {
    expect(seancesConflict(base, { ...base, startTime: '10:30', endTime: '12:00' })).toBe(false);
  });

  it('falls back to weekday + formation period for legacy undated rows', () => {
    const legacy = { day: 'الأربعاء', startTime: '09:00', endTime: '10:30' };
    expect(seancesConflict(legacy, legacy, 
      { startDate: '2026-10-21', endDate: '2026-10-30' },
      { startDate: '2026-10-25', endDate: '2026-11-05' }
    )).toBe(true);
    expect(seancesConflict(legacy, legacy,
      { startDate: '2026-10-21', endDate: '2026-10-24' },
      { startDate: '2026-11-01', endDate: '2026-11-10' }
    )).toBe(false);
  });
});

describe('groupFormationSeances', () => {
  it('groups by date, sorts chronologically and keeps undated rows last', () => {
    const groups = groupFormationSeances([
      { id: 'b', date: '2026-10-22', day: 'الخميس', startTime: '11:00', endTime: '12:00' },
      { id: 'a', date: '2026-10-21', day: 'الأربعاء', startTime: '09:00', endTime: '10:30' },
      { id: 'c', date: '2026-10-21', day: 'الأربعاء', startTime: '14:00', endTime: '15:30' },
      { id: 'legacy', day: 'الأثنين', startTime: '09:00', endTime: '10:00' }
    ]);

    expect(groups.map(g => g.date)).toEqual(['2026-10-21', '2026-10-22', undefined]);
    expect(groups[0].label).toBe('الأربعاء — 21/10/2026');
    expect(groups[0].seances.map(s => s.id)).toEqual(['a', 'c']);
    expect(groups[2].label).toBe('الأثنين');
  });
});
