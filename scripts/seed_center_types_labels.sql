-- Seed label_ar and hint for center_types
UPDATE center_types SET label_ar='حضانة',              hint='الرضّع · ما قبل الروضة'         WHERE key='creche';
UPDATE center_types SET label_ar='روضة أطفال',         hint='ما قبل المدرسة · 3-6 سنوات'    WHERE key='jardin';
UPDATE center_types SET label_ar='حراسة أطفال',        hint='رعاية ما بعد المدرسة'           WHERE key='garderie';
UPDATE center_types SET label_ar='مركز تكوين',         hint='دورات وتكوين مهني'              WHERE key='formation';
UPDATE center_types SET label_ar='أخرى',               hint=''                                WHERE key='other';
