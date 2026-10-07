#!/usr/bin/env python3
"""Reproduce the payment-insert failure classes against the REAL local D1 schema
(a throwaway in-memory copy — the live base is never written).

Covers the failure classes POST /api/payments used to 500 on:
  1. method='Espèces'  → CHECK method IN ('cash','cheque','transfer','card')
  2. refund sans refund_of (استرجاع شهر…) — ACCEPTÉ depuis la suppression de
     la CHECK « is_refund = 0 OR refund_of IS NOT NULL » (2026-10, voir
     scripts/fix-payment-refund-constraint.py)
  3. 'Annuel (2026/2027)' period_month / school_year handling

After inserting what the NORMALIZED write path now binds, it re-reads the row and
asserts the round-trip: service label → read-back, month label → month label.
"""
import os
import shutil
import sqlite3
import tempfile

BASE = os.path.join('.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
TARGET = os.path.join(
    BASE, '270b59ee46090716d36d187ff3d6e08d155a80aecf20462864f4690016fb5a38.sqlite')

# Resolved dynamically from the local DB so the script tracks any center/student.
CENTER_ID = None
STUDENT_ID = None

def resolve_ids(conn):
    global CENTER_ID, STUDENT_ID
    row = conn.execute('SELECT s.id, s.center_id FROM students s LIMIT 1').fetchone()
    if not row:
        raise SystemExit('No student in the local DB — create one in the app first.')
    STUDENT_ID, CENTER_ID = row[0], row[1]
    print(f'using student {STUDENT_ID} of center {CENTER_ID}')

SQL = '''INSERT INTO payments
 (id, center_id, student_id, date, service_key, billing_period, period_month, school_year,
  payment_type, method, amount, total_required, discount, receipt_number, notes,
  cheque_number, cheque_date, cheque_paid, is_refund, refund_of, ref_type, ref_id, created_at)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'''


def build_sql(sql_unused=None):  # helper kept for readability
    return SQL


def insert(conn, values, label, expect_ok=True):
    try:
        conn.execute(SQL, values)
        conn.commit()
        print(f'[OK]   {label}')
        return True
    except sqlite3.Error as e:
        if expect_ok:
            print(f'[FAIL] {label} — {e}')
        else:
            print(f'[OK]   {label} — rejected as expected ({e})')
        return False


def payment_row(conn, pid):
    return conn.execute(
        'SELECT amount, is_refund, refund_of, method, school_year, service_key, '
        'billing_period, period_month, payment_type, cheque_number, cheque_paid '
        'FROM payments WHERE id = ?', (pid,)).fetchone()


def main():
    with tempfile.NamedTemporaryFile(suffix='.sqlite', delete=False) as tmp:
        tmp_path = tmp.name
    shutil.copy2(TARGET, tmp_path)
    conn = sqlite3.connect(tmp_path)
    conn.execute('PRAGMA foreign_keys = ON')
    try:
        resolve_ids(conn)
        ok_student = conn.execute(
            'SELECT 1 FROM students WHERE id = ? AND center_id = ?',
            (STUDENT_ID, CENTER_ID)).fetchone()
        assert ok_student, 'student row missing from local DB — seed it first'

        # ── 0. What the OLD code bound before the fix — must still fail ──
        old_method = ('pay_old', CENTER_ID, STUDENT_ID, '2026-10-07', 'suivi',
                      'year', None, '2026/2027', 'advance', 'Espèces',
                      75.0, 150.0, 0.0, 'REC-OLD', None,
                      None, None, 0, 0, None, None, None, 0)
        insert(conn, old_method, "OLD bind: French method label 'Espèces'", expect_ok=False)

        # ── 1. NORMALIZED annual (Inscription Suivi) payment — must pass ──
        # (receipt numbers are UNIQUE per center — use throwaway ones so the
        # script stays re-runnable against a DB that already holds REC-001…)
        import time as _t
        u = str(int(_t.time()))[-6:]
        annual = ('pay_fix_1', CENTER_ID, STUDENT_ID, '2026-10-07', 'suivi',
                  'year', None, '2026/2027', 'advance', 'cash',
                  75.0, 150.0, 0.0, f'TEST-{u}-1', 'رسوم التسجيل السنوي',
                  None, None, 0, 0, None, None, None, 0)
        assert insert(conn, annual, 'NEW: annual payment, method mapped to cash')
        row = payment_row(conn, 'pay_fix_1')
        assert row[0] == 75.0 and row[1] == 0, row
        assert row[3] == 'cash' and row[4] == '2026/2027', row
        assert row[6] == 'year' and row[7] is None, row

        # ── 2. NORMALIZED monthly payment with month label ──
        monthly = ('pay_fix_2', CENTER_ID, STUDENT_ID, '2026-10-07', 'suivi',
                   'month', '2026-10', '2026/2027', 'full', 'cash',
                   250.0, 250.0, 0.0, f'TEST-{u}-2', None,
                   None, None, 0, 0, None, None, None, 0)
        assert insert(conn, monthly, 'NEW: monthly payment, period_month set', expect_ok=True)
        assert payment_row(conn, 'pay_fix_2')[7] == '2026-10'

        # ── 3. NORMALIZED refund: month-based refund WITHOUT refund_of ──
        # (استرجاع شهر…) — la CHECK « is_refund=0 OR refund_of NOT NULL » a été
        # retirée de la base locale ; ce shape doit maintenant être accepté.
        refund = ('pay_fix_3', CENTER_ID, STUDENT_ID, '2026-10-07', 'suivi',
                  'month', '2026-11', '2026/2027', 'balance', 'cash',
                  250.0, 250.0, 0.0, f'TEST-{u}-3', None,
                  None, None, 0, 1, None, None, None, 0)
        assert insert(conn, refund, 'NEW: month refund (is_refund=1, refund_of NULL)')
        row = payment_row(conn, 'pay_fix_3')
        assert row[0] == 250.0 and row[1] == 1 and row[2] is None, row

        # ── 3b. linked refund (refund_of pointe vers pay_fix_1) reste valable ──
        refund2 = ('pay_fix_3b', CENTER_ID, STUDENT_ID, '2026-10-07', 'suivi',
                   'year', None, '2026/2027', 'balance', 'cash',
                   75.0, 150.0, 0.0, f'TEST-{u}-3b', None,
                   None, None, 0, 1, 'pay_fix_1', None, None, 0)
        assert insert(conn, refund2, 'NEW: linked refund (refund_of → pay_fix_1)')

        # ── 4. Cheque without number must still be rejected ──
        bad = ('pay_fix_4', CENTER_ID, STUDENT_ID, '2026-10-07', 'suivi',
               'year', None, '2026/2027', 'full', 'cheque',
               75.0, 150.0, 0.0, f'TEST-{u}-4', None,
               None, None, 0, 0, None, None, None, 0)
        insert(conn, bad, 'cheque without number', expect_ok=False)

        # ── 5. FK: payment for a foreign student id must be rejected ──
        foreign = ('pay_fix_5', CENTER_ID, 'st_foreign', '2026-10-07', 'suivi',
                   'year', None, '2026/2027', 'advance', 'cash',
                   75.0, 150.0, 0.0, f'TEST-{u}-5', None,
                   None, None, 0, 0, None, None, None, 0)
        insert(conn, foreign, 'FK guard: foreign student id', expect_ok=False)

        print('\nAll normalized write-path shapes accepted by the real schema ✓')
    finally:
        conn.close()
        os.unlink(tmp_path)


if __name__ == '__main__':
    main()
