-- ─── Service « transport » ──────────────────────────────────────────────────
-- Le module Transport Scolaire existait déjà (modules.key = 'transport'),
-- mais aucun service facturable ne lui était rattaché : impossible de créer
-- une ligne `student_service_enrollments` ou un tarif `center_service_prices`
-- pour le transport (FK service_key → services.key).
--
-- Idempotent : la ligne n'est insérée que si elle n'existe pas déjà.
-- Catégorie 'other' (hors scolaire / repas / cours), module_key = 'transport'.

INSERT OR IGNORE INTO services (key, category, label_fr, label_ar, module_key)
VALUES ('transport', 'other', 'Transport scolaire', 'النقل المدرسي', 'transport');
