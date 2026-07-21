// Builds debt.json: government debt/GDP for every country the IMF tracks
// (datamapper API, keyless) + Major Foreign Holders of US Treasuries (TIC).
// Slow-moving data — self-caches 5 days unless --force.
// Usage: node fetch-debt.mjs [--force]
import { readFileSync, writeFileSync, existsSync } from 'fs';

const OUT = new URL('./debt.json', import.meta.url);
const force = process.argv.includes('--force');
if (!force && existsSync(OUT)) {
    try {
        const prev = JSON.parse(readFileSync(OUT, 'utf8'));
        const age = (Date.now() - Date.parse(prev.builtAt)) / 86400e3;
        if (age < 5) { console.log(`debt.json is ${age.toFixed(1)}d old — skipping (use --force to refetch)`); process.exit(0); }
    } catch (_) {}
}

// ── IMF: general government gross debt, % of GDP, all countries ─────────────
let imf = [];
try {
    const [dRes, cRes] = await Promise.all([
        fetch('https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP'),
        fetch('https://www.imf.org/external/datamapper/api/v1/countries'),
    ]);
    const values = (await dRes.json()).values?.GGXWDG_NGDP || {};
    const names = (await cRes.json()).countries || {};
    const thisYear = new Date().getFullYear();
    for (const [code, byYear] of Object.entries(values)) {
        if (!names[code]) continue; // skip aggregates (WEOWORLD, ADVEC, …)
        const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
        const actualYears = years.filter(y => y <= thisYear && byYear[y] != null);
        if (!actualYears.length) continue;
        const latestYear = actualYears[actualYears.length - 1];
        const tenAgo = byYear[latestYear - 10];
        const lastProj = years[years.length - 1];
        imf.push({
            code, name: names[code].label,
            latest: +(+byYear[latestYear]).toFixed(1), year: latestYear,
            chg10: tenAgo != null ? +((byYear[latestYear] - tenAgo)).toFixed(1) : null,
            proj: lastProj > latestYear ? { year: lastProj, v: +(+byYear[lastProj]).toFixed(1) } : null,
        });
    }
    imf.sort((a, b) => b.latest - a.latest);
    console.log(`IMF: debt/GDP for ${imf.length} countries (latest actuals ~${imf[0]?.year})`);
} catch (e) { console.error('IMF fetch failed:', e.message); }

// ── TIC: Major Foreign Holders of US Treasuries ─────────────────────────────
// Tries the live monthly file and the rolling-12-month historical file; keeps
// whichever reports the newer period. Both are name-then-numbers rows.
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function parseMfh(text) {
    const lines = text.split(/\r?\n/);
    // Header: a line of month abbreviations, then a line starting with "Country" holding years.
    const mi = lines.findIndex(l => /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\t]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(l));
    if (mi < 0) return null;
    const month = lines[mi].trim().split(/[\s\t]+/)[0];
    const yearLine = lines.slice(mi, mi + 3).find(l => /Country/.test(l)) || lines[mi + 1] || '';
    const year = (yearLine.match(/20\d\d/) || [null])[0];
    if (!MONTHS[month] || !year) return null;
    const holders = []; let total = null;
    for (const raw of lines.slice(mi + 2)) {
        const line = raw.replace(/"/g, '').trim();
        const nameM = line.match(/^([A-Za-z][A-Za-z ,.&'()-]*?)[\s\t]+-?\d/);
        const nums = line.match(/-?\d[\d,]*\.?\d*/g);
        if (!nameM || !nums) continue;
        const name = nameM[1].trim();
        const v = +nums[0].replace(/,/g, '');
        if (/grand total/i.test(name)) { total = v; break; } // country list ends here; memo tables follow
        if (/of which|country|holdings|treasury|bonds|bills|t-bills|footnote/i.test(name)) continue;
        // Columns run newest→oldest; last column is ~12 months back.
        const oldest = +nums[nums.length - 1].replace(/,/g, '');
        holders.push({ name, bil: v, chg12: nums.length > 6 ? +(v - oldest).toFixed(1) : null });
    }
    if (!holders.length) return null;
    return { asOf: `${month} ${year}`, sortKey: +year * 100 + MONTHS[month], holders, totalBil: total };
}
let mfh = null;
for (const url of ['https://ticdata.treasury.gov/Publish/mfh.txt', 'https://ticdata.treasury.gov/Publish/mfhhis01.txt']) {
    try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const parsed = parseMfh(await r.text());
        if (parsed && (!mfh || parsed.sortKey > mfh.sortKey)) mfh = parsed;
    } catch (_) {}
}
if (mfh) console.log(`TIC: ${mfh.holders.length} foreign holders as of ${mfh.asOf} (total $${mfh.totalBil}B)`);
else console.error('TIC holders table unavailable — section will be skipped');

writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), imf, mfh }, null, 1));
console.log('debt.json written');
