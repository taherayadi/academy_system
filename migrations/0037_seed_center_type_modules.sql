-- Seed the full center_type_modules eligibility matrix.
-- Uses INSERT OR IGNORE so this is safe to re-run and safe against the one
-- existing row (garderie → scolaire) already present in the cloud DB.
--
-- Eligibility logic (mirrors the removed static fallback):
--   creche / jardin  : universal modules only (no school-support)
--   garderie         : universal + school-support
--   formation        : universal + school-support
--
-- Universal modules: activites, cantine, competences, events, staff, transport
--   (scolaire, finance, studentTimeSheets are isBasic — included automatically,
--    but listed here too so the table is the complete source of truth)
-- School-support:    coursParticuliers, etude, formations, revision

-- ── creche ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'scolaire');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'finance');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'studentTimeSheets');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'activites');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'cantine');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'competences');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'events');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'staff');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('creche', 'transport');

-- ── jardin ──────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'scolaire');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'finance');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'studentTimeSheets');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'activites');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'cantine');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'competences');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'events');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'staff');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('jardin', 'transport');

-- ── garderie ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'scolaire');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'finance');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'studentTimeSheets');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'activites');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'cantine');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'competences');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'events');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'staff');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'transport');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'coursParticuliers');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'etude');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'formations');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('garderie', 'revision');

-- ── formation ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'scolaire');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'finance');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'studentTimeSheets');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'activites');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'cantine');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'competences');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'events');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'staff');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'transport');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'coursParticuliers');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'etude');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'formations');
INSERT OR IGNORE INTO center_type_modules (center_type, module_key) VALUES ('formation', 'revision');
