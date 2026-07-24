// Shared resolution logic so the dashboard and the resolver can never disagree
// about what a forecast's answer is.
//
// `provisional` is the difference between "this WILL resolve" and "this HAS
// resolved". The dashboard uses it to show the answer the moment the deciding
// print lands, while check-forecasts stays conservative and waits a day — for
// monthly series the deadline can arrive before the deciding print publishes,
// and resolving eagerly would lock in a stale number.
const test = (op, a, b) => op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
const DAY = 86400e3;
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

export function evaluateForecast(f, obs, today, { provisional = false } = {}) {
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
    if (!inWindow.length || today < f.deadline) return null;
    const last = inWindow[inWindow.length - 1];

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
        if (last.d < f.deadline && days(f.deadline, today) < 5) return null;
    } else {
        const stale = days(last.d, f.deadline) > medianGap(obs) * 1.6;
        if (stale && days(f.deadline, today) < 30) return null;
    }
    return { outcome: test(f.resolve.op, last.v, f.resolve.value) ? 1 : 0, when: last.d, deciding: last.v };
}

// The close date used for scoring: for a scheduled release the deadline IS the
// publication day, so it must not drift to whenever the checker happened to run.
export const closeDateFor = (f, when, today) =>
    (f.resolve?.mode || 'any') === 'final' ? f.deadline : (when > today ? when : today);
