import { Formation, Salle } from '../types';

// Statistiques de gestion des salles — calculées à partir des grilles horaires
// des formations. Aucune donnée n'est stockée : tout est dérivé des séances
// qui référencent une salle (`FormationSeance.salle`).

export interface SalleUsageStat {
  salle: Salle;
  sessions: number;
  students: number; // élèves uniques (toutes séances de la salle)
}

export interface EquipmentStat {
  name: string;
  count: number;
}

export interface SalleAnalytics {
  totalCapacity: number;
  averageCapacity: number;
  totalSessions: number;
  usedSalles: number;
  utilizationRate: number; // 0 → 100
  maxCapacity: number;     // au moins 1 (pour les barres)
  maxSessions: number;     // au moins 1 (pour les barres)
  usage: SalleUsageStat[];
  topSalles: SalleUsageStat[]; // séances décroissantes, salles utilisées uniquement
  equipment: EquipmentStat[];  // toutes les étiquettes, décroissantes
  totalEquipmentAssignments: number;
}

export function computeSalleAnalytics(
  salles: Salle[] | undefined | null,
  formations: Formation[] | undefined | null,
  topLimit: number = 3
): SalleAnalytics {
  const list = Array.isArray(salles) ? salles : [];
  const rows = new Map<string, { salle: Salle; sessions: number; studentIds: Set<string> }>();

  list.forEach(salle => {
    rows.set(salle.id, { salle, sessions: 0, studentIds: new Set<string>() });
  });

  (Array.isArray(formations) ? formations : []).forEach(formation => {
    (Array.isArray(formation.schedule) ? formation.schedule : []).forEach(seance => {
      if (!seance.salle) return;
      const row = rows.get(seance.salle);
      if (!row) return; // séance pointant vers une salle supprimée
      row.sessions += 1;
      (Array.isArray(seance.students) ? seance.students : []).forEach(studentId => {
        if (studentId) row.studentIds.add(studentId);
      });
    });
  });

  const usage: SalleUsageStat[] = list.map(salle => {
    const row = rows.get(salle.id)!;
    return { salle, sessions: row.sessions, students: row.studentIds.size };
  });

  const totalCapacity = usage.reduce((sum, row) => sum + Math.max(0, Number(row.salle.capacity) || 0), 0);
  const totalSessions = usage.reduce((sum, row) => sum + row.sessions, 0);
  const usedSalles = usage.filter(row => row.sessions > 0).length;

  const equipmentCounts = new Map<string, number>();
  list.forEach(salle => {
    (Array.isArray(salle.equipment) ? salle.equipment : []).forEach(item => {
      const name = String(item || '').trim();
      if (!name) return;
      equipmentCounts.set(name, (equipmentCounts.get(name) || 0) + 1);
    });
  });
  const equipment = [...equipmentCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const topSalles = usage
    .filter(row => row.sessions > 0)
    .slice()
    .sort((a, b) => b.sessions - a.sessions || b.students - a.students || a.salle.name.localeCompare(b.salle.name))
    .slice(0, Math.max(0, topLimit));

  return {
    totalCapacity,
    averageCapacity: list.length ? Math.round(totalCapacity / list.length) : 0,
    totalSessions,
    usedSalles,
    utilizationRate: list.length ? Math.round((usedSalles / list.length) * 100) : 0,
    maxCapacity: Math.max(1, ...usage.map(row => Math.max(0, Number(row.salle.capacity) || 0))),
    maxSessions: Math.max(1, ...usage.map(row => row.sessions)),
    usage,
    topSalles,
    equipment,
    totalEquipmentAssignments: equipment.reduce((sum, row) => sum + row.count, 0)
  };
}
