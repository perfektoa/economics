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

// ── Canada: Statistics Canada WDS, table 36100660 ───────────────────────────
// Keyless REST, quarterly 2010..now. One honesty caveat that must survive into
// the labels: Canada publishes QUINTILES, so its top group is the top 20% —
// not comparable number-for-number with the US/ECB top-10% series. Vectors were
// resolved from coordinates on table 36100660 (1.2.57.11 = distribution of net
// worth, highest wealth quintile, etc.). Data is Q4-only before 2020, fully
// quarterly after — the gap is real, not a fetch bug.
// UK, Japan and Australia have no keyless distributional feed at all (ONS ships
// Excel only, e-Stat wants a key, ABS carries nothing) — they end at a handful
// of OECD survey years and cannot support charts like these.
const CAN = [
    ['CAN_T20', 1277969108, 1],        // top wealth quintile share of net worth, %
    ['CAN_B20', 1277968976, 1],        // bottom wealth quintile share, %
    ['CAN_TINC20', 1277968091, 1],     // top INCOME quintile share of net worth, %
    ['CAN_MEAN', 1277967937, 1e-3],    // mean net worth per household, CAD -> k$
];
try {
    const r = await fetch('https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(CAN.map(([, v]) => ({ vectorId: v, latestN: 70 }))),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    // The response array is NOT in request order (WDS returns vectors sorted by
    // id) — indexing positionally handed every series its neighbour's data, with
    // the mean-dollars vector landing under the "top quintile share" label.
    // Match on the vectorId echoed in each response object.
    const byVec = new Map(arr.map(x => [String(x?.object?.vectorId), x]));
    let ok = 0;
    for (let i = 0; i < CAN.length; i++) {
        const [id, vec, scale] = CAN[i];
        const pts = (byVec.get(String(vec))?.object?.vectorDataPoint || [])
            .map(p => ({ d: p.refPer, v: p.value != null ? p.value * scale : null }))
            .filter(o => o.v != null && isFinite(o.v))
            .sort((a, b) => a.d.localeCompare(b.d));
        if (pts.length < 8) { console.error(`intl: ${id} only ${pts.length} obs — skipped`); continue; }
        writeFileSync(DATA + id + '.json', JSON.stringify({ id, fetchedAt: new Date().toISOString(), obs: pts }));
        ok++;
    }
    console.log(`intl: wrote ${ok} Canadian distributional series (StatCan WDS)`);
} catch (e) { console.error('intl: StatCan failed —', e.message); }
