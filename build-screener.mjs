// Builds screener.html from data-screener/ — three factor scores + composite.
// Grounded in the factor literature (value + quality + momentum combos beat
// single factors; Piotroski-style quality checks; Greenblatt magic formula):
//   VALUE (0-7):    EY>=6% · P/B<1.5 · dividend · D/E<1x · ROE>=12% · FCF+ · not diluting
//   QUALITY (0-6):  ROA>=5% · gross margin>=30% · op margin>=10% ·
//                   current ratio>=1.2 · earnings growing · revenue growing
//   MOMENTUM (0-3): 52w return >0 · >10% · price within 10% of 52w high
//   TOTAL = passes. Cov = how many tests had data. "No data" is NOT a fail:
//   it doesn't score, and thin-coverage rows are greyed and sorted below.
//   MF# = Greenblatt-style rank (earnings yield + ROA).
// Educational display, not investment advice.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';

// ── commodity cycle context (real, inflation-adjusted percentiles) ──────────
// A low P/E on an energy/materials company means something very different at
// the top of the commodity cycle (peak earnings = cyclical trap) than at the
// bottom (trough earnings = hidden cheapness). Computed from the macro cache.
const MACRO_DIR = new URL('./data/', import.meta.url);
function loadMonthly(id) {
    const f = new URL(`./${id}.json`, MACRO_DIR);
    if (!existsSync(f)) return null;
    const obs = JSON.parse(readFileSync(f, 'utf8')).obs;
    const out = [];
    for (const o of obs) {
        const m = o.d.slice(0, 7);
        if (out.length && out[out.length - 1][0] === m) out[out.length - 1][1] = o.v;
        else out.push([m, o.v]);
    }
    return out;
}
function realPctile(id) {
    const cpi = loadMonthly('CPIAUCSL'), px = loadMonthly(id);
    if (!cpi || !px) return null;
    const cpiMap = new Map(cpi), cpiLast = cpi[cpi.length - 1][1];
    const real = px.map(([m, v]) => cpiMap.get(m) ? v * cpiLast / cpiMap.get(m) : null).filter(v => v != null);
    if (real.length < 24) return null;
    const last = real[real.length - 1];
    return Math.round(100 * real.filter(v => v <= last).length / real.length);
}
const oilRealP = realPctile('DCOILWTICO');
const copperRealP = realPctile('PCOPPUSDM');
const goldRealP = realPctile('YH_GOLD');
// Keyed on INDUSTRY, not sector. "Basic Materials" also contains cement,
// fertiliser and chemicals, whose earnings have nothing to do with the gold
// price — CPAC (Peruvian cement) was being flagged as a peaked gold play.
const cycleFor = (r) => {
    const ind = r.industry || '', sector = r.sector || '';
    let p = null, driver = '';
    if (/oil|gas|petroleum|refin|drilling/i.test(ind) || (/energy/i.test(sector) && !ind)) { p = oilRealP; driver = 'real oil'; }
    else if (/gold|silver|precious/i.test(ind)) { p = goldRealP; driver = 'real gold'; }
    else if (/copper|industrial metals|steel|aluminum|aluminium|mining/i.test(ind)) { p = copperRealP; driver = 'real copper'; }
    if (p == null) return null;
    if (p >= 85) return { flag: 'PEAK?', tone: 'bad', tip: `${driver} at the ${p}th percentile of inflation-adjusted history — earnings may be cyclically peaked; a low P/E here is the classic cyclical trap.` };
    if (p <= 15) return { flag: 'TROUGH', tone: 'good', tip: `${driver} at the ${p}th percentile of real history — earnings likely depressed; a high P/E here can mask trough-cycle cheapness.` };
    return { flag: 'mid', tone: 'muted', tip: `${driver} mid-range (${p}th real percentile) — commodity cycle not distorting valuations much.` };
};

// Earnings cliff: forward P/E far above trailing P/E means analysts expect
// profits to fall hard — the low trailing P/E is peak-cycle, not cheapness.
// Works for every sector (tankers on war rates, not just commodities).
// Thresholds calibrated against the universe's own distribution of fwdPe/pe
// (2,070 companies with both figures): 5th pct 0.20 · 25th 0.49 · MEDIAN 0.72
// · 75th 0.87 · 95th 1.41. Analysts are systematically optimistic, so a forward
// P/E below trailing is the NORM and means nothing. Only the tails are signal:
// 1.4 sits at the 95th percentile, 0.35 near the 12th.
const cliffFor = (r) => {
    if (!(r.pe > 0 && r.fwdPe > 0 && r.pe < 200 && r.fwdPe < 200)) return null;
    const ratio = r.fwdPe / r.pe;
    const dropPct = Math.round((1 - r.pe / r.fwdPe) * 100);
    if (ratio >= 2.0) return { flag: 'EPS↓↓', tone: 'bad', tip: `Trailing P/E ${r.pe.toFixed(1)} but forward P/E ${r.fwdPe.toFixed(1)} — analysts expect earnings to fall ~${dropPct}%. The low P/E is almost certainly peak-cycle earnings, not cheapness.` };
    if (ratio >= 1.4) return { flag: 'EPS↓', tone: 'bad', tip: `Trailing P/E ${r.pe.toFixed(1)} but forward P/E ${r.fwdPe.toFixed(1)} — analysts expect earnings to fall ~${dropPct}%. Treat the trailing P/E with suspicion. Only ~5% of companies show a gap this wide.` };
    if (ratio <= 0.35) return { flag: 'EPS↑', tone: 'good', tip: `Forward P/E ${r.fwdPe.toFixed(1)} against trailing ${r.pe.toFixed(1)} — analysts expect earnings to GROW ~${Math.round((r.pe / r.fwdPe - 1) * 100)}%. Possible trough-cycle: cheaper than the trailing P/E suggests. Note the median company sits at 0.72, so mild optimism is normal and only this tail is unusual.` };
    return null;
};

