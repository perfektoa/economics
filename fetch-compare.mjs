// Cross-country indicators for the "Assumptions Worth Checking" section.
// Writes compare.json: one record per country per source.
//
// Hard rule enforced here: NEVER mix sources within a single comparison. World
// Bank and Eurostat both publish a "Gini" and they disagree by 4+ points for the
// same country (Germany: WB 33.7, Eurostat 29.5) because they use different
// equivalence scales and pre/post-tax definitions. Correlating a WB indicator
// against a Eurostat one would manufacture a relationship out of methodology.
// Each pair in the dashboard therefore declares which source block it reads.
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';

const OUT = new URL('./compare.json', import.meta.url);
if (!process.argv.includes('--force') && existsSync(OUT) && (Date.now() - statSync(OUT).mtimeMs) < 6 * 24 * 3600 * 1000) {
    console.log('compare: cache is fresh (annual data, 6-day cache)'); process.exit(0);
}

// ── World Bank: global, one consistent methodology ──────────────────────────
// mrnev=1 = most recent non-empty value per country. Latest years differ by
// country (US Gini 2024, Germany 2022) — that is the price of coverage and the
// dashboard prints the year alongside each point.
// Some indicators live outside the default database and 400 without an explicit
// &source — health expenditure is one, so the source id travels with the code.
const WB = {
    gini: 'SI.POV.GINI',
    gdpPerCapita: 'NY.GDP.PCAP.CD',
    lifeExpectancy: 'SP.DYN.LE00.IN',
    unemployment: 'SL.UEM.TOTL.ZS',
    urbanPct: 'SP.URB.TOTL.IN.ZS',
    healthSpend: ['SH.XPD.CHEX.GD.ZS', '&source=2'],
};
// Aggregates ("North America", "OECD members", "Post-demographic dividend") carry
// ordinary 3-letter codes in the data feed, so a length check does NOT exclude
// them — they slipped into a first run and sat among the top health spenders.
// The country registry marks them with region.id === 'NA'; that is the only
// reliable filter. An aggregate inside a country-level correlation is a real
// error: it double-counts its members and drags every scatter toward the mean.
const realCountries = new Set();
try {
    const cr = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
    const cj = await cr.json();
    for (const c of (cj[1] || [])) if (c.region?.id && c.region.id !== 'NA') realCountries.add(c.id);
    console.log(`compare: ${realCountries.size} real countries (aggregates excluded)`);
} catch (e) { console.error('compare: country registry failed —', e.message); }

