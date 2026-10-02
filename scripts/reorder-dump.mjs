// Reorder a D1 export so CREATE TABLE + its INSERTs form a per-table block,
// and blocks are topologically sorted by FK references (parents first).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
const lines = src.split('\n');

// Split into statements on lines ending with ';' at depth 0 (CREATE spans multiple lines).
const statements = [];
let cur = [];
for (const line of lines) {
  cur.push(line);
  if (/;\s*$/.test(line)) {
    statements.push(cur.join('\n'));
    cur = [];
  }
}
if (cur.length && cur.join('').trim()) statements.push(cur.join('\n'));

// Extract table name from a statement.
const createName = (s) => (s.match(/CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i) || [])[1];
const insertInto = (s) => (s.match(/INSERT INTO "?(\w+)"?/i) || [])[1];

// Block = one CREATE TABLE statement + all INSERTs for that table.
const blocks = new Map(); // table -> { create, inserts: [] }
const prelude = [];
const standalone = [];
for (const st of statements) {
  const t = st.trim();
  if (!t) continue;
  const cn = createName(st);
  if (cn) {
    if (blocks.has(cn)) standalone.push(st); // CREATE INDEX etc.
    else blocks.set(cn, { create: st, inserts: [] });
    continue;
  }
  const tn = insertInto(st);
  if (tn && blocks.has(tn)) blocks.get(tn).inserts.push(st);
  else if (/^PRAGMA/i.test(t)) prelude.push(st);
  else if (/^(CREATE (UNIQUE )?INDEX|CREATE TRIGGER|CREATE VIEW)/i.test(t)) standalone.push(st);
  else standalone.push(st);
}

// FK references per table.
const refs = (s) => [...s.matchAll(/REFERENCES\s+"?(\w+)"?/gi)].map(m => m[1])
  .filter(n => blocks.has(n) && n !== createName(s));

// Topological sort (stable, cycle-tolerant).
const done = new Set(), order = [];
const visit = (name, stack = new Set()) => {
  if (done.has(name) || stack.has(name)) return;
  stack.add(name);
  for (const r of refs(blocks.get(name).create)) visit(r, stack);
  stack.delete(name);
  done.add(name);
  order.push(name);
};
for (const name of blocks.keys()) visit(name);

const out = [];
out.push(...prelude, '');
for (const name of order) {
  const b = blocks.get(name);
  out.push(b.create, '', ...b.inserts, '');
}
out.push(...standalone, '');
writeFileSync(process.argv[3], out.join('\n'));
console.log(`Reordered ${order.length} tables: ${order.join(' → ')}`);
