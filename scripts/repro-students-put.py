# -*- coding: utf-8 -*-
"""Repro of PUT /api/students 500 (تعذر تعديل بيانات التلميذ).

Emulates updateSingleStudent() (functions/api/_lib.ts) statement by statement
against a COPY of each local miniflare D1 file, with the exact payload the
client sent when marking a cheque as paid in the finance module.
Never writes to the live DB: works on a temp copy and rolls back.
Run:  PYTHONIOENCODING=utf-8 python scripts/repro-students-put.py
"""
import glob
import json
import shutil
import sqlite3
import tempfile
import datetime
import os

STUDENT_ID = 'st_f09ffd52-a7c7-4b60-92b3-2d3a068d6395'
YEAR = '2026/2027'

# ---- exact payload captured from the failing browser request -----------------
PAYLOAD = json.loads(r'''
{"id":"st_f09ffd52-a7c7-4b60-92b3-2d3a068d6395","firstName":"Ayadi","lastName":"Taher","birthDate":"2017-02-08","birthPlace":"sfax","grade":"","academicYear":"2026/2027","mother":{"name":"Fathia ayadi","birthDate":"","profession":"","address":"","phoneFixed":"","phoneMobile":"","email":"","extraPhones":[]},"father":{"name":"Ali ayadi","birthDate":"","profession":"","address":"","phoneFixed":"","phoneMobile":"","email":"","extraPhones":[]},"parentalSituation":"mariés","parentalComments":"","siblings":[],"authorizedPersons":[],"allergies":"","academicHistory":{"nMinus1":{"school":"","grade":""},"nMinus2":{"school":"","grade":""},"nMinus3":{"school":"","grade":""}},"registration":{"date":"2026-10-06","location":"sfax","signedElectronically":true,"signatureName":"Ali ayadi"},"enrolledServices":{"suivi":true,"etude":false,"library":false,"meals":false,"gouterMatin":false,"gouterSoir":false,"gouterBoth":false},"suiviFees":{"annualRegistrationFee":0,"monthlyFee":0},"etudeFees":{"annualRegistrationFee":0,"monthlyFee":0},"libraryFees":{"annualRegistrationFee":0,"monthlyFee":0},"mealSubscription":{"mode":"subscription","monthlyPrice":0,"unitPrice":0,"prepaidMeals":0,"consumedMealsCount":0,"active":false},"mealAttendances":[],"payments":[{"id":"pay_f864cbf6-4273-4ed9-bbd7-c1b98db1367d","date":"2026-10-07","amountPaid":75,"totalRequired":150,"remainingBalance":75,"service":"Inscription Suivi","serviceKey":"suivi","billingPeriod":"year","schoolYear":"2026/2027","month":"Annuel (2026/2027)","paymentType":"advance","method":"Espèces","receiptNumber":"REC-001","notes":"رسوم التسجيل السنوي (السنة 2026/2027)"},{"id":"pay_0014a455-4320-414e-957b-b5bae1fee1ef","date":"2026-10-07","amountPaid":75,"totalRequired":150,"remainingBalance":75,"service":"Inscription Suivi","serviceKey":"suivi","billingPeriod":"year","schoolYear":"2026/2027","month":"Annuel (2026/2027)","paymentType":"balance","method":"Chèque","receiptNumber":"REC-002","notes":"تكملة خلاص رسوم التسجيل السنوي (السنة 2026/2027)","chequeNumber":"000001","chequeDate":"2026-10-30","chequePaid":true},{"id":"pay_f2dbdd7f-b033-4972-a101-8be3d57a02ef","date":"2026-10-07","amountPaid":250,"totalRequired":250,"remainingBalance":0,"service":"Suivi","serviceKey":"suivi","billingPeriod":"month","schoolYear":"2026/2027","month":"Septembre (2026/2027)","paymentType":"full","method":"Chèque","receiptNumber":"REC-003","notes":"خلاص رسوم شهر Septembre (السنة 2026/2027)","chequeNumber":"000001","chequeDate":"2026-10-30","chequePaid":true},{"id":"pay_3e90f8c0-4a0d-4df0-b573-284ab0b86b0a","date":"2026-10-07","amountPaid":250,"totalRequired":250,"remainingBalance":0,"service":"Suivi","serviceKey":"suivi","billingPeriod":"month","schoolYear":"2026/2027","month":"Octobre (2026/2027)","paymentType":"full","method":"Espèces","receiptNumber":"REC-004","notes":"خلاص رسوم شهر Octobre (السنة 2026/2027)"},{"id":"pay_4903c127-9679-4fa7-b27b-89549cad53f6","date":"2026-10-07","amountPaid":250,"totalRequired":250,"remainingBalance":0,"service":"Suivi","serviceKey":"suivi","billingPeriod":"month","schoolYear":"2026/2027","month":"Novembre (2026/2027)","paymentType":"full","method":"Espèces","receiptNumber":"REC-005","notes":"خلاص رسوم شهر Novembre (السنة 2026/2027)"},{"id":"ref_fdcd45f5-cce2-4815-ac6c-9c7841c9ed65_Novembre","date":"2026-10-07","amountPaid":-250,"totalRequired":250,"remainingBalance":0,"service":"Suivi","serviceKey":"suivi","billingPeriod":"month","schoolYear":"2026/2027","month":"Novembre (2026/2027)","paymentType":"balance","method":"Espèces","receiptNumber":"REM-001","notes":"استرجاع (Remboursement) شهر نوفمبر بسبب انسحاب التلميذ - 2026/2027","refund":true},{"id":"pay_a812ff60-33eb-4c15-ae44-4e5f17d405aa","date":"2026-10-07","amountPaid":250,"totalRequired":250,"remainingBalance":0,"service":"Suivi","month":"Décembre (2026/2027)","paymentType":"full","method":"Chèque","chequeNumber":"000002","chequeDate":"2026-10-30","receiptNumber":"REC-006","notes":"خلاص رسوم شهر Décembre (السنة 2026/2027)","chequePaid":true},{"id":"pay_8865bf86-9283-4d38-8d4b-b926c5f8eab9","date":"2026-10-07","amountPaid":250,"totalRequired":250,"remainingBalance":0,"service":"Suivi","month":"Janvier (2026/2027)","paymentType":"full","method":"Chèque","chequeNumber":"000002","chequeDate":"2026-10-30","receiptNumber":"REC-007","notes":"خلاص رسوم شهر Janvier (السنة 2026/2027)","chequePaid":true}],"suiviNotes":[],"_schoolYear":"2026/2027"}
''')

