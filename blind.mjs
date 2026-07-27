// Blind briefing for whoever has not answered yet.
//
// Seeing the other forecaster's probability before committing your own is
// anchoring, and it quietly destroys the value of a head-to-head record: two
// numbers that were not formed independently cannot be compared. This prints
// everything needed to think — the question, the exact resolution rule, the
// current reading, recent history — and nothing about what anyone has guessed.
//
// Usage: node blind.mjs [claude|me]        (default: claude)
import { readFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';

const who = (process.argv[2] || 'claude').toLowerCase();
const field = who === 'me' || who === 'user' ? 'p' : 'claudeP';
const db = JSON.parse(readFileSync(new URL('./forecasts.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const obsFor = (id) => {
    const f = new URL(`./data/${id}.json`, import.meta.url);
    if (!existsSync(f)) return null;
    const scale = SERIES.find(s => s.id === id)?.scale || 1;
    return JSON.parse(readFileSync(f, 'utf8')).obs.filter(o => o.v != null).map(o => ({ d: o.d, v: o.v * scale }));
};

const pending = db.forecasts.filter(f => f.outcome == null && f[field] == null && f.deadline >= today);
if (!pending.length) {
    console.log(`Nothing awaiting an answer from ${who}.`);
    process.exit(0);
}
console.log(`${pending.length} question${pending.length > 1 ? 's' : ''} awaiting ${who}. Probabilities are hidden on purpose.\n`);

for (const f of pending) {
    console.log('─'.repeat(78));
    console.log(f.question);
    if (f.why) console.log('  ' + f.why);
    const r = f.resolve;
    if (!r) { console.log('  manual resolution\n'); continue; }
    const meta = SERIES.find(s => s.id === r.series);
    console.log(`  RULE: ${meta?.label || r.series} ${r.op} ${r.value}` +
        ` · ${r.mode === 'final' ? 'judged on the last reading at the deadline' : 'resolves if any reading crosses'}` +
        ` · window ${r.from || f.created} to ${f.deadline}`);
    const obs = obsFor(r.series);
    if (obs?.length) {
        const last = obs[obs.length - 1];
        const gap = ((last.v / r.value - 1) * 100);
        console.log(`  NOW: ${last.v.toFixed(2)} as of ${last.d} — ${Math.abs(gap).toFixed(1)}% ${gap >= 0 ? 'ABOVE' : 'BELOW'} the threshold`);
        console.log('  recent: ' + obs.slice(-6).map(o => `${o.d.slice(5)}=${o.v.toFixed(1)}`).join('  '));
        // How often has this series held/crossed such a gap over a comparable span?
        // Steps must be counted in OBSERVATIONS, not calendar days: for a daily
        // series an 8-day window is ~8 prints, not one.
        const span = Math.max(1, Math.round((Date.parse(f.deadline) - Date.parse(last.d)) / 86400e3));
        const gaps = [];
        for (let i = Math.max(1, obs.length - 30); i < obs.length; i++) {
            gaps.push(Math.round((Date.parse(obs[i].d) - Date.parse(obs[i - 1].d)) / 86400e3));
        }
        gaps.sort((a, b) => a - b);
        const medGap = gaps[Math.floor(gaps.length / 2)] || 1;
        const steps = Math.max(1, Math.round(span / medGap));
        let hit = 0, tot = 0;
        for (let i = steps; i < obs.length; i++) {
            const chg = obs[i].v / obs[i - steps].v - 1;
            tot++;
            if (r.op === '>' ? chg > -gap / 100 : chg < -gap / 100) hit++;
        }
        if (tot > 50) console.log(`  BASE RATE: from a starting gap of ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}%, the condition held ${(100 * hit / tot).toFixed(0)}% of the time across ${tot} historical ${steps}-reading windows`);
    } else {
        console.log('  (no cached observations for this series)');
    }
    console.log(`  answer by ${f.askBy || f.deadline}\n`);
}
console.log('─'.repeat(78));
console.log(`Record answers, then run: node build-dashboard.mjs`);
