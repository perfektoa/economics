// Builds calendar.json: upcoming major economic releases (next 16 days) from
// FRED's official release-dates API, merged with the hardcoded FOMC schedule.
// Usage: node fetch-calendar.mjs
import { readFileSync, writeFileSync } from 'fs';

const CONFIG = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const KEY = CONFIG.fredApiKey;

const WATCH = [
    ['Consumer Price Index', 'CPI'],
    ['Employment Situation', 'Jobs Report'],
    ['Gross Domestic Product', 'GDP'],
    ['Personal Income and Outlays', 'PCE Inflation'],
    ['Producer Price Index', 'PPI'],
    ['Advance Monthly Sales for Retail', 'Retail Sales'],
    ['New Residential Construction', 'Housing Starts'],
    ['Consumer Sentiment', 'Consumer Sentiment'],
];
// FOMC decision days (day 2), 2026. Sep & Dec include the dot plot.
const FOMC = [
    ['2026-01-28', 'FOMC Decision'], ['2026-03-18', 'FOMC Decision (dot plot)'],
    ['2026-04-29', 'FOMC Decision'], ['2026-06-17', 'FOMC Decision (dot plot)'],
    ['2026-07-29', 'FOMC Decision'], ['2026-09-16', 'FOMC Decision (dot plot)'],
    ['2026-10-28', 'FOMC Decision'], ['2026-12-09', 'FOMC Decision (dot plot)'],
];

const today = new Date().toISOString().slice(0, 10);
const end = new Date(Date.now() + 16 * 86400e3).toISOString().slice(0, 10);

const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${KEY}&file_type=json` +
    `&include_release_dates_with_no_data=true&sort_order=asc&order_by=release_date` +
    `&realtime_start=${today}&realtime_end=${end}&limit=1000`;
const res = await fetch(url);
if (!res.ok) { console.error(`FRED releases HTTP ${res.status}`); process.exit(1); }
const body = await res.json();

const events = [];
for (const r of body.release_dates || []) {
    const hit = WATCH.find(([name]) => (r.release_name || '').includes(name));
    if (hit && r.date >= today && r.date <= end) events.push({ date: r.date, name: hit[1], src: 'FRED' });
}
for (const [date, name] of FOMC) {
    if (date >= today && date <= end) events.push({ date, name, src: 'Fed' });
}
// dedupe (same release can list multiple dates) and sort
const seen = new Set();
const out = events.filter(e => { const k = e.date + e.name; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));

writeFileSync(new URL('./calendar.json', import.meta.url), JSON.stringify({ builtAt: today, events: out }, null, 1));
console.log(`calendar.json — ${out.length} events in the next 16 days:`);
for (const e of out) console.log(`  ${e.date}  ${e.name}`);