# ---- helpers replicating _lib.ts --------------------------------------------
def s(v):
    return '' if v is None else str(v)

def n(v):
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0

def payment_method_key(m):
    m = s(m).strip().lower()
    if m == 'cheque':
        return 'cheque'
    if m == 'transfer' or m == 'virement':
        return 'transfer'
    if m == 'card' or m == 'carte':
        return 'card'
    return 'cash'  # cash/espèces/especes + default

def payment_type_key(t):
    t = s(t).strip()
    return t if t in ('full', 'partial', 'balance', 'advance') else 'full'

SERVICE_LABEL_KEYS = {
    'Suivi': ('suivi', 'month'),
    'Inscription Suivi': ('suivi', 'year'),
    'Étude': ('etude', 'month'),
    'Inscription Étude': ('etude', 'year'),
    'Bibliothèque': ('bibliotheque', 'month'),
    'Inscription Bibliothèque': ('bibliotheque', 'year'),
    'Repas': ('lunch', 'unit'),
    'Goûter': ('gouter_matin', 'unit'),
    'Assurance': ('assurance_externe', 'year'),
    'Cours Particuliers': ('external_course', 'unit'),
    'Revision': ('revision', 'unit'),
    'Formation': ('formation', 'unit'),
    'Événements': ('event', 'unit'),
    'Autres': ('autre', 'unit'),
}

def payment_service_key(service, month):
    label = ' '.join(s(service).split())
    is_annual = s(month).startswith('Annuel')
    if label == 'Inscription':
        return SERVICE_LABEL_KEYS['Inscription Suivi']
    mapped = SERVICE_LABEL_KEYS.get(label, ('autre', 'unit'))
    if is_annual and mapped[0] == 'bibliotheque' and label == 'Bibliothèque':
        return SERVICE_LABEL_KEYS['Inscription Bibliothèque']
    return mapped

MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
          'Septembre', 'Octobre', 'Novembre', 'Décembre']

def month_key_from_label(label):
    first = s(label).strip().split(' ')[0] if s(label).strip() else ''
    if first not in MONTHS:
        return ''
    idx = MONTHS.index(first)
    now = datetime.date.today().year
    year = now if idx >= 8 or idx <= 4 else now
    if idx <= 4:
        year = now + 1
    return '%d-%02d' % (year, idx + 1)

def period_month_from(raw):
    txt = s(raw).strip()
    if not txt:
        return None
    if len(txt) == 7 and txt[4] == '-' and txt[:4].isdigit() and txt[5:7].isdigit():
        return txt
    if txt.lower().startswith('annuel'):
        return None
    return month_key_from_label(txt) or None

def school_year_start(year):
    start = s(year).split('/')[0]
    return ('%s-09-01' % start) if len(start) == 4 and start.isdigit() else '2026-09-01'

