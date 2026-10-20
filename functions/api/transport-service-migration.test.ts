import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// Vérifie que la migration 0007 ajoute le service facturable « transport »
// (FK student_service_enrollments.service_key → services.key) sans casser
// une base où la ligne existe déjà.

const MIGRATION = readFileSync(
  new URL('../../migrations/0007_transport_service.sql', import.meta.url),
  'utf8'
);

function database(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE modules (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL
    ) STRICT;
    CREATE TABLE services (
      key TEXT PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('scolaire','meal','course','other')),
      label_fr TEXT NOT NULL,
      label_ar TEXT NOT NULL,
      module_key TEXT REFERENCES modules(key)
    ) STRICT;

    INSERT INTO modules (key, label) VALUES ('transport', 'Transport Scolaire');
    INSERT INTO services (key, category, label_fr, label_ar, module_key)
      VALUES ('suivi', 'scolaire', 'Suivi scolaire', 'المتابعة الدراسية', NULL);
  `);
  return sqlite;
}

describe('migration 0007 — service transport', () => {
  it('insère le service transport rattaché au module transport', () => {
    const sqlite = database();
    sqlite.exec(MIGRATION);

    const row = sqlite.prepare("SELECT * FROM services WHERE key = 'transport'").get() as any;
    expect(row).toMatchObject({
      key: 'transport',
      category: 'other',
      label_fr: 'Transport scolaire',
      label_ar: 'النقل المدرسي',
      module_key: 'transport'
    });
  });

  it('est idempotente', () => {
    const sqlite = database();
    sqlite.exec(MIGRATION);
    const before = sqlite.prepare('SELECT * FROM services ORDER BY key').all();
    sqlite.exec(MIGRATION);
    const after = sqlite.prepare('SELECT * FROM services ORDER BY key').all();
    expect(after).toEqual(before);
  });
});
