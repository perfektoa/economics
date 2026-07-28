// Generates a batch of three-month questions across the whole board.
//
// Long horizons are where forecasting skill actually shows: Good Judgment found
// superforecasters more accurate at 300 days out than regular forecasters were
// at 30. Weekly questions train fast feedback; these train judgement.
//
// Two deliberate design choices:
//   1. DIVERSITY. Gold, silver and copper move together, as do the S&P and
//      breadth. A batch that is secretly one bet teaches nothing, so questions
//      are grouped by theme and the theme is shown on each one.
//   2. A SPREAD OF DIFFICULTY. Calibration cannot be trained on coin flips
//      alone — you need practice at 20% and 80% too. So roughly half are
//      "higher or lower than today" (near 50/50) and half are "does it reach
//      this level", which land anywhere from unlikely to near-certain.
//
// Usage: node generate-batch.mjs [--months 3] [--dry]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const months = +(args[args.indexOf('--months') + 1]) || 3;

const FILE = new URL('./forecasts.json', import.meta.url);
const db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { forecasts: [], retired: [] };
db.retired = db.retired || [];

const today = new Date().toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(Date.parse(d + 'T12:00') + n * 86400e3).toISOString().slice(0, 10);
const deadline = plusDays(today, Math.round(months * 30.44));
const meta = (id) => SERIES.find(s => s.id === id);

function seriesObs(id) {
    const f = new URL(`./data/${id}.json`, import.meta.url);
    if (!existsSync(f)) return null;
    const scale = meta(id)?.scale || 1;
    const obs = JSON.parse(readFileSync(f, 'utf8')).obs.filter(o => o.v != null);
    return obs.length ? obs.map(o => ({ d: o.d, v: o.v * scale })) : null;
}
const latest = (id) => { const o = seriesObs(id); return o ? o[o.length - 1].v : null; };

// Some series are DISPLAYED as year-over-year percentages but STORED as raw
// index levels, and the resolver reads the raw store. Asking "is CPI inflation
// above 3.5%" therefore needs an index threshold, not a percentage one: take
// the index from twelve months before the month this will resolve in, and
// multiply by the target rate. Getting this wrong produced "CPI YoY falls to
// 330.0%" on the first run.
const yoyOf = (obs) => {
    const map = new Map(obs.map(o => [o.d.slice(0, 7), o.v]));
    const out = [];
    for (const o of obs) {
        const prior = map.get(`${+o.d.slice(0, 4) - 1}${o.d.slice(4, 7)}`);
        if (prior) out.push({ d: o.d, v: (o.v / prior - 1) * 100 });
    }
    return out;
};
// Which month this question will actually resolve on, and the month it will be
// compared against. Naming both in the question text removes the guesswork —
// "the same month a year earlier" is not something a reader can resolve alone.
function yoyMonths(obs, monthsAhead) {
    const lastD = obs[obs.length - 1].d;
    const y = +lastD.slice(0, 4), m = +lastD.slice(5, 7) - 1;
    const target = new Date(Date.UTC(y, m + monthsAhead, 1));
    const base = new Date(Date.UTC(y, m + monthsAhead - 12, 1));
    const name = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const key = base.toISOString().slice(0, 7);
    const hit = obs.find(o => o.d.slice(0, 7) === key);
    return hit ? { base: hit.v, baseName: name(base), targetName: name(target) } : null;
}
// Round to three significant figures. Rounding by order of magnitude alone
// turned a 117 threshold into 120 — a 3% error on a 2.5% intended move.
function sig3(x) {
    if (!isFinite(x) || x === 0) return x;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(x))) - 2);
    return +(Math.round(x / mag) * mag).toPrecision(6);
}
// Market prices are dated by the trading day; economic releases by reference period.
const atFor = (id) => /^YH_|^DCOIL|^VIX|^DTWEX|^PCOPP|^DHHNG|^BAMLH|^T10Y2Y|^MORTGAGE|^DFEDTARU/.test(id) ? 'close' : 'release';

// How volatile is this series over the horizon? Used to size "reach this level"
// thresholds so they land at interesting probabilities rather than absurd ones.
function typicalMove(obs, days) {
    const gaps = [];
    for (let i = Math.max(1, obs.length - 30); i < obs.length; i++) gaps.push((Date.parse(obs[i].d) - Date.parse(obs[i - 1].d)) / 86400e3);
    gaps.sort((a, b) => a - b);
    const step = Math.max(1, Math.round(days / (gaps[Math.floor(gaps.length / 2)] || 1)));
    const moves = [];
    for (let i = step; i < obs.length; i++) moves.push(Math.abs(obs[i].v / obs[i - step].v - 1));
    if (!moves.length) return 0.1;
    moves.sort((a, b) => a - b);
    return moves[Math.floor(moves.length * 0.5)];   // median absolute move over the horizon
}

const THEMES = {
    'Rates & the Fed': ['DFEDTARU', 'T10Y2Y'],
    'Inflation': ['CPIAUCSL', 'T5YIFR'],
    'Labour market': ['UNRATE', 'ICSA'],
    'Equities': ['YH_SPX', 'YH_NDX'],
    'Precious metals': ['YH_GOLD', 'YH_SILVER'],
    // Market prices come from Yahoo, not FRED. Measured publication lags:
    // Yahoo 0 days, FRED's WTI spot 7 days, FRED's copper 56 days. A three-month
    // question resolving on two-month-old data is not a three-month question.
    'Industrial commodities': ['YH_HG', 'YH_CL'],
    // The high-yield spread exists only on FRED — Yahoo publishes no credit
    // spreads, no yield curve, no mortgage rate. Those stay where they are.
    'Credit & volatility': ['BAMLH0A0HYM2', 'YH_VIX'],
    // Case-Shiller is deliberately excluded: it runs a three-month publication
    // lag, so the base month for a year-over-year threshold cannot be pinned
    // reliably and the question could resolve wrong on a technicality.
    'Housing': ['HOUST', 'MORTGAGE30US'],
    'Dollar & abroad': ['DTWEXBGS', 'YH_USDJPY'],
    'Crypto': ['YH_BTC'],
    'Sentiment': ['UMCSENT'],
};

