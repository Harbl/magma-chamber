// Regenerate data/legends.json from the Riftcodex API. Run after a new set drops:
//   node tools/fetch-legends.js
const fs = require('fs');
const path = require('path');

const B = 'https://api.riftcodex.com';

(async () => {
  const legends = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${B}/cards?page=${page}&size=100`);
    if (!r.ok) throw new Error(`HTTP ${r.status} on page ${page}`);
    const { items = [], total } = await r.json();
    if (!items.length) break;
    legends.push(...items.filter(c => c.classification?.type === 'Legend'));
    process.stdout.write(`\rpage ${page} — ${legends.length} legends of ${total} cards scanned`);
    if (page * 100 >= total) break;
  }

  // One entry per legend. Drop printing variants -- "(Metal)", "(Overnumbered)",
  // "(Starter)", "(Signature)" -- which all share a base name.
  const seen = new Map();
  for (const c of legends) {
    if (/\s\([^)]+\)$/.test(c.name)) continue;
    if (seen.has(c.name)) continue;
    seen.set(c.name, {
      name: c.name,
      domains: c.classification?.domain ?? [],
      set: c.set?.set_id ?? null,
      image: c.media?.image_url ?? null,
    });
  }

  // Some sets also list a legend under its bare epithet ("Master of Shadows")
  // alongside the full "Zed - Master of Shadows". Keep only the full name.
  const full = [...seen.keys()].filter(n => n.includes(' - '));
  for (const name of seen.keys())
    if (!name.includes(' - ') && full.some(f => f.endsWith(' - ' + name))) seen.delete(name);

  const out = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  const file = path.join(__dirname, '..', 'data', 'legends.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${out.length} legends -> ${file}`);
  console.log(out.map(l => `  ${l.name} [${l.domains.join('/')}] ${l.set}`).join('\n'));
})();
