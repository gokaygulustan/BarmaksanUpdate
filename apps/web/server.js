const { createServer } = require('http');
const https = require('https');
const { parse } = require('url');
const next = require('next');

const app = next({ dev: false });
const handle = app.getRequestHandler();

const port = parseInt(process.env.PORT || '3000', 10);
const apiOrigin = process.env.API_INTERNAL_ORIGIN || 'http://127.0.0.1:4000';
const apiBase = new URL(apiOrigin);

function proxyToApi(req, res) {
  const isHttps = apiBase.protocol === 'https:';
  const client = isHttps ? https : require('http');
  const proxyReq = client.request(
    {
      protocol: apiBase.protocol,
      hostname: apiBase.hostname,
      port: apiBase.port || (isHttps ? 443 : 80),
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: apiBase.host,
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': 'https',
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ message: 'API is unreachable' }));
  });

  req.pipe(proxyReq);
}

function shouldProxyToApi(url) {
  if (!url) return false;
  const path = url.split('?')[0];
  return (
    path === '/api' ||
    path.startsWith('/api/') ||
    path.startsWith('/uploads/')
  );
}

app.prepare().then(() => {
  createServer((req, res) => {
    if (req.url && shouldProxyToApi(req.url)) {
      proxyToApi(req, res);
      return;
    }
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log('> Ready on http://0.0.0.0:%s', port);
  });
});