// ── statement history (top candidates only, from fetch-fts.mjs) ─────────────
const FTS_DIR = new URL('./data-screener/fts/', import.meta.url);
function ftsFor(sym) {
    const f = new URL(`./${sym.replace(/[^A-Za-z0-9.-]/g, '_')}.json`, FTS_DIR);
    if (!existsSync(f)) return null;
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; }
}

const DIR = new URL('./data-screener/', import.meta.url);
const rows = [];
const warned = [];
for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.json') || f === 'universe.json' || f === 'failures.json') continue;
    try {
        const r = JSON.parse(readFileSync(new URL(`./${f}`, DIR), 'utf8'));
        if (!r.sym || r.price == null) continue;
        // Drop data older than 4 days (symbols that left the universe stop refreshing)
        if (r.fetchedAt && (Date.now() - Date.parse(r.fetchedAt)) > 4 * 86400e3) continue;
        // Prefer Yahoo's sector/industry over the frequently-wrong NASDAQ labels
        r.sector = r.ySector || r.sector;
        // Non-common-stock listings: ETFs, mutual funds, anything Yahoo says isn't equity
        if (r.quoteType && r.quoteType !== 'EQUITY') continue;
        // Closed-end funds: Yahoo files them under Asset Management with no
        // employees and a "closed-end" description. Real managers (BLK) have staff.
        if (r.industry === 'Asset Management' && ((r.employees == null || r.employees === 0) || r.isCefText)) continue;
        // Old heuristic, demoted to a warning so no bank ever silently vanishes:
        if (r.grossM === 100 || ((r.grossM === 0 || r.grossM == null) && !(r.opM > 0))) {
            if (r.industry == null) { warned.push(r.sym); continue; }   // no profile data to overrule it — keep old behavior
            // has a real industry -> trust the profile, keep the row
        }
        // Corrupted ratios: cross-check P/B against price ÷ book-value-per-share
        // (catches 10x unit errors that land inside the plausible range), then
        // magnitude bounds as a backstop. Same for EV/Revenue vs marketCap/revenue.
        if (r.pb != null && r.bvps > 0) {
            const computed = r.price / r.bvps;
            const ratio = Math.max(r.pb, computed) / Math.min(r.pb, computed);
            if (ratio > 1.5) { warned.push(`${r.sym}:pb`); r.pb = computed > 0 && computed < 200 ? +computed.toFixed(2) : null; }
        }
        if (r.pb != null && (r.pb > 200 || r.pb < 0)) r.pb = null;
        if (r.ps != null && r.totalRev > 0 && r.marketCap > 0) {
            const computed = r.marketCap / r.totalRev;
            if (Math.max(r.ps, computed) / Math.min(r.ps, computed) > 10) { warned.push(`${r.sym}:ps`); r.ps = null; }
        }
        if (r.ps != null && (r.ps > 200 || r.ps < 0)) r.ps = null;
        if (r.evEbitda != null && (r.evEbitda > 500 || r.evEbitda < 0)) r.evEbitda = null;
        if (r.divYield > 25) r.divYield = 0;      // Yahoo occasionally returns fraction/percent mixups
        // Foreign issuers report earnings in their home currency while the price
        // is quoted in dollars, so any ratio dividing a dollar price by a
        // local-currency figure comes out several times too low. Verified on PAGS:
        // reported forward P/E 1.00 and yield 10.9% against real values of ~6.2
        // and ~1.3%. A forward P/E under 2 would mean the company earns half its
        // market value next year — that is always the artifact, never a forecast,
        // and left alone it produces a FALSE "earnings about to soar" flag.
        const fxSuspect = r.fwdPe != null && r.fwdPe > 0 && r.fwdPe < 2;
        r.paysDiv = (r.divYield || 0) > 0;        // the boolean survives; the yield number does not
        if (fxSuspect) {
            warned.push(`${r.sym}:fx`);
            r.fxSuspect = true;
            r.fwdPe = null; r.evEbitda = null; r.ps = null; r.divYield = null;
        }
        // Same artifact seen alone: an enterprise worth less than one year of its
        // own cash earnings. Meaningless whether it is an error or not.
        if (r.evEbitda != null && r.evEbitda < 1) { warned.push(`${r.sym}:evEbitda`); r.evEbitda = null; }

        // Statement history (top candidates only): dilution + earnings quality
        const fts = ftsFor(r.sym);
        r.shCagr = null; r.accrual = null;
        const isFin = /financial services/i.test(r.sector || '') || /REIT/i.test(r.industry || '');
        if (fts?.years?.length) {
            const sh = fts.years.filter(y => y.shares > 0);
            if (sh.length >= 2) {
                const span = (Date.parse(sh[sh.length - 1].date) - Date.parse(sh[0].date)) / (365.25 * 86400e3);
                if (span >= 1.5) r.shCagr = +((Math.pow(sh[sh.length - 1].shares / sh[0].shares, 1 / span) - 1) * 100).toFixed(1);
            }
            if (!isFin) {
                const last = [...fts.years].reverse().find(y => y.ocf != null && y.ni != null && y.ni > 0);
                if (last) r.accrual = last.ocf < 0.8 * last.ni;
            }
        }

        // Tri-state tests: [label, true|false|null] — null = no data, not counted.
        // Banks/insurers/REITs: gross margin, current ratio and D/E are reporting
        // conventions, not quality signals (Piotroski excluded financials too).
        const T = (has, cond) => has ? cond : null;
        const vTests = [
            ['Earnings yield >= 6%', T(r.pe != null, r.pe > 0 && (100 / r.pe) >= 6)],
            ['P/B < 1.5', T(r.pb != null, r.pb > 0 && r.pb < 1.5)],
            ['Pays a dividend', r.paysDiv],
            ['Debt/Equity < 1x (positive equity)', isFin ? null : T(r.de != null, r.de >= 0 && r.de < 100)],
            ['ROE >= 12% (real equity)', T(r.roe != null, r.roe >= 12 && (r.de == null || r.de >= 0))],
            ['Positive free cash flow', T(r.fcf != null, r.fcf > 0)],
            ['Not diluting >5%/yr', T(r.shCagr != null, r.shCagr <= 5)],
        ];
        const qTests = [
            ['ROA >= 5%', T(r.roa != null, r.roa >= 5)],
            ['Gross margin >= 30%', isFin ? null : T(r.grossM != null && r.grossM !== 0 && r.grossM !== 100, r.grossM >= 30)],
            ['Operating margin >= 10%', T(r.opM != null, r.opM >= 10)],
            ['Current ratio >= 1.2', isFin ? null : T(r.currentRatio != null, r.currentRatio >= 1.2)],
            ['Earnings growing', T(r.earnG != null, r.earnG > 0)],
            ['Revenue growing', T(r.revG != null, r.revG > 0)],
        ];
        const nearHigh = r.high52 != null && r.price != null ? r.price >= 0.9 * r.high52 : null;
        const mTests = [
            ['52w return positive', T(r.w52 != null, r.w52 > 0)],
            ['52w return > 10%', T(r.w52 != null, r.w52 > 10)],
            ['Within 10% of 52w high', nearHigh],
        ];
        const score = (t) => t.filter(x => x[1] === true).length;
        const answerable = (t) => t.filter(x => x[1] !== null).length;
        const tip = (t) => t.map(x => (x[1] === null ? 'n/a   ' : x[1] ? 'PASS  ' : 'fail  ') + x[0]).join('\n');
        const v = score(vTests), q = score(qTests), m = score(mTests);
        rows.push({
            ...r, v, q, m,
            vTip: tip(vTests), qTip: tip(qTests), mTip: tip(mTests),
            total: v + q + m,
            cov: answerable(vTests) + answerable(qTests) + answerable(mTests),
            covOk: (answerable(vTests) + answerable(qTests) + answerable(mTests)) >= 9,
            isFin,
        });
    } catch (_) {}
}
if (warned.length) console.log(`data-quality warnings (${warned.length}): ${warned.slice(0, 12).join(', ')}${warned.length > 12 ? '…' : ''}`);
if (rows.length < 1000) console.log(`*** WARNING: only ${rows.length} rows — universe may have fallen back to S&P 500. Check data-screener/universe.json and failures.json. ***`);

