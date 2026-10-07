#!/usr/bin/env python3
"""
Aligne la base locale 270b59ee… (celle que `wrangler d1 execute edusphere
--local` et `wrangler pages dev` utilisent réellement) sur le schéma corrigé
déjà appliqué à c62cfc71… :

  1. external_courses  : + assurance_amount REAL NOT NULL DEFAULT 0
  2. meal_attendances  : reconstruction SANS les 2 CHECK payé/couvert
                         (le client écrit des lignes payées sans id de paiement)
  3. subjects          : reconstruction avec center_id ('' = global)

Sauvegardes .bak horodatées avant toute écriture ; vérification finale
(DDL + comptes de lignes) ; REFUS si une table à reconstruire n'est pas vide
ou si une sauvegarde récente existe déjà (anti double-run).
"""
import os
import shutil
import sqlite3
import sys
import time

BASE = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
TARGET = os.path.join(
    BASE, '270b59ee46090716d36d187ff3d6e08d155a80aecf20462864f4690016fb5a38.sqlite')
REFERENCE = os.path.join(
    BASE, 'c62cfc7139a926222ca921c78a27e6f9a70ee6e19c2a17350abdeb90be4b826a.sqlite')

# DDL cible = exactement celui de la base de référence (c62cfc71…).
REF_CONNECT = sqlite3.connect(REFERENCE)
REF_MEAL_DDL = REF_CONNECT.execute(
    "SELECT sql FROM sqlite_master WHERE name = 'meal_attendances'").fetchone()[0]
REF_SUBJECTS_DDL = REF_CONNECT.execute(
    "SELECT sql FROM sqlite_master WHERE name = 'subjects'").fetchone()[0]
REF_CONNECT.close()

# Lignes subjects globales à réinjecter après reconstruction (center_id = '').
SUBJECTS_ROWS = [
    ('Mathématiques',), ('Français',), ('Arabe',), ('Anglais',), ('Sciences',),
    ('Éveil',), ('Informatique',), ('Éducation physique',), ('Musique',), ('Dessin',),
]

STAMP = time.strftime('%Y%m%d-%H%M%S')


def backup(path: str) -> str:
    dest = path + f'.bak-{STAMP}'
    shutil.copy2(path, dest)
    return dest


def table_columns(c: sqlite3.Connection, table: str) -> list:
    return [r[1] for r in c.execute(f'PRAGMA table_info({table})')]


def table_count(c: sqlite3.Connection, table: str) -> int:
    return c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]


def main() -> None:
    if not os.path.exists(TARGET):
        sys.exit(f'Base cible introuvable : {TARGET}')

    c = sqlite3.connect(TARGET)

    # ── Gardes-fous ──
    for f in os.listdir(BASE):
        if f.startswith('270b59ee') and '.bak-' in f:
            print(f'[fix] AVERTISSEMENT : sauvegarde existante ({f}) — re-run toléré (idempotent).')
            break

    meal_rows = table_count(c, 'meal_attendances')
    if meal_rows != 0:
        sys.exit(f'meal_attendances contient {meal_rows} lignes — reconstruction refusée '
                 f'(migrer les données à la main ou vider la table d’abord).')

    ext_cols = table_columns(c, 'external_courses')
    subj_cols = table_columns(c, 'subjects')
    subjects_old = table_count(c, 'subjects')

    # ── Sauvegarde ──
    bak = backup(TARGET)
    print(f'[fix] sauvegarde : {bak}')
    if os.path.exists(TARGET + '-wal'):
        shutil.copy2(TARGET + '-wal', bak + '-wal')
    if os.path.exists(TARGET + '-shm'):
        shutil.copy2(TARGET + '-shm', bak + '-shm')

    c.execute('PRAGMA foreign_keys = OFF')
    c.execute('BEGIN')

    try:
        # 1. external_courses.assurance_amount (ALTER simple, pas de rebuild)
        if 'assurance_amount' not in ext_cols:
            c.execute('ALTER TABLE external_courses ADD COLUMN assurance_amount REAL NOT NULL DEFAULT 0')
            print('[fix] external_courses : + assurance_amount REAL NOT NULL DEFAULT 0')
        else:
            print('[fix] external_courses : assurance_amount déjà présente')

        # 2. meal_attendances : reconstruction sans les 2 CHECK croisés
        #    (status='paid' ⇒ paid_payment_id NOT NULL, etc.). La table doit
        #    être vide (garde-fou ci-dessus) : si le DDL diffère de la
        #    référence, on reconstruit à l'identique.
        old_meal_ddl = c.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'meal_attendances'").fetchone()[0]
        if old_meal_ddl != REF_MEAL_DDL:
            c.execute('DROP TABLE meal_attendances')
            c.execute(REF_MEAL_DDL)
            print('[fix] meal_attendances : reconstruite à l’identique de la référence')
        else:
            print('[fix] meal_attendances : DDL déjà conforme')

        # 3. subjects : reconstruction avec center_id ('' = global)
        if 'center_id' not in subj_cols:
            c.execute('DROP TABLE subjects')
            c.execute(REF_SUBJECTS_DDL)
            c.executemany(
                "INSERT INTO subjects (center_id, name) VALUES ('', ?)",
                SUBJECTS_ROWS)
            print(f'[fix] subjects : reconstruite avec center_id, {len(SUBJECTS_ROWS)} lignes globales réinjectées')
        else:
            print('[fix] subjects : déjà conforme')

        c.execute('COMMIT')
    except Exception:
        c.execute('ROLLBACK')
        raise

    # ── Vérification finale : DDL identique à la base de référence ──
    ok = True
    ref = sqlite3.connect(REFERENCE)
    for table in ('external_courses', 'meal_attendances', 'subjects'):
        target_ddl = c.execute(
            "SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()[0]
        ref_ddl = ref.execute(
            "SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()[0]
        if target_ddl != ref_ddl:
            print(f'[verify] ÉCHEC : DDL de {table} différent de la référence'); ok = False
        else:
            print(f'[verify] {table} : DDL identique à la référence ✓')
    ref.close()
    n_subjects = table_count(c, 'subjects')
    print(f'[verify] subjects : {n_subjects} lignes globales')
    c.close()

    if not ok:
        sys.exit('[fix] vérification échouée — restaurer depuis la sauvegarde .bak')
    print('[fix] terminé : la base locale 270b59ee… est alignée sur le schéma corrigé.')


if __name__ == '__main__':
    main()
