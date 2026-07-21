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
const cards = hosts.charts._cards || [];
console.log(`charts rendered: ${cards.length}, svg elements: ${svgs.length}`);
if (cards.length < 10) { console.error('FAIL: fewer than 10 charts'); fails++; }
for (const s of svgs) {
    if (/NaN|Infinity/.test(s._inner)) {
        console.error('FAIL: NaN/Infinity in svg markup:', s._inner.slice(0, 160)); fails++; break;
    }
}
const paths = svgs.filter(s => s._inner.includes('<path'));
if (paths.length < 10) { console.error(`FAIL: only ${paths.length} svgs contain line paths`); fails++; }
console.log(fails ? `${fails} FAILURES` : 'RENDER SMOKE PASS');
process.exit(fails ? 1 : 0);
