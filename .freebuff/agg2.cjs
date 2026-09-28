let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(s);
    const items = Array.isArray(j) ? j : (j.findings || []);
    if (!items.length) { console.log('0 findings'); return; }
    const byType = {};
    items.forEach(f => { byType[f.antipattern] = (byType[f.antipattern] || 0) + 1; });
    console.log('TOTAL:', items.length, JSON.stringify(byType));
    const files = {};
    items.forEach(f => {
      const rel = f.file.split(/[\\/]/).slice(-2).join('/');
      files[rel] = (files[rel] || 0) + 1;
    });
    console.log(JSON.stringify(files, null, 1));
    items.filter(f => f.antipattern === 'side-tab-borders' || f.antipattern === 'border-accent').forEach(f => {
      console.log(f.antipattern, '@', f.file.split(/[\\/]/).pop() + ':' + f.line, '|', (f.snippet || '').slice(0, 60));
    });
  } catch (e) { console.log('PARSE FAIL:', s.slice(0, 400)); }
});
