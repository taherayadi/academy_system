# -*- coding: utf-8 -*-
"""Répare les FKs pendantes vers payments_old (résidu de la reconstruction
de la table payments par fix-payment-refund-constraint.py).

Les tables meal_attendances, course_session_attendance et
revision_seance_students référencent encore `payments_old(id)`, table qui
n'existe plus après le swap → toute écriture dessus échoue avec
« no such table: main.payments_old » (c'était la cause du 500
« تعذر تعديل بيانات التلميذ » sur PUT /api/students, via le
DELETE FROM meal_attendances de updateSingleStudent).

Le script reconstruit ces tables avec la FK re-pointée vers `payments`,
en préservant toutes les lignes et en recréant les index explicites.
Idempotent : si plus aucune référence payments_old n'existe, rien ne change.
Sauvegarde .bak avant toute écriture.
Run:  PYTHONIOENCODING=utf-8 python scripts/fix-dangling-payment-fks.py
"""
import glob
import os
import shutil
import sqlite3
import datetime
import re

AFFECTED = ('meal_attendances', 'course_session_attendance', 'revision_seance_students')

dbs = sorted(glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite'))
changed_any = False

for db_path in dbs:
    conn = sqlite3.connect(db_path, isolation_level=None)  # autocommit; pragmas hors transaction
    conn.execute('PRAGMA foreign_keys=OFF')

    # Quelles tables référencent encore payments_old ?
    stale = []
    for (name, sql) in conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%payments_old%'"
    ).fetchall():
        stale.append((name, sql))

    if not stale:
        print('[ok] %s — aucune FK pendante payments_old.' % os.path.basename(db_path))
        conn.close()
        continue

    print('[fix] %s — tables à reconstruire: %s' % (os.path.basename(db_path), [s[0] for s in stale]))

    # Sauvegarde horodatée
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = db_path + '.bak-' + stamp
    shutil.copy2(db_path, backup)
    print('      sauvegarde: %s' % backup)

    for table, ddl in stale:
        if table not in AFFECTED:
            # Table inconnue référençant payments_old : on la signale sans y toucher.
            print('      [!] %s référence payments_old mais n\'est pas dans la liste connue — ignorée.' % table)
            continue

        # Recréer les index explicites AVANT le drop (ils disparaissent avec la table).
        idx_sqls = [r[0] for r in conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
            (table,)).fetchall()]

        new_ddl = ddl.replace('payments_old', 'payments')
        # Nom temporaire pour la reconstruction.
        tmp_name = table + '__fix'
        tmp_ddl = re.sub(
            r'(CREATE TABLE\s+["\']?)%s(["\']?)' % re.escape(table),
            r'\g<1>%s\g<2>' % tmp_name,
            new_ddl,
            count=1,
        )
        if tmp_name not in tmp_ddl:
            print('      [!] impossible de renommer %s dans le DDL — ignorée.' % table)
            continue

        conn.execute('BEGIN')
        try:
            conn.execute('DROP TABLE IF EXISTS "%s"' % tmp_name)
            conn.execute(tmp_ddl)
            cols = [r[1] for r in conn.execute('PRAGMA table_info("%s")' % table).fetchall()]
            col_list = ', '.join('"%s"' % c for c in cols)
            conn.execute('INSERT INTO "%s" (%s) SELECT %s FROM "%s"' % (tmp_name, col_list, col_list, table))
            conn.execute('DROP TABLE "%s"' % table)
            conn.execute('ALTER TABLE "%s" RENAME TO "%s"' % (tmp_name, table))
            for idx_sql in idx_sqls:
                # Les index peuvent porter le même nom : drop puis recreate.
                m = re.search(r'INDEX\s+["\']?([A-Za-z0-9_]+)["\']?', idx_sql)
                if m:
                    conn.execute('DROP INDEX IF EXISTS "%s"' % m.group(1))
                conn.execute(idx_sql)
            conn.execute('COMMIT')
            print('      [ok] %s reconstruite (%d lignes conservées).' % (
                table,
                conn.execute('SELECT COUNT(*) FROM "%s"' % table).fetchone()[0],
            ))
            changed_any = True
        except sqlite3.Error as e:
            conn.execute('ROLLBACK')
            print('      [erreur] %s : %s — sauvegarde intacte.' % (table, e))
            raise SystemExit(1)

    # Vérification finale : plus aucune référence payments_old + cohérence FK.
    rest = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND sql LIKE '%payments_old%'"
    ).fetchone()[0]
    fk_issues = conn.execute('PRAGMA foreign_key_check').fetchall()
    conn.execute('PRAGMA foreign_keys=ON')
    ok_fk = conn.execute('PRAGMA foreign_key_check').fetchall()
    print('      tables référençant encore payments_old: %d | foreign_key_check: %s' % (
        rest, 'OK' if not ok_fk else ok_fk[:3]))
    conn.close()

print('\nTerminé.' + (' (modifications appliquées)' if changed_any else ' (aucun changement)'))
print('IMPORTANT: redémarrez `wrangler pages dev` pour recharger le schéma.')
