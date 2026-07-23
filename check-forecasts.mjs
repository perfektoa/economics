// Auto-resolves machine-checkable forecasts against the cached data and pings
// ntfy when one resolves. Runs in the hourly chain before build-dashboard.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';
import { dailyBrier } from './brier.mjs';

const FILE = new URL('./forecasts.json', import.meta.url);
if (!existsSync(FILE)) { console.log('no forecasts.json yet'); process.exit(0); }
const db = JSON.parse(readFileSync(FILE, 'utf8'));
const CONFIG = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

function seriesObs(id) {
    const f = new URL(`./data/${id}.json`, import.meta.url);
    if (!existsSync(f)) return null;
    const scale = SERIES.find(s => s.id === id)?.scale || 1;
    return JSON.parse(readFileSync(f, 'utf8')).obs.map(o => ({ d: o.d, v: o.v * scale }));
}
const test = (op, a, b) => op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;

async function notify(title, body) {
    if (!CONFIG.ntfyTopic) return;
    await fetch(`https://ntfy.sh/${CONFIG.ntfyTopic}`, {
        method: 'POST', headers: { Title: title, Tags: 'crystal_ball' }, body,
    }).catch(() => {});
}

let changed = false;
for (const f of db.forecasts) {
    if (f.outcome != null || f.p == null || !f.resolve) continue;
    const obs = seriesObs(f.resolve.series);
    if (!obs) continue;
    // resolve.from overrides created for series whose obs are dated by reference
    // period (e.g. UNRATE prints dated the 1st of the prior month).
    const from = f.resolve.from || f.created;
    const inWindow = obs.filter(o => o.d >= from && o.d <= f.deadline);
    let outcome = null, when = null;
    if ((f.resolve.mode || 'any') === 'any') {
        const hit = inWindow.find(o => test(f.resolve.op, o.v, f.resolve.value));
        if (hit) { outcome = 1; when = hit.d; }
        else if (today > f.deadline) { outcome = 0; when = f.deadline; }
    } else { // final: judge last observation at/before deadline
        if (today > f.deadline && inWindow.length) {
            const last = inWindow[inWindow.length - 1];
            outcome = test(f.resolve.op, last.v, f.resolve.value) ? 1 : 0;
            when = last.d;
        }
    }
    if (outcome != null) {
        // The retroactive close must be the day the answer became KNOWABLE, not
        // the period the data describes. FRED dates an observation by its
        // reference week or month, but claims for the week ending Jul 18 are not
        // published until Jul 23 — scoring to Jul 18 would void every forecast
        // made in between, which were entirely legitimate. Detection date is the
        // best available proxy for publication, since this runs hourly.
        // resolvedRef keeps the observation that actually triggered it.
        f.outcome = outcome;
        f.resolvedRef = when;
        f.resolvedOn = when > today ? when : today;
        changed = true;
        const you = dailyBrier(f, 'user');
        const cl = dailyBrier(f, 'claude');
        const pct = (p) => Math.round(p * 100) + '%';
        const yourLine = you
            ? `${pct(you.first)}${you.updates ? ` → ${pct(you.last)}` : ''}, Brier ${you.brier.toFixed(3)} over ${you.days} day${you.days === 1 ? '' : 's'}`
            : 'unscored';
        console.log(`resolved ${f.id}: ${outcome ? 'YES' : 'NO'} — "${f.question}" (you ${yourLine})`);
        const cLine = cl ? ` Claude ${pct(cl.first)}, Brier ${cl.brier.toFixed(3)}.` : '';
        const revised = you && you.updates
            ? ` You revised ${you.updates}x: holding your first ${pct(you.first)} throughout would have scored ${you.firstOnly.toFixed(3)}.`
            : '';
        await notify(`Forecast resolved ${outcome ? 'YES' : 'NO'}: ${f.question}`,
            `You ${yourLine} (0 = perfect, 0.25 = coin-flip at 50%).${cLine}${revised} Scored every day you held a number — the scoreboard is on the dashboard.`);
    }
}
if (changed) writeFileSync(FILE, JSON.stringify(db, null, 1));
else console.log('no forecast resolutions');
