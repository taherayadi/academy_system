/**
 * Setup global des tests jsdom : le catalogue applicatif est vide au départ
 * (aucune donnée codée en dur) et se remplit via GET /api/catalog. Chaque
 * test démarre avec l'API mockée sur la graine (miroir des tables D1) et le
 * store préchargé — le chemin de code est identique à la production.
 */
import { afterEach, vi } from 'vitest';
import { __seedCatalogForTests, __resetCatalogForTests } from './src/utils/catalogStore';
import * as api from './src/api';

/** Lignes `center_type_modules` de la base (44 paires, 4 types gatables). */
const DB_CENTER_TYPE_MODULES: Array<{ centerType: string; moduleKey: string }> = [];
for (const t of ['jardin', 'creche', 'garderie', 'formation']) {
  for (const m of ['scolaire', 'studentTimeSheets', 'finance', 'cantine', 'transport', 'events', 'staff', 'activites', 'competences']) {
    DB_CENTER_TYPE_MODULES.push({ centerType: t, moduleKey: m });
  }
}
for (const m of ['coursParticuliers', 'etude', 'formations', 'revision']) {
  DB_CENTER_TYPE_MODULES.push({ centerType: 'garderie', moduleKey: m });
  DB_CENTER_TYPE_MODULES.push({ centerType: 'formation', moduleKey: m });
}

/** Graine = miroir exact des tables `modules` + `center_types` + `center_type_modules`. */
export const CATALOG_SEED = {
  modules: [
    { key: 'scolaire', label: 'Scolaire & Notes', labelAr: 'الدراسة والنقاط', isBasic: true, isUnbilled: false, isHidden: false, icon: 'GraduationCap', description: 'Fiches élèves, notes, moyennes et bulletins par trimestre.', features: [] },
    { key: 'finance', label: 'Finance & Paiements', labelAr: 'المالية والمدفوعات', isBasic: true, isUnbilled: false, isHidden: false, icon: 'DollarSign', description: 'Reçus, encaissements, chèques et statistiques de revenus.', features: [] },
    { key: 'etude', label: 'Étude Surveillée', labelAr: 'الدراسة المراقبة', isBasic: false, isUnbilled: false, isHidden: false, icon: 'BookOpen', description: 'Planning hebdomadaire, présences, horaires.', features: [] },
    { key: 'coursParticuliers', label: 'Cours Particuliers', labelAr: 'دروس خصوصية', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Users', description: 'Cours 1-à-1, tarification, enseignants.', features: [] },
    { key: 'revision', label: 'Révision Examens', labelAr: 'مراجعة الامتحانات', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Award', description: 'Séances de révision, groupes, présences.', features: [] },
    { key: 'formations', label: 'Formations', labelAr: 'التكوينات', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Sparkles', description: 'Ateliers, stages vacances, plannings.', features: [] },
    { key: 'cantine', label: 'Cantine & Repas', labelAr: 'المطعم والوجبات', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Utensils', description: 'Menus hebdomadaires, abonnements, pointage.', features: [] },
    { key: 'transport', label: 'Transport Scolaire', labelAr: 'النقل المدرسي', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Bus', description: 'Circuits, feuilles de route, chauffeurs.', features: [] },
    { key: 'events', label: 'Événements & Sorties', labelAr: 'الفعاليات والخروجات', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Calendar', description: 'Inscriptions, sorties scolaires.', features: [] },
    { key: 'bibliotheque', label: 'Bibliothèque', labelAr: 'المكتبة', isBasic: false, isUnbilled: false, isHidden: true, icon: '', description: '', features: [] },
    { key: 'studentTimeSheets', label: 'Jd. Horaires', labelAr: 'جداول الأوقات', isBasic: true, isUnbilled: true, isHidden: false, icon: 'Clock', description: 'Pointage journalier des entrées/sorties des élèves — offert avec la base.', features: [] },
    { key: 'staff', label: 'Personnel & Salaires', labelAr: 'الطاقم والرواتب', isBasic: false, isUnbilled: false, isHidden: false, icon: 'ShieldCheck', description: 'Équipe, paie, pointages, congés.', features: [] },
    { key: 'activites', label: 'Activités & Planning', labelAr: 'الأنشطة والبرنامج', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Shapes', description: 'Planning hebdomadaire des activités : motricité, art, musique, jeu.', features: [] },
    modulesCompetences(),
  ],
  centerTypes: [
    { key: 'garderie', label: 'Garderie', labelAr: 'حراسة أطفال', hint: 'Garderie périscolaire', hintAr: 'رعاية ما بعد المدرسة' },
    { key: 'creche', label: 'Crèche', labelAr: 'حضانة', hint: 'Petite enfance · 0–3 ans', hintAr: 'الرضّع · ما قبل الروضة' },
    { key: 'jardin', label: "Jardin d'enfants", labelAr: 'روضة أطفال', hint: 'Préscolaire · maternelle', hintAr: 'ما قبل المدرسة · 3-6 سنوات' },
    { key: 'formation', label: 'Centre de formation', labelAr: 'مركز تكوين', hint: 'Soutien · cours · formations', hintAr: 'دورات وتكوين مهني' },
    { key: 'other', label: 'Autre', labelAr: 'أخرى', hint: '', hintAr: '' },
  ],
  centerTypeModules: DB_CENTER_TYPE_MODULES,
};

function modulesCompetences() {
  return { key: 'competences', label: 'Compétences & Skills', labelAr: 'الكفاءات والمهارات', isBasic: false, isUnbilled: false, isHidden: false, icon: 'Brain', description: 'Catalogue de compétences et évaluations par enfant avec rapport imprimable.', features: [] };
}

import { beforeEach } from 'vitest';

// Les composants (LandingPage, RenewalModule) appellent fetchCatalogApi au
// montage : on la mocke pour renvoyer la graine — même chemin que la prod.
// beforeEach (et non un simple spy top-level) : certains tests remplacent le
// mock de '../api' en usine ou appellent vi.restoreAllMocks — on recolle
// la graine avant CHAQUE test et on re-graine le store.
beforeEach(() => {
  const current = (api as any).fetchCatalogApi;
  if (typeof current === 'function' && !vi.isMockFunction(current)) {
    vi.spyOn(api as any, 'fetchCatalogApi').mockResolvedValue(CATALOG_SEED as any);
  } else if (vi.isMockFunction(current)) {
    current.mockReset();
    current.mockResolvedValue(CATALOG_SEED as any);
  }
  // Modules à mock d'usine (RenewalModule.test…) : fetchCatalogApi y est
  // absente — peu importe, le store est déjà grainé ci-dessous et
  // ensureCatalogLoaded ne retente que si le snapshot est vide.
  __seedCatalogForTests(CATALOG_SEED);
});

// Graine immédiate : les fichiers de test qui capturent le catalogue au
// niveau module (pricing.coherence.test…) évaluent leurs consts AVANT le
// premier beforeEach — le snapshot doit être rempli dès l'import.
__seedCatalogForTests(CATALOG_SEED);
