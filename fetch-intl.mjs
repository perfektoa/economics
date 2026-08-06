// Euro-area distributional wealth, quarterly — the ECB's Distributional Wealth
// Accounts via DBnomics. This is the direct counterpart of the Fed's WFRB*
// series the US inequality section is built on: same concept (share of total
// household net wealth held by a group), same cadence (quarterly), published by
// the currency area's own central bank.
//
// NWA sits in the INSTR_ASSET dimension (net wealth as an asset concept),
// NOT in STO — filtering STO:[NWA] silently returns zero series.
// Series pattern (found by walking the dataset's dimensions — text search finds
// nothing): Q.{AREA}.S14._Z._Z.NWA.{GROUP}.PT.S.N
//   NWA = adjusted net wealth, PT = percent share
//   groups: T10 top 10%, T5 top 5%, B50 bottom 50%
// The ECB publishes nothing finer than the top 5%, so there is no top-1% line
// to mirror the US chart exactly; T5 is the closest available.
// EUR_MD gives median net wealth per household in euros — comparable ACROSS
// euro countries by construction, which dollar medians never are.
import { writeFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const DATA = fileURLToPath(new URL('./data/', import.meta.url));
const MARK = DATA + 'DWA_EA_T10.json';
if (!process.argv.includes('--force') && existsSync(MARK) && (Date.now() - statSync(MARK).mtimeMs) < 6 * 24 * 3600 * 1000) {
    console.log('intl: cache is fresh (quarterly data, 6-day cache)'); process.exit(0);
}

// The euro-area aggregate is coded I9 in this dataset (euro area changing
// composition) — neither EA nor U2 matches anything. Filed as EA locally.
const AREAS = ['I9', 'DE', 'FR', 'IT', 'ES', 'NL'];
const MEASURES = [
    ['T10', 'PT'],       // top 10% share of net wealth
    ['T5', 'PT'],        // top 5% share
    ['B50', 'PT'],       // bottom 50% share
    ['_Z', 'EUR_MD'],    // median net wealth per household, euros
];
const qDate = (p) => {
    const m = p.match(/^(\d{4})-Q([1-4])$/);
    return m ? `${m[1]}-${String((+m[2] - 1) * 3 + 1).padStart(2, '0')}-01` : null;
};

let written = 0;
for (const [grp, unit] of MEASURES) {
    const dims = encodeURIComponent(JSON.stringify({
        FREQ: ['Q'], REF_AREA: AREAS, INSTR_ASSET: ['NWA'], DWA_GRP: [grp], UNIT_MEASURE: [unit],
    }));
    const r = await fetch(`https://api.db.nomics.world/v22/series/ECB/DWA?dimensions=${dims}&observations=1&limit=50`);
    if (!r.ok) { console.error(`intl: DWA ${grp}/${unit} HTTP ${r.status}`); continue; }
    const j = await r.json();
    for (const s of (j.series?.docs || [])) {
        const area = s.series_code.split('.')[1] === 'I9' ? 'EA' : s.series_code.split('.')[1];
        const obs = (s.period || []).map((p, i) => ({ d: qDate(p), v: s.value?.[i] }))
            .filter(o => o.d && o.v != null && isFinite(o.v));
        if (obs.length < 8) continue;
        const key = grp === '_Z' ? 'MED' : grp;
        const id = `DWA_${area}_${key}`;
        // Median arrives in euros; store thousands so the charts read cleanly.
        const scaled = unit === 'EUR_MD' ? obs.map(o => ({ d: o.d, v: o.v / 1000 })) : obs;
        writeFileSync(DATA + id + '.json', JSON.stringify({ id, fetchedAt: new Date().toISOString(), obs: scaled }));
        written++;
    }
    await new Promise(res => setTimeout(res, 300));
}
console.log(`intl: wrote ${written} euro-area distributional series (${AREAS.join(', ')})`);
