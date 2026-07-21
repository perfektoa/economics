// Tiny local server for the macro monitor — serves the dashboard and handles
// Forecast Journal edits from the page. Binds 127.0.0.1 only.
//   GET  /                          -> dashboard.html
//   POST /api/forecast              -> add {question,p,deadline,series?,op?,value?,mode?}
//   POST /api/forecast/resolve      -> {id, outcome: 1|0}   (manual forecasts)
//   POST /api/forecast/delete       -> {id}
// After any mutation: re-scores + rebuilds the dashboard before responding.
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8787;
const FILE = path.join(ROOT, 'forecasts.json');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

const loadDb = () => existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { forecasts: [] };
const saveDb = (db) => writeFileSync(FILE, JSON.stringify(db, null, 1));
function rebuild() {
    const env = { ...process.env, QGEN_QUIET: '1' }; // no phone ping — the user is already on the page
    try {
        execFileSync('node', [path.join(ROOT, 'check-forecasts.mjs')], { cwd: ROOT, stdio: 'ignore', env });
        execFileSync('node', [path.join(ROOT, 'generate-questions.mjs')], { cwd: ROOT, stdio: 'ignore', env });
        execFileSync('node', [path.join(ROOT, 'build-dashboard.mjs')], { cwd: ROOT, stdio: 'ignore', env });
    } catch (e) { console.error('rebuild failed:', e.message); }
}

const readBody = (req) => new Promise((res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (_) { res({}); } });
});

createServer(async (req, res) => {
    const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    try {
        if (req.method === 'POST' && req.url === '/api/forecast') {
            const b = await readBody(req);
            if (!b.question || !b.p || !b.deadline) return send(400, { error: 'question, p, deadline required' });
            const db = loadDb();
            const id = 'f' + (db.forecasts.length + 1) + '-' + Math.random().toString(36).slice(2, 6);
            db.forecasts.push({
                id, question: String(b.question).slice(0, 200), p: Math.min(0.99, Math.max(0.01, (+b.p) / 100)),
                created: new Date().toISOString().slice(0, 10), deadline: b.deadline,
                resolve: b.series ? { series: b.series, op: b.op || '>', value: +b.value, mode: b.mode || 'any' } : null,
                outcome: null, resolvedOn: null,
            });
            saveDb(db); rebuild();
            return send(200, { ok: true, id });
        }
        if (req.method === 'POST' && req.url === '/api/forecast/answer') {
            const b = await readBody(req);
            const db = loadDb();
            const f = db.forecasts.find(x => x.id === b.id);
            if (!f) return send(404, { error: 'no such id' });
            if (f.outcome != null) return send(400, { error: 'already resolved' });
            const today = new Date().toISOString().slice(0, 10);
            // Edits allowed until the answer window closes (askBy, else deadline).
            if (f.p != null && today > (f.askBy || f.deadline)) return send(400, { error: 'answer window closed — pick is locked' });
            if (!(+b.p >= 1 && +b.p <= 99)) return send(400, { error: 'probability must be 1-99' });
            if (f.p != null) f.pHistory = [...(f.pHistory || []), { p: f.p, on: f.answeredOn }];
            f.p = (+b.p) / 100;
            f.answeredOn = today;
            saveDb(db); rebuild();
            return send(200, { ok: true });
        }
        if (req.method === 'POST' && req.url === '/api/forecast/resolve') {
            const b = await readBody(req);
            const db = loadDb();
            const f = db.forecasts.find(x => x.id === b.id);
            if (!f) return send(404, { error: 'no such id' });
            f.outcome = b.outcome ? 1 : 0;
            f.resolvedOn = new Date().toISOString().slice(0, 10);
            saveDb(db); rebuild();
            return send(200, { ok: true });
        }
        if (req.method === 'POST' && req.url === '/api/forecast/delete') {
            const b = await readBody(req);
            const db = loadDb();
            const n = db.forecasts.length;
            db.forecasts = db.forecasts.filter(x => x.id !== b.id);
            if (db.forecasts.length === n) return send(404, { error: 'no such id' });
            // Passing on a generated question retires it so it's never re-asked.
            if (String(b.id).startsWith('q-')) db.retired = [...(db.retired || []), b.id];
            saveDb(db); rebuild();
            return send(200, { ok: true });
        }
        // static
        let p = req.url === '/' ? '/dashboard.html' : req.url.split('?')[0];
        p = path.normalize(path.join(ROOT, p));
        if (!p.startsWith(ROOT) || !existsSync(p)) return send(404, { error: 'not found' });
        return send(200, readFileSync(p), MIME[path.extname(p)] || 'application/octet-stream');
    } catch (e) { return send(500, { error: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.log(`macro-monitor server on http://localhost:${PORT}`));
