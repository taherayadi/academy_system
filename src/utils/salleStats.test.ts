import { describe, expect, it } from 'vitest';
import { Formation, Salle } from '../types';
import { computeSalleAnalytics } from './salleStats';

const salles: Salle[] = [
  { id: 'a', name: 'قاعة A', capacity: 20, equipment: ['سبورة', 'تكييف'] },
  { id: 'b', name: 'قاعة B', capacity: 30, equipment: ['سبورة', 'جهاز عرض'] }
];

const formation = {
  id: 'f1',
  name: 'تكوين 1',
  schedule: [
    { id: 's1', date: '2026-10-21', day: 'الأربعاء', startTime: '09:00', endTime: '10:30', matiere: 'رياضيات', salle: 'a', students: ['st1', 'st2'] },
    { id: 's2', date: '2026-10-28', day: 'الأربعاء', startTime: '09:00', endTime: '10:30', matiere: 'رياضيات', salle: 'a', students: ['st1', 'st3'] },
    { id: 's3', date: '2026-10-21', day: 'الأربعاء', startTime: '10:30', endTime: '12:00', matiere: 'فيزياء', salle: 'inconnue', students: ['st1'] }
  ]
} as unknown as Formation;

describe('computeSalleAnalytics', () => {
  it('computes capacity, sessions, unique students and utilization', () => {
    const stats = computeSalleAnalytics(salles, [formation]);

    expect(stats.totalCapacity).toBe(50);
    expect(stats.averageCapacity).toBe(25);
    expect(stats.totalSessions).toBe(2); // la salle inconnue est ignorée
    expect(stats.usedSalles).toBe(1);
    expect(stats.utilizationRate).toBe(50);
    expect(stats.maxCapacity).toBe(30);

    const roomA = stats.usage.find(row => row.salle.id === 'a');
    expect(roomA).toMatchObject({ sessions: 2, students: 3 });
    const roomB = stats.usage.find(row => row.salle.id === 'b');
    expect(roomB).toMatchObject({ sessions: 0, students: 0 });
  });

  it('ranks used rooms and aggregates equipment', () => {
    const stats = computeSalleAnalytics(salles, [formation]);

    expect(stats.topSalles.map(row => row.salle.id)).toEqual(['a']);
    expect(stats.equipment).toEqual([
      { name: 'سبورة', count: 2 },
      { name: 'تكييف', count: 1 },
      { name: 'جهاز عرض', count: 1 }
    ]);
    expect(stats.totalEquipmentAssignments).toBe(4);
  });

  it('returns safe zeros when there is no salle', () => {
    const stats = computeSalleAnalytics([], []);
    expect(stats.totalCapacity).toBe(0);
    expect(stats.averageCapacity).toBe(0);
    expect(stats.totalSessions).toBe(0);
    expect(stats.utilizationRate).toBe(0);
    expect(stats.maxCapacity).toBe(1);
    expect(stats.maxSessions).toBe(1);
    expect(stats.topSalles).toEqual([]);
    expect(stats.equipment).toEqual([]);
  });

  it('ignores negative capacities in totals but keeps the room usable', () => {
    const stats = computeSalleAnalytics(
      [{ id: 'x', name: 'X', capacity: -5, equipment: [] }],
      []
    );
    expect(stats.totalCapacity).toBe(0);
    expect(stats.averageCapacity).toBe(0);
    expect(stats.usage).toHaveLength(1);
  });
});
