// Fetches fundamentals for the US-listed universe via Yahoo (no key).
// Universe list: NASDAQ screener feed (all exchanges), S&P 500 GitHub fallback.
// Per-ticker fundamentals cached 20h in data-screener/ so re-runs resume.
// Usage: node fetch-screener.mjs [--force]
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';

const DIR = new URL('./data-screener/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const force = process.argv.includes('--force');
const fresh = (f, ms) => existsSync(f) && (Date.now() - statSync(f).mtimeMs) < ms;

// ── universe: all US-listed common stocks ≥ $50M cap (mega → micro) ─────────
// Primary: NASDAQ's public screener feed (covers NASDAQ + NYSE + AMEX).
// Fallback: S&P 500 constituents from GitHub if NASDAQ blocks us.
const UNI_FILE = new URL('./universe.json', DIR);
const MIN_CAP = 50e6;

// The NASDAQ name field spells out non-common listings — preferreds, baby
// bonds, depositary shares. None of these should be scored as stocks.
const NOT_COMMON_NAME = /\b(preferred|preference|depositary sh|notes due|due 20\d\d|% (senior|fixed|cum)|subordinated|debenture)\b/i;

async function universeNasdaq() {
    const res = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`nasdaq HTTP ${res.status}`);
    const body = await res.json();
    const rows = body?.data?.rows;
    if (!Array.isArray(rows) || rows.length < 500) throw new Error('nasdaq feed shape changed');
    return rows.map(r => ({
        sym: (r.symbol || '').trim(),
        name: r.name,
        sector: r.sector || '',
        cap: parseFloat(String(r.marketCap || '').replace(/,/g, '')) || 0,
    })).filter(r =>
        r.sym && /^[A-Z]{1,5}([./][A-Z])?$/.test(r.sym) &&   // allow class shares: BRK/B, BF.B
        !(r.sym.length === 5 && /[WRU]$/.test(r.sym)) &&      // warrants/rights/units
        !NOT_COMMON_NAME.test(r.name || '') &&                 // preferreds / baby bonds
        r.sector &&                                             // funds/ETFs have no sector
        r.cap >= MIN_CAP
    );
}

async function universeSp500() {
    const res = await fetch('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv');
    if (!res.ok) throw new Error(`universe HTTP ${res.status}`);
    const lines = (await res.text()).trim().split(/\r?\n/);
    const head = lines[0].split(',');
    const iSym = head.findIndex(h => /symbol/i.test(h));
    const iName = head.findIndex(h => /security|name/i.test(h));
    const iSec = head.findIndex(h => /sector/i.test(h));
    return lines.slice(1).map(l => {
        const cols = l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, ''));
        return { sym: cols[iSym], name: cols[iName], sector: cols[iSec], cap: 0 };
    }).filter(r => r.sym);
}

// The NASDAQ feed omits class-share listings entirely (verified: zero dot/slash
// symbols in the feed), so the majors are supplemented by hand.
const CLASS_SHARES = [
    { sym: 'BRK/B', name: 'Berkshire Hathaway Inc. Class B', sector: 'Financial Services', cap: 1e12 },
    { sym: 'BF/B', name: 'Brown-Forman Corporation Class B', sector: 'Consumer Staples', cap: 15e9 },
    { sym: 'HEI/A', name: 'HEICO Corporation Class A', sector: 'Industrials', cap: 30e9 },
    { sym: 'LEN/B', name: 'Lennar Corporation Class B', sector: 'Consumer Discretionary', cap: 30e9 },
];

async function universe() {
    // The S&P-500 fallback must not poison the cache for a week: if the cached
    // universe came from the fallback, retry NASDAQ after 6 hours instead of 7 days.
    if (!force && existsSync(UNI_FILE)) {
        try {
            const cached = JSON.parse(readFileSync(UNI_FILE, 'utf8'));
            const rows = Array.isArray(cached) ? cached : cached.rows;       // legacy plain-array format
            const source = Array.isArray(cached) ? 'nasdaq' : cached.source;
            const maxAge = source === 'nasdaq' ? 7 * 86400e3 : 6 * 3600e3;
            if (fresh(UNI_FILE, maxAge) && Array.isArray(rows) && rows.length) return rows;
        } catch (_) {}
    }
    let rows, source = 'nasdaq';
    try { rows = await universeNasdaq(); console.log(`universe: NASDAQ feed, ${rows.length} common stocks >= $50M`); }
    catch (e) {
        console.log(`NASDAQ universe failed (${e.message}) - falling back to S&P 500 (retries NASDAQ in 6h)`);
        rows = await universeSp500(); source = 'sp500';
    }
    const have = new Set(rows.map(r => r.sym));
    for (const s of CLASS_SHARES) if (!have.has(s.sym)) rows.push(s);
    writeFileSync(UNI_FILE, JSON.stringify({ source, rows }, null, 1));
    return rows;
}

