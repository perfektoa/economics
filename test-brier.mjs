// Verify daily-averaged Brier against hand-computed cases.
import { dailyBrier, averageBrier, hitRate, timeline, daysBetween, addDays } from './brier.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want, tol = 1e-9) => {
    const ok = typeof want === 'number' ? Math.abs(got - want) < tol : JSON.stringify(got) === JSON.stringify(want);
    if (ok) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

console.log('date helpers');
eq('daysBetween same day', daysBetween('2026-07-01', '2026-07-01'), 0);
eq('daysBetween 10 days', daysBetween('2026-07-01', '2026-07-11'), 10);
eq('daysBetween across month', daysBetween('2026-07-30', '2026-08-02'), 3);
eq('addDays across month', addDays('2026-07-30', 3), '2026-08-02');
eq('daysBetween across DST (US spring forward Mar 8 2026)', daysBetween('2026-03-06', '2026-03-10'), 4);

console.log('\nsingle forecast, held the whole way');
// Forecast 20% on Jul 1, resolves NO (outcome 0) on Jul 11 -> 11 days at (0.2-0)^2 = 0.04
const f1 = { p: 0.2, created: '2026-07-01', answeredOn: '2026-07-01', deadline: '2026-07-20', outcome: 0, resolvedOn: '2026-07-11' };
const r1 = dailyBrier(f1);
eq('days counted', r1.days, 11);
eq('brier', r1.brier, 0.04);
eq('no updates', r1.updates, 0);

console.log('\nlate correction barely helps (the whole point)');
// 20% Jul 1, resolves YES Jul 11. Late panic to 90% on Jul 10.
// Jul 1-9 = 9 days at (0.2-1)^2=0.64 ; Jul 10-11 = 2 days at (0.9-1)^2=0.01
const f2 = { p: 0.9, created: '2026-07-01', answeredOn: '2026-07-10',
    pHistory: [{ p: 0.2, on: '2026-07-01' }], deadline: '2026-07-20', outcome: 1, resolvedOn: '2026-07-11' };
const r2 = dailyBrier(f2);
eq('days counted', r2.days, 11);
eq('brier', r2.brier, (9 * 0.64 + 2 * 0.01) / 11);
eq('updates', r2.updates, 1);
eq('finalOnly would have been much better', r2.finalOnly, 0.01);
eq('firstOnly', r2.firstOnly, 0.64);
console.log(`    daily-avg ${r2.brier.toFixed(3)} vs final-only ${r2.finalOnly.toFixed(3)} â€” late fix does NOT rescue the score`);

console.log('\nearly conviction is rewarded');
// Right early: 90% on Jul 1, resolves YES Jul 11 -> all 11 days at 0.01
const f3 = { p: 0.9, created: '2026-07-01', answeredOn: '2026-07-01', deadline: '2026-07-20', outcome: 1, resolvedOn: '2026-07-11' };
eq('brier', dailyBrier(f3).brier, 0.01);
console.log('    early-right 0.010 beats late-fixed ' + r2.brier.toFixed(3));

console.log('\nforecast entered AFTER resolution scores nothing');
const f4 = { p: 0.99, created: '2026-07-01', answeredOn: '2026-07-15', deadline: '2026-07-20', outcome: 1, resolvedOn: '2026-07-11' };
eq('null (retroactive close)', dailyBrier(f4), null);

console.log('\nsame-day revision collapses to the last value');
const f5 = { p: 0.6, created: '2026-07-01', answeredOn: '2026-07-01',
    pHistory: [{ p: 0.3, on: '2026-07-01' }], deadline: '2026-07-05', outcome: 1, resolvedOn: '2026-07-02' };
const r5 = dailyBrier(f5);
eq('days', r5.days, 2);
eq('uses 0.6 not 0.3', r5.brier, 0.16);

console.log('\nunresolved returns null');
eq('open forecast', dailyBrier({ p: 0.5, created: '2026-07-01', answeredOn: '2026-07-01', deadline: '2026-08-01', outcome: null }), null);

console.log('\nclaude side scored symmetrically');
const f6 = { p: 0.2, answeredOn: '2026-07-01', claudeP: 0.8, claudeAnsweredOn: '2026-07-01',
    created: '2026-07-01', deadline: '2026-07-20', outcome: 1, resolvedOn: '2026-07-05' };
eq('user brier', dailyBrier(f6, 'user').brier, 0.64);
eq('claude brier', dailyBrier(f6, 'claude').brier, 0.04);

console.log('\naverages and hit rate');
const set = [f1, f2, f3];
const avg = averageBrier(set);
eq('averaged over 3', avg.n, 3);
eq('total days', avg.days, 33);
eq('mean of the three', avg.brier, (r1.brier + r2.brier + r3Brier()) / 3);
function r3Brier() { return dailyBrier(f3).brier; }
// hit rate uses the FIRST forecast: f1 first 0.2 outcome 0 = hit; f2 first 0.2 outcome 1 = miss; f3 first 0.9 outcome 1 = hit
eq('hit rate uses first forecast', hitRate(set).pct, 67);

console.log('\ntimeline ordering');
const f7 = { p: 0.5, answeredOn: '2026-07-10', created: '2026-07-01',
    pHistory: [{ p: 0.3, on: '2026-07-05' }, { p: 0.1, on: '2026-07-01' }] };
eq('sorted ascending', timeline(f7).map(e => e.on + ':' + e.p), ['2026-07-01:0.1', '2026-07-05:0.3', '2026-07-10:0.5']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