# ---- phase 1: inspect every local D1 file ------------------------------------
dbs = sorted(glob.glob('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite'))
print('Local D1 files found:', len(dbs))
target = None
for db in dbs:
    try:
        conn = sqlite3.connect(db)
        row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'").fetchone()
        ddl = row[0] if row else ''
        refund_check = 'is_refund' in ddl and 'CHECK' in ddl.upper() and 'refund_of' in ddl
        has_student = conn.execute('SELECT COUNT(*) FROM students WHERE id=?', (STUDENT_ID,)).fetchone()[0]
        pay_count = conn.execute('SELECT COUNT(*) FROM payments WHERE student_id=?', (STUDENT_ID,)).fetchone()[0] if has_student else -1
        receipts = []
        if has_student:
            receipts = [r[0] for r in conn.execute('SELECT receipt_number FROM payments WHERE student_id=? ORDER BY receipt_number', (STUDENT_ID,))]
        print('\nDB:', os.path.basename(db))
        print('  payments refund CHECK present:', refund_check)
        print('  student present:', bool(has_student), '| payment rows:', pay_count)
        print('  receipts:', receipts)
        conn.close()
        if has_student:
            target = db
    except Exception as e:
        print('DB:', os.path.basename(db), '→ inspect error:', e)

if not target:
    print('\nStudent not found in any local DB — nothing to replay.')
    raise SystemExit(0)

# ---- phase 2: emulate updateSingleStudent against a COPY of the live DB ------
print('\n=== Replay updateSingleStudent on copy of:', os.path.basename(target), '===')
tmp = os.path.join(tempfile.gettempdir(), 'repro-students-put.sqlite')
shutil.copy(target, tmp)
conn = sqlite3.connect(tmp)
conn.execute('PRAGMA foreign_keys=ON')
cur = conn.cursor()

sdata = PAYLOAD
center_id = cur.execute('SELECT center_id FROM students WHERE id=?', (STUDENT_ID,)).fetchone()[0]
school_year = s(sdata.get('academicYear')) or YEAR

# Which tables hold FKs pointing at students (would break DELETE FROM students)?
print('\n-- tables referencing students(id) with rows for this student:')
for (tbl,) in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    fks = cur.execute('PRAGMA foreign_key_list(%s)' % tbl).fetchall()
    for fk in fks:
        # fk: (id, seq, table, from, to, ...)
        if fk[2] == 'students':
            col = fk[3]
            try:
                cnt = cur.execute('SELECT COUNT(*) FROM %s WHERE %s=?' % (tbl, col), (STUDENT_ID,)).fetchone()[0]
                if cnt:
                    print('   %s.%s → %d row(s)  (on_delete=%s)' % (tbl, col, cnt, fk[5]))
            except sqlite3.Error:
                pass

DELETES = [
    'DELETE FROM payments WHERE student_id = ?',
    'DELETE FROM meal_attendances WHERE student_id = ?',
    'DELETE FROM suivi_notes WHERE student_id = ?',
    'DELETE FROM academic_history WHERE student_id = ?',
    'DELETE FROM authorized_persons WHERE student_id = ?',
    'DELETE FROM siblings WHERE student_id = ?',
    'DELETE FROM student_parents WHERE student_id = ?',
    'DELETE FROM students WHERE id = ? AND center_id = ?',
]

now_ms = 1730000000000  # fixed created_at like Date.now()
stmts = []  # (label, sql, params)

for i, d in enumerate(DELETES):
    stmts.append(('delete %d' % i, d, (STUDENT_ID, center_id) if 'center_id' in d else (STUDENT_ID,)))

