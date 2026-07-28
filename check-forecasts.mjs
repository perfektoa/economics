// Auto-resolves machine-checkable forecasts against the cached data and pings
// ntfy when one resolves. Runs in the hourly chain before build-dashboard.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';
import { dailyBrier } from './brier.mjs';
import { evaluateForecast, closeDateFor, pubLag, FASTER_SOURCE } from './resolve.mjs';

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

// A resolved answer is not allowed to just sit there trusted. One question was
// written YES against data that, on the next fetch, said it had never happened —
// and nothing in the pipeline noticed, because resolved questions were skipped
// forever after. So every auto-resolved question is re-checked against current
// data, and any that no longer agrees is flagged loudly rather than quietly
// scoring. Disagreement is not always a bug (a series can be revised, and the
// faster-feed fallback legitimately reads a source this pass does not), so this
// reports rather than silently rewrites — the call is the user's.
let changed = false;
let disputed = 0;
for (const f of db.forecasts) {
    if (f.outcome == null || !f.auto || !f.resolve || f.settledBy || f.voided) continue;
    const obs = seriesObs(f.resolve.series);
    if (!obs) continue;
    const ev = evaluateForecast(f, obs, today, { pubLagDays: pubLag(f.resolve.series) });
    if (ev && ev.outcome === f.outcome) continue;
    disputed++;
    f.disputed = `Stored ${f.outcome ? 'YES' : 'NO'}, but re-checking against the ${f.resolve.series} data on ${today} says ${ev ? (ev.outcome ? 'YES' : 'NO') : 'not resolved yet'}. Not counted until this is settled.`;
    console.error(`DISPUTED ${f.id}: ${f.disputed}`);
    changed = true;
}
if (disputed) {
    await notify(`${disputed} resolved forecast${disputed === 1 ? '' : 's'} no longer match the data`,
        `A question marked resolved does not agree with its series any more. It is held out of scoring until checked. See the dashboard.`);
}

for (const f of db.forecasts) {
    if (f.outcome != null || f.p == null || !f.resolve) continue;
    const obs = seriesObs(f.resolve.series);
    if (!obs) continue;
    // resolve.from overrides created for series whose obs are dated by reference
    // period (e.g. UNRATE prints dated the 1st of the prior month).
    const altId = FASTER_SOURCE[f.resolve.series];
    const ev = evaluateForecast(f, obs, today, {
        pubLagDays: pubLag(f.resolve.series),
        altObs: altId ? seriesObs(altId) : null,
    });
    const outcome = ev?.outcome ?? null, when = ev?.when ?? null;
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
        f.resolvedOn = closeDateFor(f, when, today);
        if (ev.viaFallback) f.settledBy = `${altId} (its own feed had not published by the deadline; the reading was far enough from the threshold that the difference between the two could not change the answer)`;
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
