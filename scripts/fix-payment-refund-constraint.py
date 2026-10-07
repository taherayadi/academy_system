#!/usr/bin/env python3
# ⚠️ APRÈS ce script, exécutez aussi scripts/fix-dangling-payment-fks.py :
# le rename payments→payments_old laisse les FKs de meal_attendances,
# course_session_attendance et revision_seance_students pointées vers payments_old
# (table ensuite droppée) → « no such table: main.payments_old » sur toute écriture
# (cause du 500 « تعذر تعديل بيانات التلميذ »). Corrigé en local le 2026-10-07.
"""
Supprime la CHECK stricte « is_refund = 0 OR refund_of IS NOT NULL » de la table
payments — uniquement dans la base LOCALE (.wrangler/state/v3/d1/…270b59ee….sqlite).

Pourquoi : les remboursements par mois du client (استرجاع شهر نوفمبر…) n'ont
aucun refund_of (ils annulent un « mois » payé, pas un paiement précis). La
CHECK rendait tout remboursement sans paiement source impossible → HTTP 500
sur POST /api/payments.

Méthode : ALTER TABLE n'accepte pas DROP CONSTRAINT sous SQLite, donc
reconstruction de la table (normal) :
  1. sauvegarde .bak horodatée
  2. création payments_new SANS la CHECK (DDL identique au reste)
  3. copie des lignes + DROP TABLE payments + RENAME
  4. recréation des index/UNIQUE via le DDL lui-même
Refus si : la CHECK est déjà absente (re-run inutile), une sauvegarde récente
existe, ou une ligne d'autres tables référence payments (ON DELETE RESTRICT —
rien à perdre : on opère hors transaction avec backup).

Àard : la base PRODUCTION doit recevoir la même modification via l'admin
D1 (voir migration/0001_initial_schema.sql mis à jour en conséquence).
"""
import os
import shutil
import sqlite3
import sys
import time

BASE = os.path.join('.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
TARGET = os.path.join(
    BASE, '270b59ee46090716d36d187ff3d6e08d155a80aecf20462864f4690016fb5a38.sqlite')

STAMP = time.strftime('%Y%m%d-%H%M%S')

NEW_DDL = """CREATE TABLE payments (
  id                 TEXT PRIMARY KEY,
  center_id          TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id         TEXT NOT NULL,
  date               TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  service_key        TEXT NOT NULL REFERENCES services(key),
  billing_period     TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
  period_month       TEXT CHECK (period_month IS NULL OR period_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  school_year        TEXT NOT NULL CHECK (school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  payment_type       TEXT NOT NULL CHECK (payment_type IN ('full','partial','balance','advance')),
  method             TEXT NOT NULL CHECK (method IN ('cash','cheque','transfer','card')),
  amount             REAL NOT NULL CHECK (amount > 0),
  total_required     REAL NOT NULL CHECK (total_required >= 0),
  discount           REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  receipt_number     TEXT NOT NULL,
  notes              TEXT,
  cheque_number      TEXT,
  cheque_date        TEXT,
  cheque_paid        INTEGER NOT NULL DEFAULT 0 CHECK (cheque_paid IN (0,1)),
  is_refund          INTEGER NOT NULL DEFAULT 0 CHECK (is_refund IN (0,1)),
  refund_of          TEXT,
  ref_type           TEXT CHECK (ref_type IS NULL OR ref_type IN ('external_course','revision_seance','formation','event')),
  ref_id             TEXT,
  created_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         INTEGER NOT NULL,
  UNIQUE (center_id, id),
  UNIQUE (center_id, receipt_number),
  CHECK (billing_period <> 'month' OR period_month IS NOT NULL),
  CHECK (method = 'cheque' OR (cheque_number IS NULL AND cheque_date IS NULL AND cheque_paid = 0)),
  CHECK ((ref_type IS NULL) = (ref_id IS NULL)),
  FOREIGN KEY (center_id, student_id) REFERENCES students(center_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (center_id, refund_of)  REFERENCES payments(center_id, id) ON DELETE RESTRICT
) STRICT"""


def main() -> None:
    if not os.path.exists(TARGET):
        sys.exit(f'Base introuvable : {TARGET}')

    conn = sqlite3.connect(TARGET)
    ddl = conn.execute("SELECT sql FROM sqlite_master WHERE name='payments'").fetchone()[0]
    if 'is_refund = 0 OR refund_of' not in ddl:
        print('[fix] La CHECK refund_of est déjà absente — rien à faire.')
        conn.close()
        return
    for f in os.listdir(BASE):
        if f.startswith('270b59ee') and '.bak-' in f:
            print(f'[fix] AVERTISSEMENT : sauvegarde existante ({f}) — re-run toléré.')
            break

    rows = conn.execute('SELECT COUNT(*) FROM payments').fetchone()[0]
    backup = TARGET + f'.bak-{STAMP}'
    shutil.copy2(TARGET, backup)
    print(f'[fix] sauvegarde : {backup} ({rows} paiements)')

    conn.execute('PRAGMA foreign_keys = OFF')
    conn.execute('BEGIN')
    conn.execute('ALTER TABLE payments RENAME TO payments_old')
    conn.execute(NEW_DDL.replace('CREATE TABLE payments (', 'CREATE TABLE payments_new (', 1))
    conn.execute(
        'INSERT INTO payments_new SELECT * FROM payments_old'
    )
    conn.execute('DROP TABLE payments_old')
    conn.execute('ALTER TABLE payments_new RENAME TO payments')
    conn.commit()

    new_ddl = conn.execute("SELECT sql FROM sqlite_master WHERE name='payments'").fetchone()[0]
    new_rows = conn.execute('SELECT COUNT(*) FROM payments').fetchone()[0]
    conn.close()

    assert 'is_refund = 0 OR refund_of' not in new_ddl, 'la CHECK est toujours là !'
    assert new_rows == rows, f'lignes perdues : {rows} → {new_rows}'
    print(f'[fix] OK — CHECK supprimée, {new_rows}/{rows} paiements préservés.')


if __name__ == '__main__':
    main()