const have = new Set([...db.forecasts.map(f => f.id), ...db.retired]);
const added = [];
let alt = 0;

for (const [theme, ids] of Object.entries(THEMES)) {
    for (const id of ids) {
        const obs = seriesObs(id);
        const now = latest(id);
        if (!obs || now == null) { console.log(`  skip ${id} (no data)`); continue; }
        const m = meta(id);
        const label = m?.label || id;
        const unit = m?.unit === '$' ? '$' : '';
        const suffix = m?.unit && m.unit !== '$' ? m.unit : '';
        const dec = m?.dec ?? 1;
        const fmt = (v) => unit + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;

        // Alternate between a direction question and a level question so the
        // batch spans the probability range instead of clustering at 50/50.
        const isYoY = m?.kind === 'yoy';
        const yoy = isYoY ? yoyOf(obs) : null;
        if (isYoY && (!yoy || !yoy.length)) { console.log(`  skip ${id} (cannot compute YoY)`); continue; }
        const curYoY = isYoY ? yoy[yoy.length - 1].v : null;
        const ym = isYoY ? yoyMonths(obs, months) : null;
        if (isYoY && !ym) { console.log(`  skip ${id} (no base month for YoY threshold)`); continue; }
        const base = ym?.base;
        const pctFmt = (v) => v.toFixed(1) + '%';

        const isLevel = (alt++ % 2) === 1;
        let value, question, why, rule;
        if (isYoY) {
            // Threshold is expressed as a rate but stored as an index level.
            const swing = typicalMove(yoy.map(o => ({ d: o.d, v: o.v + 100 })), months * 30.44) * 100;
            const target = isLevel ? curYoY + Math.max(0.3, swing) : curYoY;
            // NOT rounded to significant figures: at these index levels a 3-figure
            // round shifts the implied rate by ~0.15 points, which quietly turned
            // "above 3.46%" into "above 3.32%" and made the question easier than
            // it claimed. The threshold is an exact derived quantity — keep it exact.
            value = +(base * (1 + target / 100)).toFixed(2);
            const subject = label.replace(/\s*YoY.*$/, '').replace(/^.*—\s*/, '').trim();
            question = isLevel
                ? `${subject} inflation is above ${pctFmt(target)} in the ${ym.targetName} report`
                : `${subject} inflation is above today's ${pctFmt(curYoY)} in the ${ym.targetName} report`;
            why = `Resolves on the ${ym.targetName} index, published in the middle of the following month — the last one due before the deadline. It compares against ${ym.baseName} (${base.toFixed(2)}), so the index must exceed ${value.toFixed(2)} to clear ${pctFmt(target)}. Today's reading is ${pctFmt(curYoY)}. ${theme}.`;
            rule = `Settles on the ${ym.targetName} report and nothing else. Readings before then do not count, however high or low they go.`;
        } else if (!isLevel) {
            value = +now.toFixed(4);
            question = `${label} is higher on ${deadline} than today's ${fmt(now)}`;
            why = `Direction call, near a coin flip by construction. ${theme}.`;
            rule = `Settles on the ${deadline} reading and nothing else. What it does in between does not count — it can cross ${fmt(now)} twenty times and still settle NO.`;
        } else {
            const move = typicalMove(obs, months * 30.44);
            const up = alt % 4 === 1;                       // alternate up-breaks and down-breaks
            value = sig3(now * (1 + (up ? 1 : -1) * move * 1.15));
            question = `${label} ${up ? 'rises above' : 'drops below'} ${fmt(value)} at any point before ${deadline}`;
            why = `A ${(Math.abs(value / now - 1) * 100).toFixed(0)}% move from today's ${fmt(now)} — roughly the median ${months}-month swing for this series, so genuinely uncertain rather than a gimme. ${theme}.`;
            rule = `Settles YES the first time it reads ${up ? 'above' : 'below'} ${fmt(value)}. One reading anywhere in the window is enough, and where it sits on ${deadline} does not matter.`;
        }

        const qid = `q3m-${id}-${deadline}`;
        if (have.has(qid)) continue;
        const q = {
            id: qid, question, why, rule, theme,
            p: null, created: today, askBy: plusDays(today, 21), deadline,
            resolve: {
                series: id,
                op: (isLevel && !isYoY) ? (alt % 4 === 1 ? '>' : '<') : '>',
                value,
                // "reaches"/"falls to" resolves the moment it crosses; "higher in
                // N months" is judged on the last reading at the deadline.
                mode: (isLevel && !isYoY) ? 'any' : 'final',
                at: atFor(id),
                from: plusDays(today, 1),
            },
            outcome: null, resolvedOn: null, auto: true, horizon: `${months}m`,
        };
        db.forecasts.push(q);
        have.add(qid);
        added.push(`${theme.padEnd(24)} ${question}`);
    }
}

console.log(`${added.length} question${added.length === 1 ? '' : 's'}, all due ${deadline}:\n`);
for (const a of added) console.log('  ' + a);
if (dry) { console.log('\n--dry: nothing written'); process.exit(0); }
writeFileSync(FILE, JSON.stringify(db, null, 1));
console.log(`\nWritten. Answer them blind with:  node blind.mjs me`);
