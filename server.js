import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (Boolean(url) !== Boolean(key) || (process.env.RENDER === 'true' && !url)) {
  throw new Error('Nastavte SUPABASE_URL a SUPABASE_PUBLISHABLE_KEY.');
}

const assets = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript'],
  '/offline.html': ['offline.html', 'text/html'],
  '/icons/icon-180.png': ['icons/icon-180.png', 'image/png'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png']
};

createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET') return res.writeHead(405).end();
  if (req.url === '/healthz') return res.end('ok');
  if (req.url === '/config') {
    res.setHeader('Cache-Control', 'no-store');
    return res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify({url, key}));
  }
  const asset = Object.hasOwn(assets, req.url) && assets[req.url];
  if (!asset) return res.writeHead(404).end();
  try {
    const content = await readFile(new URL('public/' + asset[0], import.meta.url));
    if (req.url === '/sw.js') res.setHeader('Cache-Control', 'no-cache');
    const mime = asset[1].startsWith('image/') ? asset[1] : asset[1] + '; charset=utf-8';
    res.writeHead(200, {'Content-Type': mime}).end(content);
  } catch {
    res.writeHead(500).end();
  }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