// Style tags: a P/E-4 deep-value name and a P/E-60 quality compounder are
// different animals; the tag makes the two populations visibly distinct.
for (const r of rows) {
    r.style = (r.v >= 5 && r.pe > 0 && r.pe < 12 && r.pb != null && r.pb < 1.5) ? 'DEEP VALUE'
        : (r.q >= 5 && r.m >= 2 && r.roe >= 15 && (r.pe == null || r.pe >= 15)) ? 'COMPOUNDER'
        : (r.q >= 4 && r.peg != null && r.peg > 0 && r.peg < 1.5) ? 'GARP'
        : '';
}

// Greenblatt-style rank: cheap (earnings yield) + good (ROA as ROIC proxy)
const mfEligible = rows.filter(r => r.pe > 0 && r.roa != null && (r.marketCap || 0) >= 50e6);
const byEy = [...mfEligible].sort((a, b) => a.pe - b.pe);              // lowest P/E = highest earnings yield; stable for ties
const byRoa = [...mfEligible].sort((a, b) => b.roa - a.roa || a.pe - b.pe);
const eyRank = new Map(byEy.map((r, i) => [r.sym, i + 1]));
const roaRank = new Map(byRoa.map((r, i) => [r.sym, i + 1]));
mfEligible.sort((a, b) => (eyRank.get(a.sym) + roaRank.get(a.sym)) - (eyRank.get(b.sym) + roaRank.get(b.sym)) || a.pe - b.pe);
mfEligible.forEach((r, i) => r.mf = i + 1);

// Default order: full-coverage rows first, then Total, then size — a sparse
// 6-of-8 must never outrank a solid 11-of-15.
rows.sort((a, b) => (b.covOk - a.covOk) || (b.total - a.total) || ((b.marketCap || 0) - (a.marketCap || 0)));
const sectors = [...new Set(rows.map(r => r.sector).filter(Boolean))].sort();
const asOf = new Date().toISOString().slice(0, 16).replace('T', ' ');
const capBucket = (c) => c == null ? '' : c >= 200e9 ? 'Mega' : c >= 10e9 ? 'Large' : c >= 2e9 ? 'Mid' : c >= 300e6 ? 'Small' : 'Micro';
rows.forEach(r => r.bucket = capBucket(r.marketCap));