reg = sdata.get('registration') or {}
stmts.append(('insert students', '''INSERT INTO students (id, center_id, student_type, first_name, last_name, birth_date, birth_place, contact_phone, allergies, parental_situation, parental_comments, registration_date, registration_location, registration_signed_electronically, registration_signature_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
    sdata['id'], center_id, s(sdata.get('studentType')) or 'regular', sdata['firstName'], sdata['lastName'],
    sdata.get('birthDate') or None, sdata.get('birthPlace') or None,
    s(sdata.get('contactPhone')) or None, sdata.get('allergies') or '', sdata.get('parentalSituation') or None,
    sdata.get('parentalComments') if sdata.get('parentalComments') is not None else None,
    reg.get('date'), reg.get('location'), 1 if reg.get('signedElectronically') else 0,
    reg.get('signatureName') if reg.get('signatureName') is not None else None,
    s(sdata.get('status')) or 'active', now_ms,
)))
stmts.append(('insert student_years', 'INSERT OR IGNORE INTO student_years (student_id, center_id, school_year, grade, etablissement_id, time_sheet_id) VALUES (?, ?, ?, ?, ?, ?)', (
    sdata['id'], center_id, school_year, s(sdata.get('grade')) or '', None, None,
)))

es = sdata.get('enrolledServices') or {}
valid_from = school_year_start(school_year)
def enrollment(service_key, billing_mode, monthly, annual, unit):
    stmts.append(('insert enrollment %s' % service_key,
        'INSERT OR IGNORE INTO student_service_enrollments (id, center_id, student_id, service_key, school_year, billing_mode, monthly_price, annual_price, unit_price, valid_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ('repro-uuid-%s' % service_key, center_id, sdata['id'], service_key, school_year, billing_mode, monthly, annual, unit, valid_from)))

if es.get('suivi'):
    enrollment('suivi', 'subscription', n(sdata.get('suiviFees', {}).get('monthlyFee')), n(sdata.get('suiviFees', {}).get('annualRegistrationFee')), None)
if es.get('etude'):
    enrollment('etude', 'subscription', n(sdata.get('etudeFees', {}).get('monthlyFee')), n(sdata.get('etudeFees', {}).get('annualRegistrationFee')), None)
if es.get('library'):
    enrollment('bibliotheque', 'subscription', n(sdata.get('libraryFees', {}).get('monthlyFee')), n(sdata.get('libraryFees', {}).get('annualRegistrationFee')), None)

for role, parent in (('mother', sdata.get('mother') or {}), ('father', sdata.get('father') or {})):
    stmts.append(('insert parent %s' % role,
        'INSERT INTO student_parents (student_id, role, name, birth_date, profession, address, phone_fixed, phone_mobile, email, extra_phones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (sdata['id'], role, parent.get('name') or '', parent.get('birthDate') or '', parent.get('profession') or '',
         parent.get('address') or '', parent.get('phoneFixed') or '', parent.get('phoneMobile') or '',
         parent.get('email') or '', json.dumps(parent.get('extraPhones') if isinstance(parent.get('extraPhones'), list) else []))))

hist = sdata.get('academicHistory') or {}
for key, nm in (('nMinus1', 1), ('nMinus2', 2), ('nMinus3', 3)):
    h = hist.get(key) or {}
    stmts.append(('insert academic_history %d' % nm,
        'INSERT INTO academic_history (student_id, n_minus, school, grade) VALUES (?, ?, ?, ?)',
        (sdata['id'], nm, h.get('school') or '', h.get('grade') or '')))

PAY_SQL = 'INSERT INTO payments (id, center_id, student_id, date, service_key, billing_period, period_month, school_year, payment_type, method, amount, total_required, discount, receipt_number, notes, cheque_number, cheque_date, cheque_paid, is_refund, refund_of, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
for p in sdata.get('payments') or []:
    service_key, period = payment_service_key(p.get('service'), p.get('month'))
    is_refund = (isinstance(p.get('amountPaid'), (int, float)) and p['amountPaid'] < 0) or bool(p.get('refund'))
    method_key = payment_method_key('Espèces' if is_refund and p.get('method') is None else p.get('method'))
    school_year_val = p.get('schoolYear') if p.get('schoolYear') and len(s(p['schoolYear']).split('/')) == 2 and len(s(p['schoolYear'])) == 9 else school_year
    params = (
        p['id'], center_id, sdata['id'], p.get('date'), service_key, period, period_month_from(p.get('month')),
        school_year_val, payment_type_key(p.get('paymentType')), method_key,
        -n(p.get('amountPaid')) if is_refund else n(p.get('amountPaid')), n(p.get('totalRequired')),
        n(p['discount']) if p.get('discount') is not None else 0, p.get('receiptNumber'), p.get('notes'),
        (p.get('chequeNumber') or None) if method_key == 'cheque' else None,
        (p.get('chequeDate') or None) if method_key == 'cheque' else None,
        1 if (method_key == 'cheque' and p.get('chequePaid')) else 0,
        1 if is_refund else 0, (p.get('refundOf') or None) if is_refund else None,
        p.get('refType'), p.get('refId'), now_ms,
    )
    stmts.append(('insert payment %s' % p['id'][-12:], PAY_SQL, params))

# ---- run everything in ONE transaction (like db.batch) ------------------------
try:
    cur.execute('BEGIN')
    for label, sql, params in stmts:
        try:
            cur.execute(sql, params)
        except sqlite3.Error as e:
            print('\n!! FAILED at step: %s' % label)
            print('   SQL:', sql[:120], '...')
            print('   params:', json.dumps(params, ensure_ascii=False, default=str)[:600])
            print('   sqlite error:', e)
            cur.execute('ROLLBACK')
            raise SystemExit(1)
    cur.execute('COMMIT')
    print('\n✔ All %d statements replayed successfully on this DB copy.' % len(stmts))
except SystemExit:
    raise
finally:
    conn.close()
    try:
        os.remove(tmp)
    except OSError:
        pass
