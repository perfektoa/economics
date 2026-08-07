// Edge-triggered phone alerts via ntfy.sh (free push notifications).
// Runs after build-dashboard.mjs. Compares snapshot.json against
// alerts-state.json and notifies ONLY on changes:
//   - the regime label changes
//   - any risk chip flips on or off
// First run establishes the baseline and sends a test notification.
// Usage: node check-alerts.mjs [--test]
import { readFileSync, writeFileSync, existsSync } from 'fs';

const CONFIG = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const TOPIC = CONFIG.ntfyTopic;
if (!TOPIC) { console.log('no ntfyTopic in config.json - alerts disabled'); process.exit(0); }

const snapFile = new URL('./snapshot.json', import.meta.url);
const stateFile = new URL('./alerts-state.json', import.meta.url);
if (!existsSync(snapFile)) { console.log('no snapshot.json - run build-dashboard.mjs first'); process.exit(0); }
const snap = JSON.parse(readFileSync(snapFile, 'utf8'));

async function notify(title, body, priority = 'default') {
    const res = await fetch(`https://ntfy.sh/${TOPIC}`, {
        method: 'POST',
        headers: { Title: title, Priority: priority, Tags: 'chart_with_upwards_trend' },
        body,
    });
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
}

const fmtChips = () => snap.chips.filter(c => c.on).map(c => c.label).join(', ') || 'none active';

if (process.argv.includes('--test') || !existsSync(stateFile)) {
    await notify('Economics Monitor connected',
        `Test alert. Current regime: ${snap.regime}. Active flags: ${fmtChips()}. You will only hear from me when something changes.`);
    writeFileSync(stateFile, JSON.stringify({ regime: snap.regime, chips: snap.chips }, null, 2));
    console.log('baseline saved + test notification sent to ntfy.sh/' + TOPIC);
    process.exit(0);
}

const prev = JSON.parse(readFileSync(stateFile, 'utf8'));
const msgs = [];

// ── Fed target-rate move detector (DFEDTARU daily series) ──────────────────
let fedTarget = prev.fedTarget ?? null;
try {
    const tObs = JSON.parse(readFileSync(new URL('./data/DFEDTARU.json', import.meta.url), 'utf8')).obs;
    const nowT = tObs[tObs.length - 1].v;
    if (fedTarget != null && Math.abs(nowT - fedTarget) >= 0.125) {
        msgs.push({ title: `Fed ${nowT < fedTarget ? 'CUTS' : 'HIKES'}: ${fedTarget.toFixed(2)}% -> ${nowT.toFixed(2)}%`,
            body: `Target rate (upper bound) moved. Regime: ${snap.regime}. Active flags: ${fmtChips()}.`, priority: 'high' });
    }
    fedTarget = nowT;
} catch (_) {}

// ── Release-day morning ping (calendar.json) ───────────────────────────────
const calDone = new Set(prev.calDone || []);
try {
    const cal = JSON.parse(readFileSync(new URL('./calendar.json', import.meta.url), 'utf8'));
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const e of (cal.events || []).filter(e => e.date === todayStr)) {
        const k = e.date + e.name;
        if (calDone.has(k)) continue;
        calDone.add(k);
        msgs.push({ title: `Today: ${e.name}`, body: `Scheduled release today — expect movement around it. Regime going in: ${snap.regime}.` });
    }
} catch (_) {}

if (prev.regime !== snap.regime) {
    msgs.push({ title: `Regime change: ${snap.regime}`, body: `Was: ${prev.regime}. Active flags: ${fmtChips()}.`, priority: 'high' });
}
const prevChip = new Map((prev.chips || []).map(c => [c.label.split(':')[0], c]));
for (const c of snap.chips) {
    const key = c.label.split(':')[0]; // Fed chip label embeds the stance — compare by prefix
    const p = prevChip.get(key);
    if (!p) continue;
    if (!p.on && c.on) msgs.push({ title: `Flag ON: ${c.label}`, body: `Regime: ${snap.regime}. Active flags: ${fmtChips()}.`, priority: 'high' });
    else if (p.on && !c.on) msgs.push({ title: `Flag cleared: ${c.label}`, body: `Regime: ${snap.regime}. Active flags: ${fmtChips()}.` });
    else if (key.startsWith('Fed') && p.label !== c.label && p.label.split('(')[0] !== c.label.split('(')[0]) {
        msgs.push({ title: `Fed stance: ${c.label}`, body: `Was: ${p.label}.` });
    }
}

for (const m of msgs) {
    try { await notify(m.title, m.body, m.priority); console.log('sent:', m.title); }
    catch (e) { console.error('notify failed:', e.message); process.exitCode = 1; }
}
if (!msgs.length) console.log('no changes - no alerts');
writeFileSync(stateFile, JSON.stringify({
    regime: snap.regime, chips: snap.chips, fedTarget,
    calDone: [...calDone].slice(-60),
}, null, 2));