// Concentration: when several top names share one industry, the list is
// showing one bet several times, not several ideas.
const topSlice = rows.filter(r => r.covOk && r.total >= 10).slice(0, 50);
const byInd = new Map();
for (const r of topSlice) {
    if (!r.industry) continue;
    if (!byInd.has(r.industry)) byInd.set(r.industry, []);
    byInd.get(r.industry).push(r);
}
const clusters = [...byInd.entries()].filter(([, list]) => list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
const clusterOf = new Map();
for (const [ind, list] of clusters) for (const r of list) clusterOf.set(r.sym, { ind, n: list.length, best: list[0].sym });
rows.forEach(r => { r.cluster = clusterOf.get(r.sym) ?? null; });
const clusterBanner = clusters.length
    ? clusters.map(([ind, list]) => `${list.length} of the top ${topSlice.length} are ${ind} (${list.map(x => x.sym).join(', ')})`).join(' · ')
    : '';

// Cycle flags must exist on the row before the risk verdict reads them.
// Both can be true at once and each says something different, so keep both
// rather than letting one hide the other (a PEAK? on CPAC was masking an
// EPS↓↓ that mattered far more).
rows.forEach(r => {
    const c = cycleFor(r);
    r.cyc = (c && c.flag !== 'mid') ? c : (cliffFor(r) ?? c);
    r.cyc2 = (c && c.flag !== 'mid') ? cliffFor(r) : null;
});

// ── manual research notes ───────────────────────────────────────────────────
// The screener reads numbers. Pending takeovers, expiring contracts, lawsuits
// and accounting problems live in sentences, and three of this week's traps
// were invisible to every column here. notes.json is where those findings get
// written down so the tool stops re-recommending something already ruled out.
let NOTES = {};
try { NOTES = JSON.parse(readFileSync(new URL('./notes.json', import.meta.url), 'utf8')).notes || {}; } catch (_) {}
rows.forEach(r => { r.note = NOTES[r.sym] || null; });

// ── one-line risk verdict ───────────────────────────────────────────────────
// The table has ten numeric columns. This compresses the warnings into a single
// readable phrase so a row can be judged without reading across.
function riskOf(r) {
    const flags = [];
    // A researched finding outranks anything the numbers say.
    if (r.note?.verdict === 'avoid') return { tone: 'bad', text: 'RESEARCHED: ' + r.note.text, all: r.note.detail || r.note.text, researched: true };
    if (r.cyc?.flag === 'EPS↓↓' || r.cyc2?.flag === 'EPS↓↓') flags.push(['sev', 'earnings set to halve']);
    else if (r.cyc?.flag === 'EPS↓' || r.cyc2?.flag === 'EPS↓') flags.push(['sev', 'earnings set to fall']);
    if (r.shCagr != null && r.shCagr >= 5) flags.push(['sev', `printing shares +${r.shCagr}%/yr`]);
    if (r.accrual) flags.push(['sev', 'profit not cash-backed']);
    if (r.cyc?.flag === 'PEAK?') flags.push(['warn', 'commodity at a peak']);
    if (r.shortPct != null && r.shortPct >= 15) flags.push(['warn', `${r.shortPct.toFixed(0)}% shorted`]);
    if (r.de != null && r.de >= 200) flags.push(['warn', `debt ${(r.de / 100).toFixed(1)}x equity`]);
    if (r.cluster) flags.push(['warn', `crowded: ${r.cluster.n} similar names`]);
    if (r.note?.verdict === 'watch') flags.push(['warn', 'RESEARCHED: ' + r.note.text]);
    if (!flags.length) {
        if (r.cyc?.flag === 'EPS↑') return { tone: 'good', text: 'earnings set to rise' };
        return { tone: 'muted', text: 'nothing flagged — but nothing researched either' };
    }
    const sev = flags.filter(f => f[0] === 'sev');
    const shown = (sev.length ? sev : flags).map(f => f[1]);
    const all = flags.map(f => f[1]).join('\n') + (r.note?.detail ? '\n\n' + r.note.detail : '');
    return { tone: sev.length ? 'bad' : 'warn', text: shown.slice(0, 2).join(' · '), all, researched: !!r.note };
}
rows.forEach(r => { r.risk = riskOf(r); });

// Sector median net margin, so a row's profitability reads RELATIVE at a
// glance — 8% margin is terrible for a bank and heroic for a grocer, and the
// absolute number alone keeps sending the eye to the wrong companies.
{
    const bySec = {};
    for (const r of rows) if (r.margin != null && isFinite(r.margin) && r.sector) (bySec[r.sector] ||= []).push(r.margin);
    const med = {};
    for (const [s, a] of Object.entries(bySec)) { a.sort((x, y) => x - y); med[s] = a[Math.floor(a.length / 2)]; }
    for (const r of rows) r.secMargin = med[r.sector] ?? null;
}

// ── tonight's reading list ──────────────────────────────────────────────────
// The point of a screener is to turn 4,300 companies into a handful worth
// reading about. One name per distinct bet, best-scoring, clean risk first —
// so the top of the page answers "what should I look at?" without scanning.
const themeOf = (r) => {
    const i = (r.industry || '') + ' ' + (r.name || '');
    if (/shipping|marine|tanker/i.test(i)) return 'Shipping';
    if (/gold|silver|precious/i.test(i)) return 'Gold miners';
    if (/oil|gas|petroleum|refin|drilling/i.test(i)) return 'Oil & gas';
    if (/machinery|industrial distribution|tools|specialty industrial/i.test(i)) return 'Industrial machinery';
    if (/bank|insurance|capital markets|credit|mortgage/i.test(i)) return 'Financials';
    if (/semiconductor/i.test(i)) return 'Semiconductors';
    if (/reit|real estate/i.test(i)) return 'Real estate';
    return r.industry || 'Other';
};
const pool = rows.filter(r => r.covOk && r.total >= 13 && r.note?.verdict !== 'avoid');
const seenTheme = new Map();
for (const r of pool) {
    const t = themeOf(r);
    if (!seenTheme.has(t)) seenTheme.set(t, []);
    seenTheme.get(t).push(r);
}
const readingList = [...seenTheme.entries()]
    .map(([theme, list]) => {
        // prefer a name with no severe flag; fall back to the best-scoring
        const clean = list.filter(x => x.risk.tone !== 'bad');
        const pick = (clean.length ? clean : list)[0];
        return { theme, pick, alts: list.length - 1 };
    })
    .sort((a, b) => (a.pick.risk.tone === 'bad') - (b.pick.risk.tone === 'bad') || b.pick.total - a.pick.total)
    .slice(0, 8);

// Merge news scores if fetch-news.mjs has run
let NEWS = {};
try { NEWS = JSON.parse(readFileSync(new URL('./news.json', import.meta.url), 'utf8')); } catch (_) {}
rows.forEach(r => { const n = NEWS[r.sym]; if (n) { r.news = n.score; r.newsTip = n.tip; } });

const slim = rows.map(r => ({
    sym: r.sym, name: r.name, sector: r.sector, industry: r.industry, bucket: r.bucket,
    price: r.price, marketCap: r.marketCap, pe: r.pe, fwdPe: r.fwdPe, pb: r.pb,
    margin: r.margin ?? null, secMargin: r.secMargin ?? null,
    divYield: r.divYield, roe: r.roe, de: r.de, evEbitda: r.evEbitda, peg: r.peg,
    w52: r.w52, shortPct: r.shortPct, beta: r.beta,
    v: r.v, q: r.q, m: r.m, total: r.total, cov: r.cov, covOk: r.covOk, mf: r.mf ?? null,
    fxSuspect: r.fxSuspect ?? false, paysDiv: r.paysDiv ?? false, risk: r.risk,
    style: r.style,
    shCagr: r.shCagr, accrual: r.accrual,
    insBuys: r.insBuys ?? null, insSells: r.insSells ?? null, insNetPct: r.insNetPct ?? null,
    vTip: r.vTip, qTip: r.qTip, mTip: r.mTip,
    news: r.news ?? null, newsTip: r.newsTip ?? '',
    cyc: r.cyc, cyc2: r.cyc2,
    cluster: r.cluster,
}));

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Value Screener — Real World</title>
<style>
:root { --bg:#16150f; --panel:#1e1c14; --line:#37331f; --ink:#e6e1d3; --muted:#9d9683;
  --accent:#e8b23c; --good:#4aa869; --bad:#d65344; }
* { box-sizing:border-box; }
body { background:var(--bg); color:var(--ink); font-family:Consolas,'Cascadia Mono',monospace; margin:0; padding:18px; font-size:13px; }
.wrap { max-width:1500px; margin:0 auto; }
h1 { font-size:18px; letter-spacing:1px; margin:0 0 4px; }
.sub { color:var(--muted); margin-bottom:12px; }
.controls { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px; align-items:center; }
input,select { background:var(--panel); color:var(--ink); border:1px solid var(--line); border-radius:4px; padding:4px 8px; font:inherit; }
table { border-collapse:collapse; width:100%; font-size:12.5px; }
th,td { padding:4px 7px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap; }
th { color:var(--muted); text-transform:uppercase; font-size:10px; letter-spacing:.5px; cursor:pointer; user-select:none; position:sticky; top:0; background:var(--bg); }
th:hover { color:var(--accent); }
td:nth-child(-n+4),th:nth-child(-n+4) { text-align:left; }
.sc { font-weight:700; cursor:help; }
.v { color:#4489c8; } .qq { color:#4aa869; } .mm { color:#bd8a1e; }
.total { color:var(--accent); font-size:14px; }
.num { font-variant-numeric:tabular-nums; }
.thin td { opacity:0.45; }
.styletag { font-size:10px; padding:1px 5px; border-radius:3px; border:1px solid var(--line); }
.banner { background:var(--panel); border:1px solid var(--bad); border-radius:6px; padding:8px 12px; margin-bottom:10px; color:var(--ink); }
.clusterchip { color:var(--bad); font-size:10px; vertical-align:super; cursor:help; }
footer { color:var(--muted); margin-top:18px; font-size:11px; line-height:1.6; border-top:1px solid var(--line); padding-top:10px; }
.count { color:var(--muted); margin-left:auto; }
</style></head><body><div class="wrap">
<h1>VALUE SCREENER <span style="color:var(--muted)">— real world</span></h1>
<div class="sub">${rows.length.toLocaleString()} US common stocks (mega → micro cap) · Value + Quality + Momentum scores · data ${asOf} UTC · <a href="dashboard.html" style="color:var(--accent)">economics monitor →</a></div>
${clusterBanner ? `<div class="banner"><b style="color:var(--bad)">ONE BET, SEVERAL TICKERS:</b> ${clusterBanner}. Names in one industry rise and fall together — treat each group as a single idea, not independent picks.</div>` : ''}
${readingList.length ? `<div style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin-bottom:10px;">
<div style="color:var(--accent);font-weight:700;margin-bottom:5px;">START HERE — one name per distinct bet, highest scoring, cleanest first</div>
<table style="font-size:12px;"><tbody>
${readingList.map(({ theme, pick, alts }) => `<tr>
  <td style="text-align:left;color:var(--accent);font-weight:700;width:60px;">${pick.sym}</td>
  <td style="text-align:left;color:var(--muted);width:170px;">${theme}${alts ? ` <span style="color:var(--line);">+${alts} alike</span>` : ''}</td>
  <td style="text-align:left;width:90px;">${pick.style ? `<span class="styletag" style="color:${pick.style === 'DEEP VALUE' ? '#4489c8' : pick.style === 'COMPOUNDER' ? '#4aa869' : '#bd8a1e'}">${pick.style}</span>` : ''}</td>
  <td style="text-align:left;width:80px;color:var(--muted);">T${pick.total} · P/E ${pick.pe == null ? '—' : pick.pe.toFixed(1)}</td>
  <td style="text-align:left;color:var(--${pick.risk.tone === 'bad' ? 'bad' : pick.risk.tone === 'warn' ? 'accent' : pick.risk.tone === 'good' ? 'good' : 'muted'});">${pick.risk.text}</td>
</tr>`).join('')}
</tbody></table>
<div style="font-size:11px;color:var(--muted);margin-top:5px;">The screener can only read numbers. It cannot see a pending takeover, an expiring licence, or a lawsuit — three of the traps found this week were invisible to every column here. Findings from actual reading go in <span style="color:var(--accent);">notes.json</span>, which overrides these columns and removes ruled-out names from this list${Object.keys(NOTES).length ? ` (${Object.keys(NOTES).length} recorded so far)` : ''}. Treat this as a reading list, not a verdict.</div>
</div>` : ''}
<div class="controls">
  <input id="q" placeholder="search ticker/name" style="width:170px">
  <select id="sector"><option value="">All sectors</option>${sectors.map(s => `<option>${s}</option>`).join('')}</select>
  <select id="bucket"><option value="">All caps</option><option>Mega</option><option>Large</option><option>Mid</option><option>Small</option><option>Micro</option></select>
  <select id="style"><option value="">All styles</option><option>DEEP VALUE</option><option>COMPOUNDER</option><option>GARP</option></select>
  <select id="minTotal"><option value="0">Total ≥ 0</option><option value="8">Total ≥ 8</option><option value="10" selected>Total ≥ 10</option><option value="12">Total ≥ 12</option></select>
  <span class="count" id="count"></span>
</div>
<div style="overflow-x:auto;">
<table><thead><tr>
  <th data-k="sym">Ticker</th><th data-k="name">Name</th><th data-k="sector">Sector</th><th data-k="bucket">Cap</th>
  <th data-k="style" title="DEEP VALUE = genuinely cheap on earnings and book. COMPOUNDER = high-quality with momentum, NOT cheap. GARP = growth at a reasonable price. A cheap tanker and an expensive chipmaker should not compete on one number.">Style</th>
  <th data-k="v" title="Value 0-7: earnings yield, P/B, dividend, D/E, ROE, FCF, not diluting">V</th>
  <th data-k="q" title="Quality 0-6: ROA, gross margin, op margin, current ratio, earnings growth, revenue growth. Gross margin / current ratio / D/E not asked of financials.">Q</th>
  <th data-k="m" title="Momentum 0-3: 52w return >0, >10%, near 52w high">M</th>
  <th data-k="total" title="Passes across all tests (max 16)">Total</th>
  <th data-k="marketCap">Mkt Cap</th><th data-k="pe">P/E</th><th data-k="fwdPe" title="Price divided by FORECAST earnings for next year">fP/E</th>
  <th data-k="evEbitda">EV/EBITDA</th><th data-k="pb">P/B</th><th data-k="divYield">Div</th>
  <th data-k="de" title="Debt to equity. Green under 0.5x, red above 2x.">D/E</th>
  <th data-k="margin" title="Net profit margin, coloured against the SECTOR MEDIAN — green if above it, red if below. Hover shows the sector's median, because 8% is terrible for a bank and heroic for a grocer.">NetM vs sector</th>
  <th data-k="roe">ROE</th><th data-k="w52">52w</th>
  <th title="Everything flagged on this row, compressed. Red = something serious, amber = worth knowing, green tick = nothing flagged. HOVER for the full plain-language list — the text lives in the tooltip now instead of eating the table.">⚑</th>
  <th title="Cycle context. PEAK?/TROUGH = commodity percentile for Energy/Materials. EPS↓ = analysts expect a big earnings drop — the low P/E is peak-cycle, not cheapness. ACCR = profit not backed by operating cash.">Cycle</th>
  <th data-k="insNetPct" title="Insider net buying, last 6 months. Insider BUYING has real predictive power; selling mostly doesn't.">Ins</th>
  <th data-k="news" title="Crude keyword score of recent headlines (recency-weighted). Top composite scorers only. Hover reads the actual headlines.">News</th>
  <th data-k="shCagr" title="Share count change per year over ~4y. Negative (green) = buybacks. Above +5%/yr (red) = printing shares.">ΔSh/yr</th>
  <th data-k="shortPct" title="Short interest as % of float">Short%</th>
  <th data-k="mf" title="Greenblatt-style rank: cheapest earnings yield + best ROA. 1 = best in universe.">MF#</th>
  <th data-k="cov" title="How many of the 16 tests had data. Rows with fewer than 9 answerable are greyed and sorted below.">Cov</th>
  <th data-k="peg">PEG</th><th data-k="beta">Beta</th>
</tr></thead><tbody id="tb"></tbody></table>
</div>
<footer>
Scores: <b>V</b>alue 0-7 (earnings yield ≥6%, P/B&lt;1.5, pays a dividend, debt/equity&lt;1× with positive equity, ROE≥12%, positive free cash flow, not diluting &gt;5%/yr) ·
<b>Q</b>uality 0-6 (ROA≥5%, gross margin≥30%, op margin≥10%, current ratio≥1.2, earnings &amp; revenue growing — margin/liquidity/leverage tests are not asked of banks, insurers or REITs, where they are reporting conventions rather than quality signals) ·
<b>M</b>omentum 0-3 (52w return &gt;0 / &gt;10% / within 10% of high) · MF# = Greenblatt-style cheap+good rank.
"No data" no longer counts as a failed test: Cov shows how many tests were answerable, and thin-data rows (Cov &lt; 9) are greyed and sorted below full-coverage rows.
ΔSh/yr and the ACCR flag come from 4 years of annual statements, fetched for top candidates only.
Factor research finds combined value+quality+momentum portfolios historically beat single-factor picks — that's what Total approximates.
A high score is a research candidate, not a recommendation: always ask WHY it's cheap. Educational tool; not investment advice.
</footer>
</div>
<script>
const DATA = ${JSON.stringify(slim).replace(/</g, '\\u003c')};
let sortK = 'total', sortDir = -1;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (v, d=1) => v == null || !isFinite(v) ? '—' : (+v).toLocaleString('en-US', {maximumFractionDigits:d, minimumFractionDigits:0});
const cap = (v) => v == null ? '—' : v >= 1e12 ? (v/1e12).toFixed(2)+'T' : v >= 1e9 ? (v/1e9).toFixed(1)+'B' : (v/1e6).toFixed(0)+'M';
function render() {
  const q = document.getElementById('q').value.toLowerCase();
  const sec = document.getElementById('sector').value;
  const bk = document.getElementById('bucket').value;
  const st = document.getElementById('style').value;
  const min = +document.getElementById('minTotal').value;
  let rows = DATA.filter(r => r.total >= min && (!sec || r.sector === sec) && (!bk || r.bucket === bk) && (!st || r.style === st) &&
    (!q || r.sym.toLowerCase().includes(q) || (r.name||'').toLowerCase().includes(q)));
  rows.sort((a,b) => {
    if (sortK === 'total') return sortDir * ((a.covOk - b.covOk) || (a.total - b.total) || ((a.marketCap??0) - (b.marketCap??0)));
    const av = a[sortK], bv = b[sortK];
    if (typeof av === 'string' || typeof bv === 'string') return sortDir * String(av??'').localeCompare(String(bv??''));
    return sortDir * (((av==null)-(bv==null)) || (av??0) - (bv??0));
  });
  document.getElementById('count').textContent = rows.length.toLocaleString() + ' companies';
  document.getElementById('tb').innerHTML = rows.slice(0, 800).map(r => '<tr' + (r.covOk ? '' : ' class="thin" title="Fewer than 9 of 16 tests had data — the score is not comparable with full-coverage rows"') + '>' +
    '<td style="color:var(--accent);font-weight:700">' + esc(r.sym) +
    (r.cluster ? '<span class="clusterchip" title="One of ' + r.cluster.n + ' ' + esc(r.cluster.ind) + ' names near the top — these move together; treat the group as ONE bet. Highest-scored of the group: ' + esc(r.cluster.best) + '">×' + r.cluster.n + '</span>' : '') + '</td>' +
    '<td title="' + esc(r.industry || '') + '">' + esc((r.name||'').slice(0,32)) + '</td><td style="color:var(--muted)">' + esc(r.sector||'') + '</td>' +
    '<td style="color:var(--muted)">' + esc(r.bucket) + '</td>' +
    '<td>' + (r.style ? '<span class="styletag" style="color:' + (r.style === 'DEEP VALUE' ? '#4489c8' : r.style === 'COMPOUNDER' ? '#4aa869' : '#bd8a1e') + '">' + r.style + '</span>' : '') +
      (r.fxSuspect ? ' <span class="clusterchip" title="Reports earnings in a foreign currency against a dollar share price, so forward P/E, EV/EBITDA and dividend yield came back several times too low. Those four are blanked rather than shown wrong. Trailing P/E, P/B and ROE are ratios of like-for-like figures and remain trustworthy.">FX</span>' : '') + '</td>' +
    '<td class="sc v" title="' + esc(r.vTip) + '">' + r.v + '</td>' +
    '<td class="sc qq" title="' + esc(r.qTip) + '">' + r.q + '</td>' +
    '<td class="sc mm" title="' + esc(r.mTip) + '">' + r.m + '</td>' +
    '<td class="sc total">' + r.total + '</td>' +
    '<td class="num">' + cap(r.marketCap) + '</td>' +
    '<td class="num">' + fmt(r.pe) + '</td><td class="num">' + fmt(r.fwdPe) + '</td>' +
    '<td class="num">' + fmt(r.evEbitda) + '</td><td class="num">' + fmt(r.pb,2) + '</td>' +
    '<td class="num">' + (r.divYield ? fmt(r.divYield,2)+'%' : '—') + '</td>' +
    (r.de == null ? '<td>—</td>' : '<td class="num" style="color:' + (r.de <= 50 ? 'var(--good)' : r.de >= 200 ? 'var(--bad)' : 'var(--ink)') + '">' + (r.de/100).toFixed(2) + 'x</td>') +
    (r.margin == null ? '<td>—</td>' : '<td class="num sc" style="color:' + (r.secMargin != null ? (r.margin >= r.secMargin ? 'var(--good)' : 'var(--bad)') : 'var(--ink)') + '" title="' +
        (r.secMargin != null ? esc(r.sector) + ' median ' + fmt(r.secMargin) + '% — this company ' + (r.margin >= r.secMargin ? '+' : '') + fmt(r.margin - r.secMargin) + ' points ' + (r.margin >= r.secMargin ? 'above' : 'below') : 'no sector median') + '">' +
        fmt(r.margin) + '%' + (r.secMargin != null ? ' <span style="opacity:0.65;font-size:10px">(' + (r.margin >= r.secMargin ? '+' : '') + fmt(r.margin - r.secMargin) + ')</span>' : '') + '</td>') +
    '<td class="num">' + fmt(r.roe) + '%</td>' +
    '<td class="num" style="color:' + (r.w52 > 0 ? 'var(--good)' : 'var(--bad)') + '">' + fmt(r.w52) + '%</td>' +
    // Flags, compressed to a chip: severity count with the full plain-language
    // list in the tooltip. The prose column ate half the screen and pushed
    // every actual metric off the right edge.
    (r.risk.tone === 'good' || !r.risk.all ? '<td style="color:var(--good)">✓</td>' :
      '<td class="sc" style="color:var(--' + (r.risk.tone === 'bad' ? 'bad' : 'accent') + ');font-weight:700;white-space:nowrap" title="' + esc(r.risk.all) + '">' +
      (r.risk.tone === 'bad' ? '●' : '◐') + ' ' + (r.risk.all.split('\\n').filter(Boolean).length) + '</td>') +
    ((r.cyc == null && r.cyc2 == null && !r.accrual) ? '<td>—</td>' : '<td class="sc">' +
        (r.cyc ? '<span style="color:var(--' + (r.cyc.tone === 'bad' ? 'bad' : r.cyc.tone === 'good' ? 'good' : 'muted') + ')" title="' + esc(r.cyc.tip) + '">' + r.cyc.flag + '</span>' : '') +
        (r.cyc2 ? ' <span style="color:var(--' + (r.cyc2.tone === 'bad' ? 'bad' : r.cyc2.tone === 'good' ? 'good' : 'muted') + ')" title="' + esc(r.cyc2.tip) + '">' + r.cyc2.flag + '</span>' : '') +
        (r.accrual ? ' <span style="color:var(--bad)" title="Reported profit is not backed by operating cash flow (cash < 80% of net income) — earnings quality warning (Sloan 1996)">ACCR</span>' : '') + '</td>') +
    (r.insNetPct == null || (r.insBuys === 0 && r.insSells === 0) ? '<td>—</td>' : '<td class="num sc" style="color:' + (r.insNetPct > 0 ? 'var(--good)' : r.insNetPct < 0 ? 'var(--bad)' : 'var(--muted)') + '" title="' + r.insBuys + ' insider buys, ' + r.insSells + ' sells in 6 months; net change in insider holdings ' + fmt(r.insNetPct) + '%">' + (r.insNetPct > 0 ? 'buy' : r.insNetPct < 0 ? 'sell' : 'flat') + '</td>') +
    (r.news == null ? '<td>—</td>' : '<td class="num sc" style="color:' + (r.news > 0 ? 'var(--good)' : r.news < 0 ? 'var(--bad)' : 'var(--muted)') + '" title="' + esc(r.newsTip) + '">' + (r.news > 0 ? '+' : '') + r.news + '</td>') +
    (r.shCagr == null ? '<td>—</td>' : '<td class="num" style="color:' + (r.shCagr <= -1 ? 'var(--good)' : r.shCagr >= 5 ? 'var(--bad)' : 'var(--muted)') + '">' + (r.shCagr > 0 ? '+' : '') + fmt(r.shCagr) + '%</td>') +
    '<td class="num">' + fmt(r.shortPct) + '%</td>' +
    '<td class="num">' + (r.mf ?? '—') + '</td>' +
    '<td class="num" style="color:' + (r.covOk ? 'var(--muted)' : 'var(--bad)') + '">' + r.cov + '/16</td>' +
    '<td class="num">' + fmt(r.peg,2) + '</td><td class="num">' + fmt(r.beta,2) + '</td></tr>').join('');
}
document.querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => {
  const k = th.dataset.k;
  const asc = ['sym','name','sector','bucket','mf','style'];
  sortDir = (sortK === k) ? -sortDir : (asc.includes(k) ? 1 : -1);
  sortK = k; render();
}));
['q','sector','bucket','style','minTotal'].forEach(id => document.getElementById(id).addEventListener('input', render));
render();
</script></body></html>`;

writeFileSync(new URL('./screener.html', import.meta.url), html);
// Top candidates for the news scorer (fetch-news.mjs reads this — keep format)
writeFileSync(new URL('./top-list.json', import.meta.url),
    JSON.stringify(rows.filter(r => r.covOk && r.total >= 9).slice(0, 150).map(r => r.sym)));
// Top candidates for statement history (fetch-fts.mjs): score leaders + best MF ranks
const ftsSet = new Set(rows.filter(r => r.covOk && r.total >= 9).slice(0, 300).map(r => r.sym));
for (const r of mfEligible.slice(0, 300)) ftsSet.add(r.sym);
writeFileSync(new URL('./fts-list.json', import.meta.url), JSON.stringify([...ftsSet]));
console.log(`screener.html written — ${rows.length} companies; Total>=10: ${rows.filter(r => r.total >= 10).length}, >=12: ${rows.filter(r => r.total >= 12).length}; clusters: ${clusters.length ? clusters.map(([i, l]) => `${i} x${l.length}`).join(', ') : 'none'}; MF top: ${mfEligible.slice(0, 5).map(r => r.sym).join(', ')}`);
