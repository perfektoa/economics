// Auto-generates forecast questions — the board asks, you answer on the dashboard.
// Sources: FOMC meetings (within 45 days), jobs reports (from calendar.json),
// indicators at historic extremes (>=93rd / <=7th percentile of own history),
// and one evergreen monthly S&P 500 call. Every question carries its own
// resolution rule, so check-forecasts.mjs scores it with zero manual work.
// Unanswered questions expire at their askBy date and are retired (never re-asked).
// Set QGEN_QUIET=1 to skip the ntfy ping (used by server.mjs rebuilds).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';

const FILE = new URL('./forecasts.json', import.meta.url);
const CONFIG = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { forecasts: [] };
db.retired = db.retired || [];

const today = new Date().toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(Date.parse(d + 'T12:00') + n * 86400e3).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;

const meta = (id) => SERIES.find(s => s.id === id);
function seriesObs(id) {
    const f = new URL(`./data/${id}.json`, import.meta.url);
    if (!existsSync(f)) return null;
    const scale = meta(id)?.scale || 1;
    return JSON.parse(readFileSync(f, 'utf8')).obs.map(o => ({ d: o.d, v: o.v * scale }));
}
const latestOf = (id) => { const o = seriesObs(id); return o?.length ? o[o.length - 1].v : null; };
const lastObs = (id) => { const o = seriesObs(id); return o?.length ? o[o.length - 1].d : null; };
function fmtV(id, v) {
    const s = meta(id);
    const t = v.toLocaleString('en-US', { minimumFractionDigits: s?.dec ?? 1, maximumFractionDigits: s?.dec ?? 1 });
    return s?.unit === '$' ? '$' + t : t + (s?.unit || '');
}

let changed = false;
// Retire unanswered questions whose answer window has closed (no penalty, never re-asked).
db.forecasts = db.forecasts.filter(f => {
    if (f.p == null && f.outcome == null && f.askBy && f.askBy < today) {
        db.retired.push(f.id); changed = true;
        console.log(`expired unanswered: ${f.question}`);
        return false;
    }
    return true;
});

const have = new Set([...db.forecasts.map(f => f.id), ...db.retired]);
const OPEN_CAP = 10;
const openCount = () => db.forecasts.filter(f => f.p == null && f.outcome == null).length;
const added = [];
function ask(q) {
    if (have.has(q.id) || openCount() >= OPEN_CAP) return false;
    db.forecasts.push({
        id: q.id, question: q.question, why: q.why, p: null, created: today,
        askBy: q.askBy, deadline: q.deadline, resolve: q.resolve,
        outcome: null, resolvedOn: null, auto: true,
    });
    have.add(q.id); added.push(q.question); changed = true;
    return true;
}

// ── 1. FOMC decisions (highest priority) ─────────────────────
const FOMC = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];
const target = latestOf('DFEDTARU');
for (const mtg of FOMC) {
    if (target == null || mtg < today || mtg > plusDays(today, 45)) continue;
    ask({
        id: `q-fomc-${mtg}`,
        question: `The Fed CUTS rates at the ${prettyDate(mtg)} FOMC meeting`,
        why: `Upper target is ${target.toFixed(2)}% today. Resolves YES if it prints below ${(target - 0.05).toFixed(2)}% within a week of the decision.`,
        askBy: plusDays(mtg, -1), deadline: plusDays(mtg, 7),
        resolve: { series: 'DFEDTARU', op: '<', value: +(target - 0.05).toFixed(2), mode: 'any' },
    });
}

// ── 2. Jobs reports (from the calendar) ──────────────────────
let cal = null;
try { cal = JSON.parse(readFileSync(new URL('./calendar.json', import.meta.url), 'utf8')); } catch (_) {}
const unNow = latestOf('UNRATE');
for (const e of cal?.events || []) {
    if (e.name !== 'Jobs Report' || e.date < today || unNow == null) continue;
    // The report released in month M covers month M-1; UNRATE obs are dated the
    // first of the reference month, so the resolve window must start there.
    const y = +e.date.slice(0, 4), m = +e.date.slice(5, 7);
    const from = new Date(Date.UTC(y, m - 2, 1, 12)).toISOString().slice(0, 10);
    ask({
        id: `q-jobs-${e.date}`,
        question: `Unemployment prints HIGHER than ${unNow.toFixed(1)}% on the ${prettyDate(e.date)} jobs report`,
        why: `Currently ${unNow.toFixed(1)}%. One tick either way is genuinely hard to call — that's the point.`,
        askBy: plusDays(e.date, -1), deadline: plusDays(e.date, 3),
        resolve: { series: 'UNRATE', op: '>', value: +unNow.toFixed(1), mode: 'any', from },
    });
}

