// Pulls full history for every registered series from FRED into data/<ID>.json.
// Usage: node fetch-data.mjs [--force]
// ~20 requests per run (FRED allows ~120/min). Cache under 20h old is reused
// unless --force. Optional series that 404 or error are skipped with a note.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { SERIES } from './series.mjs';

const CONFIG = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const KEY = CONFIG.fredApiKey;
if (!KEY) { console.error('No fredApiKey in config.json'); process.exit(1); }

const DATA_DIR = new URL('./data/', import.meta.url);
mkdirSync(DATA_DIR, { recursive: true });
const force = process.argv.includes('--force');
// Daily-updating series get a short cache so hourly runs refresh them;
// monthly/quarterly macro series only refetch once a day.
const FAST = new Set(['T10Y2Y', 'VIXCLS', 'DCOILWTICO', 'DTWEXBGS', 'DHHNGSP', 'ECBDFR', 'BAMLH0A0HYM2', 'T5YIFR']);
const cacheMsFor = (s) => (s.src === 'yahoo' || FAST.has(s.id)) ? 50 * 60 * 1000 : 20 * 3600 * 1000;
// Yahoo series that forecast questions resolve against need daily closes, not
// just monthly bars — you cannot settle "where does oil close on Friday" from a
// monthly bar. Two years of dailies are spliced onto the long monthly history.
const DAILY_NEEDED = new Set(['YH_CL', 'YH_VIX', 'YH_GOLD', 'YH_SILVER', 'YH_HG', 'YH_SPX', 'YH_NDX', 'YH_BTC', 'YH_USDJPY']);

let yfInstance = null;
async function fetchYahoo(sym, wantDaily) {
    if (!yfInstance) {
        const { default: YahooFinance } = await import('yahoo-finance2');
        yfInstance = new YahooFinance();
    }
    // Monthly bars back to 1950 give the long history the charts and percentile
    // engine need. But a forecast question asking "where does this close on
    // Friday" cannot be settled by a monthly bar, so series used in questions
    // also get two years of DAILY closes spliced onto the end.
    const r = await yfInstance.chart(sym, { period1: '1950-01-01', interval: '1mo' });
    if (!r || !Array.isArray(r.quotes)) throw new Error('no quotes');
    let out = r.quotes
        .filter(q => q && isFinite(q.close))
        .map(q => ({ d: new Date(q.date).toISOString().slice(0, 10), v: q.close }));
    if (wantDaily) {
        const from = new Date(Date.now() - 730 * 86400e3).toISOString().slice(0, 10);
        try {
            const d = await yfInstance.chart(sym, { period1: from, interval: '1d' });
            const daily = (d?.quotes || [])
                .filter(q => q && isFinite(q.close))
                .map(q => ({ d: new Date(q.date).toISOString().slice(0, 10), v: q.close }));
            if (daily.length > 30) {
                const cut = daily[0].d;
                out = [...out.filter(o => o.d < cut), ...daily];
            }
        } catch (_) { /* keep monthly-only rather than fail the series */ }
    }
    // Dedupe by date, last wins, then sort.
    const m = new Map(out.map(o => [o.d, o.v]));
    return [...m.entries()].map(([d, v]) => ({ d, v })).sort((a, b) => a.d.localeCompare(b.d));
}

async function fetchSeries(id) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${KEY}&file_type=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body.observations)) throw new Error(body.error_message || 'no observations');
    // Keep only parseable points; FRED uses "." for missing.
    return body.observations
        .map(o => ({ d: o.date, v: parseFloat(o.value) }))
        .filter(o => isFinite(o.v));
}

let ok = 0, skipped = 0, cached = 0;
for (const s of SERIES) {
    const file = new URL(`./${s.id}.json`, DATA_DIR);
    if (!force && existsSync(file) && (Date.now() - statSync(file).mtimeMs) < cacheMsFor(s)) {
        cached++; continue;
    }
    try {
        const obs = s.src === 'yahoo' ? await fetchYahoo(s.sym, DAILY_NEEDED.has(s.id)) : await fetchSeries(s.id);
        if (obs.length === 0) throw new Error('empty series');
        writeFileSync(file, JSON.stringify({ id: s.id, fetchedAt: new Date().toISOString(), obs }));
        console.log(`ok      ${s.id.padEnd(20)} ${obs.length} obs  (${obs[0].d} .. ${obs[obs.length - 1].d})`);
        ok++;
        await new Promise(r => setTimeout(r, 250)); // stay far under rate limits
    } catch (e) {
        if (s.optional) { console.log(`skip    ${s.id.padEnd(20)} ${e.message}`); skipped++; }
        else { console.error(`FAIL    ${s.id.padEnd(20)} ${e.message}`); process.exitCode = 1; }
    }
}
console.log(`\nfetched ${ok}, cached ${cached}, skipped ${skipped} (optional). Now run: node build-dashboard.mjs`);
