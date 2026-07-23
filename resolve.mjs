// Shared resolution logic so the dashboard and the resolver can never disagree
// about what a forecast's answer is.
//
// `provisional` is the difference between "this WILL resolve" and "this HAS
// resolved". The dashboard uses it to show the answer the moment the deciding
// print lands, while check-forecasts stays conservative and waits a day — for
// monthly series the deadline can arrive before the deciding print publishes,
// and resolving eagerly would lock in a stale number.
const test = (op, a, b) => op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;

export function evaluateForecast(f, obs, today, { provisional = false } = {}) {
    if (!f?.resolve || !obs?.length) return null;
    const from = f.resolve.from || f.created;
    const inWindow = obs.filter(o => o.d >= from && o.d <= f.deadline);
    const mode = f.resolve.mode || 'any';
    const due = provisional ? today >= f.deadline : today > f.deadline;
    if (mode === 'any') {
        const hit = inWindow.find(o => test(f.resolve.op, o.v, f.resolve.value));
        if (hit) return { outcome: 1, when: hit.d, deciding: hit.v };
        if (due) return { outcome: 0, when: f.deadline, deciding: null };
        return null;
    }
    if (due && inWindow.length) {
        const last = inWindow[inWindow.length - 1];
        return { outcome: test(f.resolve.op, last.v, f.resolve.value) ? 1 : 0, when: last.d, deciding: last.v };
    }
    return null;
}

// The close date used for scoring: for a scheduled release the deadline IS the
// publication day, so it must not drift to whenever the checker happened to run.
export const closeDateFor = (f, when, today) =>
    (f.resolve?.mode || 'any') === 'final' ? f.deadline : (when > today ? when : today);
