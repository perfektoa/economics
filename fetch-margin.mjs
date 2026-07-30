// Pulls FINRA's monthly margin-statistics workbook and derives two series:
//   MARGINDEBT — debit balances in customers' margin accounts, $B
//   MARGINGDP  — the same as a % of nominal GDP (the comparable-across-eras form)
//
// Source quirk: the workbook URL contains "2021-03" but FINRA updates the file
// in place — the current month's data lives at this same address. There is no
// JSON API for it; the xlsx IS the feed. It's a zip, so we let PowerShell
// Expand-Archive unpack it (this app is Windows-only by construction — run.ps1)
// and parse the sheet XML directly rather than pulling in an xlsx dependency.
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const XLSX_URL = 'https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx';
const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const OUT = DATA + 'MARGINGDP.json';
mkdirSync(DATA, { recursive: true });

// Monthly data: refetching more than daily is pointless.
if (!process.argv.includes('--force') && existsSync(OUT) && (Date.now() - statSync(OUT).mtimeMs) < 20 * 3600 * 1000) {
    console.log('margin: cache is fresh'); process.exit(0);
}

const res = await fetch(XLSX_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) { console.error(`margin: HTTP ${res.status} — keeping old data`); process.exit(0); }
const tmpDir = DATA + 'margin-tmp/';
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir);
// Expand-Archive refuses files without a .zip extension.
writeFileSync(tmpDir + 'margin.zip', Buffer.from(await res.arrayBuffer()));
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath "${tmpDir}margin.zip" -DestinationPath "${tmpDir}x" -Force`]);

// Sheet layout: column A = "YYYY-MM" (inline string), column B = margin debit
// balances in $ millions. Rows arrive newest-first.
const xml = readFileSync(tmpDir + 'x/xl/worksheets/sheet1.xml', 'utf8');
const obs = [];
for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
    const ym = row.match(/<is><t>(\d{4}-\d{2})<\/t><\/is>/)?.[1];
    const v = row.match(/r="B\d+"[^>]*><v>([\d.]+)<\/v>/)?.[1];
    if (ym && v) obs.push({ d: ym + '-01', v: +v / 1000 });   // $M -> $B
}
obs.sort((a, b) => a.d.localeCompare(b.d));
rmSync(tmpDir, { recursive: true, force: true });
if (obs.length < 100) { console.error(`margin: only ${obs.length} rows parsed — format changed? keeping old data`); process.exit(1); }

writeFileSync(DATA + 'MARGINDEBT.json', JSON.stringify({ id: 'MARGINDEBT', fetchedAt: new Date().toISOString(), obs }));

// Ratio to GDP. GDP is quarterly ($B); each month uses the latest quarter at or
// before it — the same step convention the other derived ratios use.
const gdpFile = DATA + 'GDP.json';
if (!existsSync(gdpFile)) { console.error('margin: no GDP.json yet — run fetch-data first'); process.exit(1); }
const gdp = JSON.parse(readFileSync(gdpFile, 'utf8')).obs.filter(o => o.v != null);
let gi = 0;
const ratio = obs.map(o => {
    while (gi + 1 < gdp.length && gdp[gi + 1].d <= o.d) gi++;
    return gdp[gi].d <= o.d ? { d: o.d, v: o.v / gdp[gi].v * 100 } : null;
}).filter(Boolean);
writeFileSync(OUT, JSON.stringify({ id: 'MARGINGDP', fetchedAt: new Date().toISOString(), obs: ratio }));

const last = ratio[ratio.length - 1];
console.log(`margin: ${obs.length} months (${obs[0].d.slice(0, 7)} .. ${obs[obs.length - 1].d.slice(0, 7)}), latest $${obs[obs.length - 1].v.toFixed(0)}B = ${last.v.toFixed(2)}% of GDP`);