// ── 2b. CPI reports — YoY threshold pinned to the raw index at ask time ──
const cpiObs = seriesObs('CPIAUCSL');
for (const e of cal?.events || []) {
    if (e.name !== 'CPI' || e.date < today || !cpiObs || cpiObs.length < 14) continue;
    const y = +e.date.slice(0, 4), m = +e.date.slice(5, 7);
    const refD = new Date(Date.UTC(y, m - 2, 1, 12)).toISOString().slice(0, 10);
    const baseKey = new Date(Date.UTC(y, m - 14, 1, 12)).toISOString().slice(0, 7);
    const base = cpiObs.find(o => o.d.slice(0, 7) === baseKey);
    if (!base) continue;
    const curYoY = cpiObs[cpiObs.length - 1].v / cpiObs[cpiObs.length - 13].v - 1;
    ask({
        id: `q-cpi-${e.date}`,
        question: `CPI inflation comes in HOTTER than the current ${(curYoY * 100).toFixed(1)}% YoY on the ${prettyDate(e.date)} report`,
        why: `The most market-moving number each month. Resolves on the raw index — the new print must beat ${(curYoY * 100).toFixed(1)}% YoY.`,
        askBy: plusDays(e.date, -1), deadline: plusDays(e.date, 4),
        resolve: { series: 'CPIAUCSL', op: '>', value: +(base.v * (1 + curYoY)).toFixed(3), mode: 'any', from: refD },
    });
}

// ── 2c. Weekly reps — claims, oil, VIX (fast feedback builds calibration) ──
const dow = new Date(today + 'T12:00').getUTCDay();
const nextThu = plusDays(today, ((4 - dow + 7) % 7) || 7);
const nextFri = plusDays(today, ((5 - dow + 7) % 7) || 7);
const claimsNow = latestOf('ICSA'), claimsAt = lastObs('ICSA');
if (claimsNow != null && claimsAt) ask({
    id: `q-icsa-${nextThu}`,
    question: `Jobless claims print HIGHER than ${Math.round(claimsNow)}k on the ${prettyDate(nextThu)} release`,
    why: `Weekly rep. The print covers last week and lands Thursday morning. Baseline is the ${claimsAt} week at ${Math.round(claimsNow)}k.`,
    // Deadline is the release day itself, so this resolves the morning after the
    // print rather than three days later. Once the number is public, every extra
    // day is a known answer being scored, which is free points for whoever looks.
    askBy: plusDays(nextThu, -1), deadline: nextThu,
    resolve: { series: 'ICSA', op: '>', value: +claimsNow.toFixed(1), mode: 'final', from: plusDays(claimsAt, 1) },
});
// Answer windows run until the day before the event so an evening check-in
// never misses one — two weeklies expired unanswered under a 3-day window.
//
// The resolve window must START AFTER the observation used as the baseline.
// Jobless claims get revised: the week ending Jul 11 was published at 208k,
// the question was written against it, and it was later revised to 209k. With
// the window starting before that date, a 1k revision to the OLD number
// resolved the question YES while the release it actually asked about came in
// at 187k. Single-print questions also use 'final', not 'any', so they judge
// the new print rather than firing on anything in the window.
const oilNow = latestOf('DCOILWTICO');
if (oilNow != null) ask({
    id: `q-oil-${nextFri}`,
    question: `WTI crude ends ${prettyDate(nextFri)} ABOVE today's $${oilNow.toFixed(0)}`,
    why: `Weekly rep on the barrel — the last daily close on or before ${prettyDate(nextFri)} decides it.`,
    askBy: plusDays(nextFri, -1), deadline: nextFri,
    resolve: { series: 'DCOILWTICO', op: '>', value: +oilNow.toFixed(2), mode: 'final' },
});
const vixNow = latestOf('VIXCLS');
if (vixNow != null) ask({
    id: `q-vix-${nextFri}`,
    question: `VIX ends ${prettyDate(nextFri)} HIGHER than today's ${vixNow.toFixed(1)}`,
    why: `Weekly rep on fear itself. Calm weeks grind vol down; one headline spikes it.`,
    askBy: plusDays(nextFri, -1), deadline: nextFri,
    resolve: { series: 'VIXCLS', op: '>', value: +vixNow.toFixed(2), mode: 'final' },
});

