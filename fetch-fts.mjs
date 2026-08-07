// Fetches 4-5 years of annual statement history for the TOP screener candidates
// only (~300 tickers), via Yahoo fundamentalsTimeSeries — one request per ticker.
// Powers the dilution check (share count trend) and the earnings-quality check
// (operating cash flow vs reported profit). Cached 7 days in data-screener/fts/.
// Reads fts-list.json written by build-screener.mjs; run AFTER a build.
// Usage: node fetch-fts.mjs [--force]
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';

const DIR = new URL('./data-screener/fts/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const force = process.argv.includes('--force');
const fresh = (f, ms) => existsSync(f) && (Date.now() - statSync(f).mtimeMs) < ms;

let list = [];
try { list = JSON.parse(readFileSync(new URL('../../fts-list.json', DIR), 'utf8')); } catch (_) {
    console.log('no fts-list.json yet — run build-screener.mjs first'); process.exit(0);
}
console.log(`statement history for ${list.length} top candidates`);

const { default: YF } = await import('yahoo-finance2');
const yf = new YF({ suppressNotices: ['yahooSurvey'] });
const period1 = new Date(Date.now() - 5.2 * 365.25 * 86400e3).toISOString().slice(0, 10);

let ok = 0, cached = 0, failed = 0;
const queue = [...list];
async function worker() {
    for (;;) {
        const sym = queue.shift();
        if (!sym) return;
        const f = new URL(`./${sym.replace(/[^A-Za-z0-9.-]/g, '_')}.json`, DIR);
        if (!force && fresh(f, 7 * 86400e3)) { cached++; continue; }
        try {
            const rows = await yf.fundamentalsTimeSeries(sym.replace(/[./]/g, '-'), {
                period1, type: 'annual', module: 'all',
            });
            // v3 returns UNPREFIXED field names; oldest requested year often comes
            // back without share data — keep only rows that have it.
            const years = (rows || [])
                .map(r => ({
                    date: (r.date instanceof Date ? r.date.toISOString() : String(r.date)).slice(0, 10),
                    shares: r.ordinarySharesNumber ?? null,
                    ocf: r.operatingCashFlow ?? null,
                    ni: r.netIncomeFromContinuingOperations ?? r.netIncome ?? null,
                }))
                .filter(y => y.shares != null || y.ocf != null || y.ni != null)
                .sort((a, b) => a.date.localeCompare(b.date));
            writeFileSync(f, JSON.stringify({ sym, fetchedAt: new Date().toISOString(), years }));
            ok++;
        } catch (e) { failed++; }
        await new Promise(r => setTimeout(r, 200));
    }
}
await Promise.all(Array.from({ length: 3 }, worker));
console.log(`done: fetched ${ok}, cached ${cached}, failed ${failed}. Re-run build-screener.mjs to apply.`);
