// Headless smoke test: extracts the inline <script> from dashboard.html and
// executes it against a minimal DOM stub. Fails on exceptions, NaN coordinates
// in any chart path, or zero charts rendered.
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: no script found'); process.exit(1); }

const svgs = [];
function makeEl(tag) {
    return {
        tag, className: '', style: {}, attrs: {}, children: [], _inner: '',
        set innerHTML(v) { this._inner = v; if (this.tag === 'svg') svgs.push(this); },
        get innerHTML() { return this._inner; },
        setAttribute(k, v) { this.attrs[k] = v; },
        appendChild(c) { this.children.push(c); return c; },
        querySelector(sel) { if (sel === 'svg') { const s = makeEl('svg'); this.children.push(s); return s; } return makeEl('div'); },
        addEventListener() {},
        getBoundingClientRect() { return { left: 0, width: 520 }; },
    };
}
const hosts = {};
const documentStub = {
    getElementById(id) { return hosts[id] || (hosts[id] = makeEl('div')); },
    createElement(tag) { return makeEl(tag); },
    createElementNS(ns, tag) { return makeEl(tag); },
    querySelectorAll() { return []; },
};
hosts.charts = Object.assign(makeEl('div'), {
    _cards: [],
    set innerHTML(v) { this._inner = v; },
    get innerHTML() { return this._inner; },
    appendChild(c) { this._cards.push(c); return c; },
});

let fails = 0;
try {
    new Function('document', 'window', m[1])(documentStub, {});
} catch (e) {
    console.error('FAIL: script threw:', e.message); fails++;
}
// Charts live one level down now: #charts holds a heading + a .charts grid per
// section, and the cards hang off the grids. Counting only direct children of
// #charts would report the number of SECTIONS and pass while every chart was
// missing, so walk the tree and count actual cards.
const countCards = (el, depth = 0) => {
    if (!el || depth > 4) return 0;
    const kids = el._cards || el.children || [];
    let n = 0;
    for (const c of kids) n += (c.className === 'card' ? 1 : 0) + countCards(c, depth + 1);
    return n;
};
const cards = countCards(hosts.charts);
const sections = (hosts.charts._cards || []).filter(c => c.tag === 'h3').length;
console.log(`charts rendered: ${cards} in ${sections} sections, svg elements: ${svgs.length}`);
if (cards < 10) { console.error('FAIL: fewer than 10 charts'); fails++; }
if (sections < 5) { console.error(`FAIL: only ${sections} chart sections`); fails++; }
if (hosts['chart-nav'] && !/href="#sec-/.test(hosts['chart-nav']._inner || '')) {
    console.error('FAIL: section nav links missing'); fails++;
}
for (const s of svgs) {
    if (/NaN|Infinity/.test(s._inner)) {
        console.error('FAIL: NaN/Infinity in svg markup:', s._inner.slice(0, 160)); fails++; break;
    }
}
const paths = svgs.filter(s => s._inner.includes('<path'));
if (paths.length < 10) { console.error(`FAIL: only ${paths.length} svgs contain line paths`); fails++; }
console.log(fails ? `${fails} FAILURES` : 'RENDER SMOKE PASS');
process.exit(fails ? 1 : 0);
