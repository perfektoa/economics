// Auto-resolves machine-checkable forecasts against the cached data and pings
// ntfy when one resolves. Runs in the hourly chain before build-dashboard.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';

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
        f.outcome = outcome; f.resolvedOn = when; changed = true;
        const brier = ((f.p - outcome) ** 2).toFixed(3);
        console.log(`resolved ${f.id}: ${outcome ? 'YES' : 'NO'} — "${f.question}" (you said ${Math.round(f.p * 100)}%, Brier ${brier})`);
        const cLine = f.claudeP != null
            ? ` Claude said ${Math.round(f.claudeP * 100)}% (Brier ${((f.claudeP - outcome) ** 2).toFixed(3)}).`
            : '';
        await notify(`Forecast resolved ${outcome ? 'YES' : 'NO'}: ${f.question}`,
            `You said ${Math.round(f.p * 100)}%, Brier ${brier} (0 = perfect, 0.25 = coin-flip at 50%).${cLine} The scoreboard is on the dashboard.`);
    }
}
if (changed) writeFileSync(FILE, JSON.stringify(db, null, 1));
else console.log('no forecast resolutions');
