// Fetches recent headlines for the screener's top composite scorers and
// quantifies them with a TRANSPARENT keyword lexicon. This is a counting
// machine, not comprehension: +1 per positive-keyword headline, -1 per
// negative, weighted by recency (x2 within 7 days, x1 within 30, x0.5 older).
// Output: news.json — build-screener.mjs merges it into the News column.
// Usage: node fetch-news.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';

const TOP = new URL('./top-list.json', import.meta.url);
if (!existsSync(TOP)) { console.log('no top-list.json - run build-screener.mjs first'); process.exit(0); }
const syms = JSON.parse(readFileSync(TOP, 'utf8'));

const POS = [/upgrad/i, /raises? (guidance|outlook|forecast|dividend|target)/i, /beats?\b/i, /tops (estimates|expectations)/i,
    /record (revenue|profit|earnings|quarter|sales)/i, /buyback|repurchase/i, /dividend (increase|hike|boost)/i,
    /wins\b|awarded/i, /approv/i, /breakthrough/i, /surges?|soars?|jumps?|rallies/i, /outperform/i,
    /to be acquired|acquisition of .* completed|takeover (bid|offer)/i, /profit (rises|up|climbs|doubles)/i, /strong (demand|results|quarter)/i];
const NEG = [/downgrad/i, /cuts? (guidance|outlook|forecast|dividend|jobs)/i, /miss(es|ed)?\b/i, /lawsuit|sues\b|sued\b/i,
    /probe|investigat/i, /recall/i, /bankrupt/i, /warn(s|ing)/i, /plunges?|tumbles?|sinks?|slumps?|craters?|falls? sharply/i,
    /layoffs?|job cuts/i, /fraud/i, /sec charges/i, /halt(s|ed)/i, /delist/i, /going concern/i,
    /(secondary|share|stock) offering|dilut/i, /(ceo|cfo) (resigns|departs|steps down)/i, /short (seller|report)/i, /underperform/i];

let yf = null;
async function newsFor(sym) {
    if (!yf) { const { default: YF } = await import('yahoo-finance2'); yf = new YF({ suppressNotices: ['yahooSurvey'] }); }
    const r = await yf.search(sym.replace(/\./g, '-'), { newsCount: 8, quotesCount: 0 });
    return (r.news || []).map(n => ({
        title: n.title || '',
        t: n.providerPublishTime ? new Date(n.providerPublishTime).getTime() : null,
    })).filter(n => n.title);
}

const out = {};
let done = 0;
for (const sym of syms) {
    try {
        const items = await newsFor(sym);
        let score = 0;
        const lines = [];
        for (const n of items) {
            const pos = POS.some(re => re.test(n.title));
            const neg = NEG.some(re => re.test(n.title));
            const s = (pos ? 1 : 0) - (neg ? 1 : 0);
            const ageDays = n.t ? (Date.now() - n.t) / 86400e3 : 60;
            const w = ageDays <= 7 ? 2 : ageDays <= 30 ? 1 : 0.5;
            score += s * w;
            const mark = s > 0 ? '[+]' : s < 0 ? '[-]' : '[ ]';
            lines.push(`${mark} ${n.title}${n.t ? ` (${Math.round(ageDays)}d)` : ''}`);
        }
        out[sym] = { score: +score.toFixed(1), n: items.length, tip: lines.slice(0, 8).join('\n') };
        done++;
    } catch (_) { /* no news is fine */ }
    await new Promise(r => setTimeout(r, 120));
}
writeFileSync(new URL('./news.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`news.json written — headlines scored for ${done}/${syms.length} top companies. Re-run build-screener.mjs to merge.`);
