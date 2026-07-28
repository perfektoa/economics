// Shared resolution logic so the dashboard and the resolver can never disagree
// about what a forecast's answer is.
//
// `provisional` is the difference between "this WILL resolve" and "this HAS
// resolved". The dashboard uses it to show the answer the moment the deciding
// print lands, while check-forecasts stays conservative and waits a day — for
// monthly series the deadline can arrive before the deciding print publishes,
// and resolving eagerly would lock in a stale number.
import { readFileSync, existsSync } from 'fs';

const test = (op, a, b) => op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
const DAY = 86400e3;

// How far behind real time a feed runs, from the gap between its newest
// observation and when it was fetched. Same-day for gold and the Fed target,
// ~4 days for VIX, ~7 for FRED's WTI spot. Drives the resolution grace period.
export function pubLag(id) {
    const f = new URL(`./data/${id}.json`, import.meta.url);
    if (!existsSync(f)) return 0;
    try {
        const j = JSON.parse(readFileSync(f, 'utf8'));
        const obs = j.obs.filter(o => o.v != null);
        if (!obs.length || !j.fetchedAt) return 0;
        return Math.max(0, Math.round((Date.parse(j.fetchedAt.slice(0, 10)) - Date.parse(obs[obs.length - 1].d)) / DAY));
    } catch (_) { return 0; }
}
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);

// How often does this series publish? Used to tell "the deciding print has
// landed" from "the deadline arrived but the print is not out yet".
function medianGap(obs) {
    const tail = obs.slice(-13);
    if (tail.length < 3) return 400;
    const gaps = [];
    for (let i = 1; i < tail.length; i++) gaps.push(days(tail[i - 1].d, tail[i].d));
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] || 400;
}

// A faster feed for the same underlying thing. Used only to settle a question
// whose own feed has not published by the deadline. The two are not identical —
// FRED quotes WTI spot while Yahoo quotes the front-month future, and they
// differ by a small basis — so the fallback is allowed to decide only when the
// reading is far enough from the threshold that no plausible basis could flip
// it. Inside that band we wait for the real series rather than guess.
export const FASTER_SOURCE = { DCOILWTICO: 'YH_CL', VIXCLS: 'YH_VIX' };
const BASIS_GUARD = 0.02;   // 2% — comfortably wider than spot-vs-futures basis

export function evaluateForecast(f, obs, today, { pubLagDays = 0, altObs = null } = {}) {
    if (!f?.resolve || !obs?.length) return null;
    const from = f.resolve.from || f.created;
    const inWindow = obs.filter(o => o.d >= from && o.d <= f.deadline);
    const mode = f.resolve.mode || 'any';
    if (mode === 'any') {
        // A crossing print is unambiguous the moment it exists.
        const hit = inWindow.find(o => test(f.resolve.op, o.v, f.resolve.value));
        if (hit) return { outcome: 1, when: hit.d, deciding: hit.v };
        if (today > f.deadline) return { outcome: 0, when: f.deadline, deciding: null };
        return null;
    }
    if (today < f.deadline) return null;
    // The primary feed may have NO observation in the window at all — a
    // seven-day-late series against a three-day question window. That is
    // exactly when a faster feed matters, so this must not bail early.
    const last = inWindow.length ? inWindow[inWindow.length - 1] : null;

    // Two kinds of deadline, and confusing them resolves on the wrong day.
    //
    // 'close' (default) — a market price question: "VIX ends Jul 24 above 18.8".
    // The observation is dated by the trading day itself, so the Jul 24 close
    // must actually exist. Without this check the deadline arriving is enough to
    // resolve, and it judges Thursday's close for a question about Friday's.
    // Deadlines landing on a weekend or holiday never get their own observation,
    // hence the grace period before falling back to the last available price.
    //
    // 'release' — an economic release: "claims print above 208k on Jul 23".
    // The observation is dated by reference period (week ending Jul 18) and
    // publishes ON the deadline, so it is legitimately dated earlier. Here the
    // test is whether the print is fresh relative to how often the series
    // publishes, with a long-stop so a discontinued series cannot hang forever.
    if ((f.resolve.at || 'close') === 'close') {
        if (!last || last.d < f.deadline) {
            // The primary feed has not reached the deadline. If a faster feed
            // has, and its reading is nowhere near the threshold, settle now.
            const altIn = (altObs || []).filter(o => o.d >= (f.resolve.from || f.created) && o.d <= f.deadline);
            const altLast = altIn.length ? altIn[altIn.length - 1] : null;
            if (altLast && altLast.d >= f.deadline && Math.abs(altLast.v / f.resolve.value - 1) > BASIS_GUARD) {
                return {
                    outcome: test(f.resolve.op, altLast.v, f.resolve.value) ? 1 : 0,
                    when: altLast.d, deciding: altLast.v, viaFallback: true,
                };
            }
            // Otherwise wait — but only as long as this feed's own publication
            // lag warrants. Measured lags differ wildly: gold and the Fed target
            // are same-day, VIX ~4 days, FRED's WTI spot ~7.
            const grace = Math.max(5, pubLagDays + 3);
            if (days(f.deadline, today) < grace) return null;
        }
    } else {
        if (!last) return null;
        const stale = days(last.d, f.deadline) > medianGap(obs) * 1.6;
        if (stale && days(f.deadline, today) < 30) return null;
    }
    if (!last) return null;      // grace expired with nothing to judge
    return { outcome: test(f.resolve.op, last.v, f.resolve.value) ? 1 : 0, when: last.d, deciding: last.v };
}

// Plain-English statement of how a question settles, derived from the same
// `resolve` block the resolver reads — so the text on screen cannot drift from
// the behaviour. This exists because "VIX falls to 14.9 WITHIN 3 months"
// (any crossing) sat in a batch beside "S&P 500 is higher IN 3 months" (closing
// reading only), and the entire difference in meaning was one preposition. A
// forecast answered under the wrong rule is not a forecast, so the rule now gets
// its own line rather than living inside the phrasing.
export function settleRule(f, fmt = (v) => String(v)) {
    if (!f?.resolve) return 'Resolved by hand.';
    const { op, value, mode } = f.resolve;
    const dir = op === '>' || op === '>=' ? 'above' : 'below';
    if ((mode || 'any') === 'any') {
        return `Settles YES the first time it reads ${dir} ${fmt(value)}. One reading anywhere in the window is enough, and where it ends up on ${f.deadline} does not matter. Settles NO only if it never gets there.`;
    }
    const what = (f.resolve.at || 'close') === 'release'
        ? `the last figure published on or before ${f.deadline}`
        : `the ${f.deadline} closing reading`;
    return `Settles on ${what} and nothing else. What it does in between does not count — it can cross ${fmt(value)} repeatedly and still settle NO.`;
}

// The close date used for scoring: for a scheduled release the deadline IS the
// publication day, so it must not drift to whenever the checker happened to run.
export const closeDateFor = (f, when, today) =>
    (f.resolve?.mode || 'any') === 'final' ? f.deadline : (when > today ? when : today);