// ── 3. Indicators at historic extremes (top 2 per run, one per quarter each) ──
const WATCH = ['ICSA', 'BAMLH0A0HYM2', 'VIXCLS', 'UMCSENT', 'T10Y2Y', 'NFCI',
    'DCOILWTICO', 'PCOPPUSDM', 'DTWEXBGS', 'MORTGAGE30US', 'YH_GOLD', 'YH_SILVER'];
const qtr = today.slice(0, 4) + 'Q' + Math.ceil(+today.slice(5, 7) / 3);
const exts = [];
for (const id of WATCH) {
    const obs = seriesObs(id);
    if (!obs || obs.length < 120) continue;
    const latest = obs[obs.length - 1].v;
    const pct = obs.filter(o => o.v <= latest).length / obs.length * 100;
    if (pct >= 93 || pct <= 7) exts.push({ id, latest, pct, dist: Math.abs(pct - 50) });
}
exts.sort((a, b) => b.dist - a.dist);
// At most 2 extreme-driven questions in flight (unresolved) at any time —
// otherwise every freed slot refills instantly and the board floods.
let extAdded = db.forecasts.filter(f => f.id.startsWith('q-ext-') && f.outcome == null).length;
for (const e of exts) {
    if (extAdded >= 2) break;
    const hi = e.pct >= 50;
    const ok = ask({
        id: `q-ext-${e.id}-${qtr}`,
        question: `${meta(e.id)?.label || e.id} is ${hi ? 'LOWER' : 'HIGHER'} than today's ${fmtV(e.id, e.latest)} in 3 months`,
        why: `It sits at the ${Math.round(e.pct)}th percentile of its own history — ${hi ? 'rarely been higher' : 'rarely been lower'}. Extremes sometimes revert, sometimes keep trending. Your call.`,
        askBy: plusDays(today, 14), deadline: plusDays(today, 90),
        resolve: { series: e.id, op: hi ? '<' : '>', value: +e.latest.toFixed(4), mode: 'final' },
    });
    if (ok) extAdded++;
}

// ── 4. Evergreen monthly calls — S&P 500 and gold ────────────
const MONTHLIES = [
    ['YH_SPX', 'The S&P 500', 'The bread-and-butter calibration rep. Base rate: stocks end a given month higher roughly 60% of the time — is this month different?'],
    ['YH_GOLD', 'Gold', 'The hard-asset monthly. Gold trends persist longer than people expect — until they stop.'],
];
for (const [sid, name, why] of MONTHLIES) {
    const now = latestOf(sid);
    if (now == null) continue;
    const y = +today.slice(0, 4), m = +today.slice(5, 7);
    const eom = new Date(Date.UTC(y, m + 1, 0, 12)); // last day of next month
    const dl = eom.toISOString().slice(0, 10);
    ask({
        id: `q-mkt-${sid}-${dl.slice(0, 7)}`,
        question: `${name} ends ${MONTHS[m % 12]} above today's ${fmtV(sid, now)}`,
        why,
        askBy: plusDays(today, 14), deadline: dl,
        resolve: { series: sid, op: '>', value: +now.toFixed(2), mode: 'final' },
    });
}

db.retired = db.retired.slice(-200);
if (changed) writeFileSync(FILE, JSON.stringify(db, null, 1));
console.log(added.length ? `added ${added.length} question(s):\n  ` + added.join('\n  ') : 'no new questions');

if (added.length && CONFIG.ntfyTopic && !process.env.QGEN_QUIET) {
    await fetch(`https://ntfy.sh/${CONFIG.ntfyTopic}`, {
        method: 'POST',
        headers: { Title: `${added.length} new forecast question${added.length > 1 ? 's' : ''} on the board`, Tags: 'question' },
        body: added.map(q => '• ' + q).join('\n') + '\n\nAnswer at http://localhost:8787',
    }).catch(() => {});
}
