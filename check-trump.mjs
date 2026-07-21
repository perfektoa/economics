// Watches the trumpstruth.org archive (public mirror of Trump's Truth Social
// posts) and pushes an ntfy alert when a NEW post matches market-moving
// keywords (tariffs, Fed, buy/sell, oil, dollar, crypto, ...).
// Edge-triggered: seen post IDs tracked in trump-seen.json; max 3 alerts/run.
// Usage: node check-trump.mjs [--test]   (--test sends the newest post as a demo)
import { readFileSync, writeFileSync, existsSync } from 'fs';

const CONFIG = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const TOPIC = CONFIG.ntfyTopic;
if (!TOPIC) { console.log('no ntfyTopic in config.json - alerts disabled'); process.exit(0); }

const KEYWORDS = [
    /\b(buy|buying|bought)\b/i, /\b(sell|selling)\b/i, /\bstock market\b/i, /\bstocks\b/i, /\b401k|401\(k\)\b/i,
    /\btariffs?\b/i, /\btrade (deal|war|agreement)\b/i, /\bfed\b/i, /\bfederal reserve\b/i, /\bwarsh\b/i, /\bpowell\b/i,
    /\binterest rates?\b/i, /\bdollar\b/i, /\boil\b/i, /\bopec\b/i, /\bdrill/i, /\bgas prices\b/i,
    /\bbitcoin|crypto/i, /\bgold\b/i, /\brecession\b/i, /\binflation\b/i, /\bcrash\b/i, /\bmarket\b/i,
    /\btaxes?\b/i, /\bsanctions?\b/i, /\bchina\b/i,
];

const stateFile = new URL('./trump-seen.json', import.meta.url);
const seen = existsSync(stateFile) ? new Set(JSON.parse(readFileSync(stateFile, 'utf8'))) : null;
const isTest = process.argv.includes('--test');

const res = await fetch('https://trumpstruth.org/feed', { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) { console.error(`feed HTTP ${res.status}`); process.exit(1); }
const xml = await res.text();

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const block = m[1];
    const pick = (re) => (block.match(re) || [])[1] || '';
    return {
        guid: pick(/<guid>([\s\S]*?)<\/guid>/),
        text: pick(/<description><!\[CDATA\[([\s\S]*?)\]\]>/).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        url: pick(/<truth:originalUrl>([\s\S]*?)<\/truth:originalUrl>/) || pick(/<link>([\s\S]*?)<\/link>/),
        date: new Date(pick(/<pubDate>([\s\S]*?)<\/pubDate>/)),
    };
}).filter(i => i.guid);

async function notify(title, body) {
    const r = await fetch(`https://ntfy.sh/${TOPIC}`, {
        method: 'POST', headers: { Title: title, Priority: 'high', Tags: 'loudspeaker' }, body,
    });
    if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
}

if (isTest) {
    const p = items.find(i => i.text.length > 20) || items[0];
    await notify('Trump post monitor connected (test)',
        `${(p.text || '(media post, no text)').slice(0, 300)}\n${p.url}`);
    console.log('test notification sent');
}

if (!seen) {
    // First run: baseline everything currently in the feed, alert nothing.
    writeFileSync(stateFile, JSON.stringify(items.map(i => i.guid)));
    console.log(`baseline saved: ${items.length} existing posts marked seen`);
    process.exit(0);
}

const MAX_AGE_H = 26, MAX_ALERTS = 3;
let sent = 0;
for (const p of items) {
    if (seen.has(p.guid)) continue;
    seen.add(p.guid);
    if (!p.text || (Date.now() - p.date.getTime()) > MAX_AGE_H * 3600e3) continue;
    const hits = KEYWORDS.filter(re => re.test(p.text)).map(re => (p.text.match(re) || [''])[0].toLowerCase());
    if (!hits.length || sent >= MAX_ALERTS) continue;
    try {
        await notify(`Trump post: ${[...new Set(hits)].slice(0, 4).join(', ')}`,
            `${p.text.slice(0, 350)}\n${p.url}`);
        sent++;
        console.log('sent:', hits.join(','), '-', p.text.slice(0, 60));
    } catch (e) { console.error('notify failed:', e.message); }
}
writeFileSync(stateFile, JSON.stringify([...seen].slice(-800)));
if (!sent) console.log('no new market-relevant posts');
