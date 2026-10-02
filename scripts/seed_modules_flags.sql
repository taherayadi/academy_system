-- Seed isBasic, isUnbilled, isHidden, label_ar for all modules
UPDATE modules SET isBasic=1, isUnbilled=0, isHidden=0, label_ar='سجل الدراسة'       WHERE key='scolaire';
UPDATE modules SET isBasic=1, isUnbilled=0, isHidden=0, label_ar='المالية'            WHERE key='finance';
UPDATE modules SET isBasic=1, isUnbilled=1, isHidden=0, label_ar='جداول الأوقات'      WHERE key='studentTimeSheets';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='الدراسة'            WHERE key='etude';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='دروس خصوصية'       WHERE key='coursParticuliers';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='المراجعة'           WHERE key='revision';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='التكوينات'          WHERE key='formations';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='المطعم'             WHERE key='cantine';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='النقل'              WHERE key='transport';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='الأنشطة والفعاليات' WHERE key='events';
UPDATE modules SET isBasic=0, isUnbilled=1, isHidden=1, label_ar='المكتبة'            WHERE key='bibliotheque';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='الطاقم'             WHERE key='staff';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='الأنشطة'            WHERE key='activites';
UPDATE modules SET isBasic=0, isUnbilled=0, isHidden=0, label_ar='الكفاءات'           WHERE key='competences';