const wb = {};
for (const [key, spec] of Object.entries(WB)) {
    const [ind, extra = ''] = Array.isArray(spec) ? spec : [spec];
    // Multi-country "USA;DEU" syntax returns an error page from this API, so we
    // pull all countries and filter locally.
    const r = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&per_page=400&mrnev=1${extra}`);
    if (!r.ok) { console.error(`compare: WB ${ind} HTTP ${r.status}`); continue; }
    const j = await r.json();
    for (const row of (j[1] || [])) {
        if (row.value == null || !row.countryiso3code) continue;
        if (realCountries.size && !realCountries.has(row.countryiso3code)) continue;
        const c = (wb[row.countryiso3code] ||= { iso: row.countryiso3code, name: row.country?.value });
        c[key] = +row.value;
        c[key + 'Year'] = row.date;
    }
    await new Promise(res => setTimeout(res, 200));
}

// ── Eurostat: EU-only, its own consistent methodology ───────────────────────
// Dimensions differ per dataset and guessing them returns
// "INVALID_QUERY_DIMENSION". Each entry below carries the dimensions that
// dataset actually declares, discovered from its own structure.
const ES_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/';
const ES = [
    ['homeownership', 'ilc_lvho02', { rskpovth: 'TOTAL', hhcomp: 'TOTAL', tenure: 'OWN', unit: 'PC' }],
    ['ownOutright', 'ilc_lvho02', { rskpovth: 'TOTAL', hhcomp: 'TOTAL', tenure: 'OWN_NL', unit: 'PC' }],
    // INCOME gini. Kept distinct from wealth gini below on purpose: correlating
    // homeownership against this one says "no relationship", against wealth it
    // says the opposite, and conflating the two is how that mistake gets made.
    ['incomeGini', 'ilc_di12', {}],
    // NET WEALTH gini (experimental series, 2010/2015/2020). This is the measure
    // the housing literature actually uses — housing is the middle class's main
    // asset while the top holds diversified financial portfolios, so ownership
    // spreads the main wealth asset without touching anyone's income.
    ['wealthGini', 'icw_sr_05', { stk_flow: 'WLTH_NET', unit: 'INX' }],
    ['housingCostOverburden', 'ilc_lvho07a', { rskpovth: 'TOTAL', age: 'TOTAL', sex: 'T', unit: 'PC' }],
];
const eu = {};
for (const [key, ds, dims] of ES) {
    const qs = new URLSearchParams({ format: 'JSON', ...dims });
    try {
        const r = await fetch(`${ES_BASE}${ds}?${qs}`);
        if (!r.ok) { console.error(`compare: eurostat ${ds}/${key} HTTP ${r.status}`); continue; }
        const j = await r.json();
        if (!j.dimension?.geo) { console.error(`compare: eurostat ${ds}/${key} unexpected shape`); continue; }
        // JSON-stat: values are keyed by a flat index over the dimension product.
        // Walk it by recovering each dimension's position from the index maps.
        const dimIds = j.id, sizes = j.size;
        const cats = dimIds.map(d => {
            const c = j.dimension[d].category;
            const inv = []; for (const k in c.index) inv[c.index[k]] = k;
            return { id: d, keys: inv, labels: c.label || {} };
        });
        const geoPos = dimIds.indexOf('geo'), timePos = dimIds.indexOf('time');
        const strides = sizes.map((_, i) => sizes.slice(i + 1).reduce((a, b) => a * b, 1));
        for (const [flat, v] of Object.entries(j.value)) {
            if (v == null) continue;
            let rem = +flat; const coord = [];
            for (let i = 0; i < sizes.length; i++) { coord.push(Math.floor(rem / strides[i])); rem %= strides[i]; }
            const iso2 = cats[geoPos].keys[coord[geoPos]];
            const year = timePos >= 0 ? cats[timePos].keys[coord[timePos]] : null;
            if (!iso2 || iso2.length !== 2) continue;         // drop EU/EA aggregates
            const c = (eu[iso2] ||= { iso2, name: cats[geoPos].labels[iso2] || iso2 });
            // Keep the most recent year available per country.
            if (c[key + 'Year'] == null || year > c[key + 'Year']) { c[key] = +v; c[key + 'Year'] = year; }
        }
    } catch (e) { console.error(`compare: eurostat ${ds}/${key} ${e.message}`); }
    await new Promise(res => setTimeout(res, 300));
}

// ── OECD wealth shares via DBnomics: the Piketty-preferred measure ──────────
// Top 1% / top 10% / bottom 40% shares of household wealth. This is the
// international counterpart of the Fed's WFRB* series the US section uses, so
// the dashboard can finally say how the US concentration compares rather than
// only how it compares with its own past.
const OECD_SHARES = { top1Wealth: 'SH_TOP1', top10Wealth: 'SH_TOP10', bottom40Wealth: 'SH_BOT40' };
const oecd = {};
for (const [key, measure] of Object.entries(OECD_SHARES)) {
    try {
        const url = `https://api.db.nomics.world/v22/series/OECD/DSD_WEALTH@DF_WEALTH?dimensions=${encodeURIComponent(JSON.stringify({ MEASURE: [measure] }))}&observations=1&limit=60`;
        const r = await fetch(url);
        if (!r.ok) { console.error(`compare: OECD ${measure} HTTP ${r.status}`); continue; }
        const j = await r.json();
        for (const s of (j.series?.docs || [])) {
            const iso = s.series_code.split('.')[0];
            const per = s.period || [], val = s.value || [];
            // Latest non-null observation; countries report in different years.
            for (let i = val.length - 1; i >= 0; i--) {
                if (val[i] == null) continue;
                const c = (oecd[iso] ||= { iso, name: (s.series_name || '').split(' – ')[0] });
                c[key] = +val[i]; c[key + 'Year'] = per[i];
                break;
            }
        }
    } catch (e) { console.error(`compare: OECD ${measure} ${e.message}`); }
    await new Promise(res => setTimeout(res, 300));
}

const out = {
    fetchedAt: new Date().toISOString(),
    oecdWealth: Object.values(oecd),
    worldBank: Object.values(wb).filter(c => Object.keys(c).length > 3),
    eurostat: Object.values(eu).filter(c => c.homeownership != null || c.incomeGini != null || c.wealthGini != null),
};
writeFileSync(OUT, JSON.stringify(out));
const wbFull = out.worldBank.filter(c => c.gini != null && c.gdpPerCapita != null).length;
const euFull = out.eurostat.filter(c => c.homeownership != null && c.wealthGini != null).length;
console.log(`compare: ${out.worldBank.length} World Bank countries (${wbFull} with gini+gdp), ${out.eurostat.length} Eurostat countries (${euFull} with ownership+wealthGini)`);
