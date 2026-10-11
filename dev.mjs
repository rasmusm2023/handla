// Local stand-in for Vercel: serves public/ and routes /api/* to the same handlers.
// Usage: npm run dev  → http://localhost:3000  (ingest key is "dev" unless INGEST_TOKEN is set)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
      const handlers = await import(`./api/${name}.js`);
      const handler = handlers[req.method];
      if (!handler) return res.writeHead(405).end();
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const response = await handler(new Request(url, { method: req.method, headers: req.headers, body: hasBody ? Buffer.concat(chunks) : undefined }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(await response.text());
    }
    const file = path.join(root, 'public', path.normalize(url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(path.join(root, 'public'))) return res.writeHead(403).end();
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' || err.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500).end(String(err.message));
  }
}).listen(port, () => console.log(`Deal Hunter running at http://localhost:${port}`));