// ── fundamentals ────────────────────────────────────────────────────────────
let yf = null;
async function fundamentals(sym) {
    if (!yf) { const { default: YF } = await import('yahoo-finance2'); yf = new YF({ suppressNotices: ['yahooSurvey'] }); }
    const q = await yf.quoteSummary(sym.replace(/[./]/g, '-'), {     // BRK/B and BF.B -> BRK-B / BF-B (Yahoo's format)
        modules: ['price', 'summaryDetail', 'financialData', 'defaultKeyStatistics', 'assetProfile', 'netSharePurchaseActivity'],
    }, { validateResult: false });   // insider module often arrives partial; take what exists rather than rejecting the ticker
    const p = q.price || {}, sd = q.summaryDetail || {}, fd = q.financialData || {}, ks = q.defaultKeyStatistics || {};
    const ap = q.assetProfile || {}, ins = q.netSharePurchaseActivity || {};
    const pct = (v) => v != null ? v * 100 : null;
    return {
        price: p.regularMarketPrice, marketCap: p.marketCap,
        quoteType: p.quoteType ?? null,
        // Yahoo's classification is far more accurate than the NASDAQ feed's
        ySector: ap.sector ?? null, industry: ap.industry ?? null,
        employees: ap.fullTimeEmployees ?? null,
        isCefText: /closed-?end/i.test(ap.longBusinessSummary ?? ''),
        pe: sd.trailingPE ?? null, fwdPe: ks.forwardPE ?? null,
        pb: ks.priceToBook ?? null,
        bvps: ks.bookValue ?? null,               // book value per share — cross-check for corrupted P/B
        totalRev: fd.totalRevenue ?? null,
        divYield: sd.dividendYield != null ? sd.dividendYield * 100 : 0,
        roe: pct(fd.returnOnEquity),
        de: fd.debtToEquity ?? null,               // percent, e.g. 45.3 = 0.45x; NEGATIVE = negative equity
        fcf: fd.freeCashflow ?? null,
        margin: pct(fd.profitMargins),
        // quality
        roa: pct(fd.returnOnAssets),
        grossM: pct(fd.grossMargins),
        opM: pct(fd.operatingMargins),
        currentRatio: fd.currentRatio ?? null,
        revG: pct(fd.revenueGrowth),
        earnG: pct(fd.earningsGrowth),
        // valuation extras
        evEbitda: ks.enterpriseToEbitda ?? null,
        ps: ks.enterpriseToRevenue ?? null,
        peg: ks.pegRatio ?? null,
        // momentum & risk
        w52: pct(ks['52WeekChange']),
        high52: sd.fiftyTwoWeekHigh ?? null,
        beta: ks.beta ?? null,
        shortPct: pct(ks.shortPercentOfFloat),
        insiders: pct(ks.heldPercentInsiders),
        // insider activity, last 6 months (buys predict; sales mostly don't)
        insBuys: ins.buyInfoCount ?? null,
        insSells: ins.sellInfoCount ?? null,
        insNetPct: pct(ins.netPercentInsiderShares),
    };
}

const uni = await universe();
console.log(`universe: ${uni.length} symbols`);
let ok = 0, cached = 0, failed = 0;
const failures = [];
const CONC = 4;
const queue = [...uni];
async function worker() {
    for (;;) {
        const t = queue.shift();
        if (!t) return;
        const f = new URL(`./${t.sym.replace(/[^A-Za-z0-9.-]/g, '_')}.json`, DIR);
        if (!force && fresh(f, 20 * 3600e3)) { cached++; continue; }
        let data = null, lastErr = null;
        for (let attempt = 0; attempt < 2 && !data; attempt++) {
            try { data = await fundamentals(t.sym); }
            catch (e) {
                lastErr = e;
                if (/429|too many|rate/i.test(e.message || '')) await new Promise(r => setTimeout(r, 60000));
                else if (attempt === 0) await new Promise(r => setTimeout(r, 2000));  // transient junk responses succeed on retry
            }
        }
        if (data) {
            writeFileSync(f, JSON.stringify({ ...t, ...data, fetchedAt: new Date().toISOString() }));
            ok++;
            if ((ok + failed) % 50 === 0) console.log(`  ...${ok + failed + cached}/${uni.length}`);
        } else {
            failed++;
            failures.push({ sym: t.sym, msg: String(lastErr?.message || lastErr).slice(0, 120) });
        }
        await new Promise(r => setTimeout(r, 150));
    }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(new URL('./failures.json', DIR), JSON.stringify({ at: new Date().toISOString(), failures }, null, 1));
if (failures.length) console.log(`failed tickers (${failures.length}, logged to failures.json):`, failures.slice(0, 10).map(x => x.sym).join(', '));
console.log(`done: fetched ${ok}, cached ${cached}, failed ${failed}. Now run: node build-screener.mjs`);
