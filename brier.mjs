// Daily-averaged Brier scoring, matching the Good Judgment Project convention.
//
// A forecast is scored on EVERY day it was active, and those daily scores are
// averaged. Your last number carries forward until you change it. Consequences:
//   - Being right EARLY is what wins: a good call held for 90 days scores well
//     on all 90; a correction made two days before the deadline improves two.
//   - Late updates are allowed but nearly worthless, so there is no need to
//     lock picks. The scoring does the work a lock used to do.
//   - Questions close retroactively at the moment the event actually resolved,
//     so a forecast entered after the print does not count at all.

const DAY_MS = 86400e3;
export const toDay = (d) => String(d).slice(0, 10);
const stamp = (d) => Date.parse(toDay(d) + 'T12:00:00Z');
export const addDays = (d, n) => new Date(stamp(d) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((stamp(b) - stamp(a)) / DAY_MS);

// The [{on, p}] history for one forecaster. Current value plus any revisions;
// same-day revisions collapse to the last one entered.
export function timeline(f, who = 'user') {
    const isClaude = who === 'claude';
    const cur = isClaude ? f.claudeP : f.p;
    if (cur == null) return [];
    const on = (isClaude ? f.claudeAnsweredOn : f.answeredOn) || f.created;
    const hist = (isClaude ? f.claudePHistory : f.pHistory) || [];
    const byDay = new Map();
    for (const h of [...hist, { p: cur, on }]) {
        if (h && h.p != null) byDay.set(toDay(h.on || f.created), h.p);
    }
    return [...byDay.entries()].map(([on, p]) => ({ on, p })).sort((a, b) => a.on.localeCompare(b.on));
}

// Daily-averaged Brier for a resolved forecast. Returns null when unresolved
// or when nothing was forecast before the close.
//
// Only forecasts entered STRICTLY BEFORE the close count — the Good Judgment
// rule is "through the end of the calendar day prior to the official closing".
// This matters because a release lands in the morning: without the cutoff, a
// number changed hours after the print reads as a legitimate same-day update,
// and there is no way to prove otherwise. Excluding close-day entries removes
// the question entirely. The last number held going INTO the release is the
// one that gets scored, carried forward through the close.
export function dailyBrier(f, who = 'user') {
    if (f.outcome == null) return null;
    const end = toDay(f.resolvedOn || f.deadline);
    const tl = timeline(f, who).filter(e => e.on < end);
    if (!tl.length) return null;
    const start = tl[0].on;
    if (daysBetween(start, end) < 0) return null;
    let sum = 0, n = 0, i = 0, active = null;
    for (let d = start; daysBetween(d, end) >= 0; d = addDays(d, 1)) {
        while (i < tl.length && tl[i].on <= d) { active = tl[i].p; i++; }
        if (active == null) continue;
        sum += (active - f.outcome) ** 2;
        n++;
    }
    if (!n) return null;
    const first = tl[0].p, last = tl[tl.length - 1].p;
    return {
        brier: sum / n, days: n, first, last, updates: tl.length - 1,
        // What a single final-answer score would have been — shows whether
        // holding early conviction helped or hurt versus revising late.
        finalOnly: (last - f.outcome) ** 2,
        firstOnly: (first - f.outcome) ** 2,
    };
}

// Average daily-averaged Brier across a set of resolved forecasts.
export function averageBrier(list, who = 'user') {
    const scored = list.map(f => dailyBrier(f, who)).filter(Boolean);
    if (!scored.length) return null;
    return {
        brier: scored.reduce((s, x) => s + x.brier, 0) / scored.length,
        n: scored.length,
        days: scored.reduce((s, x) => s + x.days, 0),
        finalOnly: scored.reduce((s, x) => s + x.finalOnly, 0) / scored.length,
    };
}

// Directional hit rate uses the FIRST forecast — the honest test of the call,
// before any updating.
export function hitRate(list, who = 'user') {
    const rows = list.map(f => ({ f, tl: timeline(f, who).filter(e => e.on < toDay(f.resolvedOn || f.deadline)) }))
        .filter(x => x.tl.length && x.f.outcome != null);
    if (!rows.length) return null;
    const hits = rows.filter(({ f, tl }) => (tl[0].p >= 0.5) === (f.outcome === 1)).length;
    return { hits, n: rows.length, pct: Math.round(100 * hits / rows.length) };
}

// Days a still-open forecast has been held, and how many times it changed.
export function heldStats(f, who = 'user') {
    const tl = timeline(f, who);
    if (!tl.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    return { days: Math.max(1, daysBetween(tl[0].on, today) + 1), updates: tl.length - 1, since: tl[0].on };
}
