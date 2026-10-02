-- EduSphère — DB-driven module catalog: behavior flags + eligibility seed.
-- Apply to the REMOTE database with:
--   npx wrangler d1 execute edusphere --remote --file=scripts/seed-module-catalog.sql
-- Safe to re-run (IF NOT EXISTS / idempotent UPDATEs).

-- 1. Behavior flag columns (skip when already applied by checking sqlite_master).
-- D1 executes statements one by one; wrap ALTERs so an existing column never aborts the file.
ALTER TABLE modules ADD COLUMN isUnbilled INTEGER NOT NULL DEFAULT 0 CHECK (isUnbilled IN (0,1));
ALTER TABLE modules ADD COLUMN isHidden INTEGER NOT NULL DEFAULT 0 CHECK (isHidden IN (0,1));

-- 2. Behavior flags (match the legacy UNBILLED_MODULE_KEYS / hidden catalog).
UPDATE modules SET isBasic    = 1 WHERE key IN ('scolaire', 'finance', 'studentTimeSheets');
UPDATE modules SET isUnbilled = 1 WHERE key IN ('studentTimeSheets', 'bibliotheque');
UPDATE modules SET isHidden   = 1 WHERE key = 'bibliotheque';

-- 2b. Arabic UI labels + center-type hints (the dashboard renders from the DB).
--     The French `label` stays the canonical display name for center-operational screens.
ALTER TABLE modules ADD COLUMN label_ar TEXT NOT NULL DEFAULT '';
ALTER TABLE center_types ADD COLUMN label_ar TEXT NOT NULL DEFAULT '';
ALTER TABLE center_types ADD COLUMN hint TEXT NOT NULL DEFAULT '';

UPDATE modules SET label_ar = CASE key
  WHEN 'scolaire' THEN 'مدرسي'
  WHEN 'finance' THEN 'مالية'
  WHEN 'etude' THEN 'مراجعة مشرفة'
  WHEN 'coursParticuliers' THEN 'دروس خاصة'
  WHEN 'revision' THEN 'مراجعة الامتحانات'
  WHEN 'formations' THEN 'دورات'
  WHEN 'cantine' THEN 'مقصف / وجبات'
  WHEN 'transport' THEN 'نقل'
  WHEN 'events' THEN 'مناسبات'
  WHEN 'bibliotheque' THEN 'مكتبة'
  WHEN 'studentTimeSheets' THEN 'سجل الدوام'
  WHEN 'staff' THEN 'الموظفون'
  WHEN 'activites' THEN 'أنشطة وبرنامج'
  WHEN 'competences' THEN 'مهارات ومستويات'
  ELSE label_ar END;

UPDATE center_types SET label_ar = CASE key
  WHEN 'creche' THEN 'حضانة'
  WHEN 'jardin' THEN 'روضة أطفال'
  WHEN 'garderie' THEN 'دار الرعاية'
  WHEN 'formation' THEN 'مركز تدريب'
  WHEN 'other' THEN 'أخرى'
  ELSE label_ar END;

UPDATE center_types SET hint = CASE key
  WHEN 'creche' THEN 'الرضّع · ما قبل الروضة'
  WHEN 'jardin' THEN 'ما قبل المدرسي · الروضات'
  WHEN 'garderie' THEN 'حضانة نهارية · رعاية بعد الدرس'
  WHEN 'formation' THEN 'دعم · دروس · دورات'
  ELSE hint END;

-- 3. Eligibility matrix (mirrors the former MODULE_CENTER_TYPES):
--    school-support modules excluded from creche/jardin; everything else universal.
INSERT OR IGNORE INTO center_type_modules (center_type, module_key)
SELECT 'creche', m.key FROM modules m
 WHERE m.key NOT IN ('bibliotheque', 'etude', 'coursParticuliers', 'revision', 'formations');

INSERT OR IGNORE INTO center_type_modules (center_type, module_key)
SELECT 'jardin', m.key FROM modules m
 WHERE m.key NOT IN ('bibliotheque', 'etude', 'coursParticuliers', 'revision', 'formations');

INSERT OR IGNORE INTO center_type_modules (center_type, module_key)
SELECT 'garderie', m.key FROM modules m WHERE m.key NOT IN ('bibliotheque');

INSERT OR IGNORE INTO center_type_modules (center_type, module_key)
SELECT 'formation', m.key FROM modules m WHERE m.key NOT IN ('bibliotheque');
