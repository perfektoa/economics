// Tiny local server for the macro monitor — serves the dashboard. Binds
// 127.0.0.1 only.
//   GET  /   -> dashboard.html
// It used to also host the Forecast Journal write API; that feature was removed,
// so this is now a plain static file server for the built dashboard.
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8787;
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
    const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    try {
        let p = req.url === '/' ? '/dashboard.html' : req.url.split('?')[0];
        p = path.normalize(path.join(ROOT, p));
        if (!p.startsWith(ROOT) || !existsSync(p)) return send(404, { error: 'not found' });
        return send(200, readFileSync(p), MIME[path.extname(p)] || 'application/octet-stream');
    } catch (e) { return send(500, { error: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.log(`macro-monitor server on http://localhost:${PORT}`));
