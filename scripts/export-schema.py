#!/usr/bin/env python3
"""
Exporte le schéma complet de la base D1 locale vers
migrations/0001_initial_schema.sql (DDL des tables trié par dépendances FK,
index ensuite, puis lignes de référence), et valide le résultat sur une
base SQLite en mémoire.

Tables de référence exportées AVEC leurs données :
  modules, center_types, center_type_modules, services
  + subjects limitées aux lignes globales (center_id = '') — chaque centre
    crée les siennes à l'exécution.

Usage : PYTHONIOENCODING=utf-8 python scripts/export-schema.py
"""
import os
import re
import sqlite3
import sys

DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c62cfc7139a926222ca921c78a27e6f9a70ee6e19c2a17350abdeb90be4b826a.sqlite'
OUT_DIR = 'migrations'
OUT = os.path.join(OUT_DIR, '0001_initial_schema.sql')

SEED_TABLES = ['modules', 'center_types', 'center_type_modules', 'services']
# subjects : uniquement les lignes globales (center_id = '')
SUBJECTS_GLOBAL_ONLY = True

INTERNAL_TABLES = {'_cf_METADATA', 'd1_migrations', '_cf_KV'}

HEADER = """-- ============================================================================
-- EduSphère — schéma complet (nouveau schéma) — migrations/0001_initial_schema.sql
--
-- Instantané de la base D1 locale d'après la migration du modèle de données
-- (inclut external_courses.assurance_amount REAL NOT NULL DEFAULT 0 —
-- assurance par COURS ajoutée avec cette migration).
--
-- Tables de référence créées ET peuplées : modules, center_types,
-- center_type_modules, services, subjects (lignes globales center_id='').
-- Les données métier (centers, students, payments, …) ne sont PAS incluses.
--
-- ⚠️ Destiné à une base PRODUCTION VIERGE. Pour une base de production déjà
-- peuplée avec l'ancien schéma, écrire une migration différentielle dédiée
-- (recréations STRICT + copies) au lieu d'exécuter ce fichier tel quel.
--
-- Généré par scripts/export-schema.py depuis l'état réel de la base locale.
-- ============================================================================

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
"""


def lit(v) -> str:
    """Littéral SQL pour INSERT (STRICT : les types doivent être exacts)."""
    if v is None:
        return 'NULL'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def dump_rows(c: sqlite3.Connection, table: str, where: str = '') -> list[str]:
    rows = c.execute(f'SELECT * FROM {table}{where}').fetchall()
    if not rows:
        return []
    cols = [d[0] for d in c.execute(f'SELECT * FROM {table} LIMIT 0').description]
    out = [f'-- Données de référence : {table} ({len(rows)} lignes)']
    for r in rows:
        vals = ', '.join(lit(v) for v in tuple(r))
        out.append(f'INSERT INTO {table} ({", ".join(cols)}) VALUES ({vals});')
    out.append('')
    return out


def main() -> None:
    if not os.path.exists(DB):
        sys.exit(f'Base introuvable : {DB}')
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row

    objects = c.execute(
        "SELECT name, type, sql FROM sqlite_master "
        "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA', 'd1_migrations') "
        "ORDER BY rowid"
    ).fetchall()
    tables = [o for o in objects if o['type'] == 'table']
    others = [o for o in objects if o['type'] != 'table']

    # Tri topologique : une table après toutes celles qu'elle référence.
    def deps(sql: str) -> set[str]:
        return {m.lower() for m in re.findall(r'REFERENCES\s+"?([A-Za-z_]\w*)"?', sql)}

    by_name = {o['name'].lower(): o for o in tables}
    ordered, placed = [], set()

    def visit(name: str, stack: tuple = ()) -> None:
        if name in placed or name not in by_name or name in stack:
            return
        for d in sorted(deps(by_name[name]['sql'])):
            visit(d, stack + (name,))
        placed.add(name)
        ordered.append(by_name[name])

    for o in tables:
        visit(o['name'].lower())
    for o in tables:  # sécurité : cycles FK éventuels non couverts
        if o['name'].lower() not in placed:
            ordered.append(o)
            placed.add(o['name'].lower())

    lines = [HEADER]
    for t in ordered:
        lines.append(f"-- ─── Table : {t['name']} {'─' * max(1, 58 - len(t['name']))}")
        lines.append(t['sql'].strip() + ';')
        lines.append('')

    for t in others:
        lines.append(f"-- {t['type']} : {t['name']}")
        lines.append(t['sql'].strip() + ';')
        lines.append('')

    lines.append('-- ═══════════════ Données de référence ═══════════════\n')
    for table in SEED_TABLES:
        if table in placed:
            lines.extend(dump_rows(c, table))
    if 'subjects' in placed:
        lines.extend(dump_rows(c, 'subjects', " WHERE center_id = ''" if SUBJECTS_GLOBAL_ONLY else ''))

    lines.append('COMMIT;')

    content = '\n'.join(lines).rstrip() + '\n'
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(content)

    # ── Validation : rejouer le fichier sur une base en mémoire ──
    major, minor, *_ = (int(x) for x in sqlite3.sqlite_version.split('.'))
    if (major, minor) < (3, 37):
        print(f"[export] AVERTISSEMENT : SQLite {sqlite3.sqlite_version} sans support STRICT — "
              f"validation locale ignorée (valider avec node:sqlite).")
    else:
        mem = sqlite3.connect(':memory:')
        mem.executescript(content)
        counts = {}
        for t in ['modules', 'center_types', 'center_type_modules', 'services', 'subjects']:
            counts[t] = mem.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        has_assurance = mem.execute(
            "SELECT COUNT(*) FROM pragma_table_info('external_courses') WHERE name = 'assurance_amount'"
        ).fetchone()[0]
        n_tables = mem.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ).fetchone()[0]
        print(f"[export] validation OK : {n_tables} tables, "
              f"assurance_amount={'présente' if has_assurance else 'ABSENTE !'}, {counts}")

    print(f"[export] écrit : {OUT} ({len(content)} octets)")


if __name__ == '__main__':
    main()
