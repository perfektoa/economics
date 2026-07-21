// Forecast Journal CLI — log falsifiable predictions, machine-scored later.
//
//   node forecast.mjs add "Jobless claims exceed 254k" 60 2026-12-31 ICSA ">" 254
//   node forecast.mjs add "Fed cuts at the July FOMC" 40 2026-07-30
//   node forecast.mjs add "Gold ends March below 6000" 55 2027-03-31 YH_GOLD "<" 6000 final
//   node forecast.mjs list
//   node forecast.mjs resolve <id> yes|no        (manual forecasts only)
//
// Machine rules: SERIES OP VALUE [mode]. mode "any" (default) = YES the first
// time the condition prints before the deadline, NO if the deadline passes.
// mode "final" = judged on the last value at the deadline.
// Values use dashboard units (ICSA in thousands, rates in %, prices in $).
import { readFileSync, writeFileSync, existsSync } from 'fs';

const FILE = new URL('./forecasts.json', import.meta.url);
const db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { forecasts: [] };
const save = () => writeFileSync(FILE, JSON.stringify(db, null, 1));
const [cmd, ...a] = process.argv.slice(2);

if (cmd === 'add') {
    const [question, prob, deadline, series, op, value, mode] = a;
    if (!question || !prob || !deadline) {
        console.log('usage: node forecast.mjs add "question" <prob 0-100> <deadline YYYY-MM-DD> [SERIES OP VALUE [any|final]]');
        process.exit(1);
    }
    const id = 'f' + (db.forecasts.length + 1) + '-' + Math.random().toString(36).slice(2, 6);
    db.forecasts.push({
        id, question, p: (+prob) / 100, created: new Date().toISOString().slice(0, 10), deadline,
        resolve: series ? { series, op, value: +value, mode: mode || 'any' } : null,
        outcome: null, resolvedOn: null,
    });
    save();
    console.log(`logged ${id}: "${question}" @ ${prob}% by ${deadline}${series ? ` [auto: ${series} ${op} ${value}]` : ' [manual resolution]'}`);
} else if (cmd === 'resolve') {
    const [id, yn] = a;
    const f = db.forecasts.find(x => x.id === id);
    if (!f) { console.log('no such id'); process.exit(1); }
    f.outcome = yn === 'yes' ? 1 : 0;
    f.resolvedOn = new Date().toISOString().slice(0, 10);
    save();
    console.log(`resolved ${id} = ${yn.toUpperCase()}`);
} else {
    for (const f of db.forecasts) {
        const status = f.outcome == null ? `OPEN (by ${f.deadline})` : `${f.outcome ? 'YES' : 'NO'} on ${f.resolvedOn} — Brier ${((f.p - f.outcome) ** 2).toFixed(3)}`;
        console.log(`${f.id}  ${Math.round(f.p * 100)}%  "${f.question}"  ${status}`);
    }
    if (!db.forecasts.length) console.log('journal empty — add your first: node forecast.mjs add "..." 60 2026-12-31 [SERIES OP VALUE]');
}
