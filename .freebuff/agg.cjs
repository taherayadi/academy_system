const d = require('./detect.json');
const arr = Array.isArray(d) ? d : (d.findings || []);
const byName = {};
for (const f of arr) {
  const key = `${f.name} [${f.severity}]`;
  byName[key] = byName[key] || [];
  byName[key].push(f.file.split(/[\\/]/).pop() + ':' + f.line);
}
for (const [k, v] of Object.entries(byName)) {
  console.log(`${k} — ${v.length}  →  ${[...new Set(v)].slice(0, 8).join(', ')}`);
}
console.log('TOTAL:', arr.length);
