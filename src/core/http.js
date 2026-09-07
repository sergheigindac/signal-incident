import { createServer } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AppError } from './errors.js';
import { validate, page } from './validation.js';
import { idempotent } from './idempotency.js';
import { openapi } from './openapi.js';

function authorized(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request) {
  const contentType = request.headers['content-type']?.split(';')[0].trim();
  if (contentType !== 'application/json') throw new AppError(415, 'unsupported_media_type', 'Use application/json');
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > 65_536) throw new AppError(413, 'body_too_large', 'Request body exceeds 64 KiB');
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 65_536) throw new AppError(413, 'body_too_large', 'Request body exceeds 64 KiB');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'invalid_json', 'Request body is not valid JSON'); }
}

function match(route, pathname) {
  const template = route.split('/');
  const actual = pathname.split('/');
  if (template.length !== actual.length) return null;
  const params = {};
  for (let index = 0; index < template.length; index++) {
    if (template[index].startsWith(':')) {
      let value;
      try { value = decodeURIComponent(actual[index]); }
      catch { throw new AppError(400, 'invalid_path', 'Path encoding is invalid'); }
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new AppError(422, 'invalid_identifier', 'Invalid resource identifier');
      params[template[index].slice(1)] = value;
    } else if (template[index] !== actual[index]) return null;
  }
  return params;
}

export function createHttp({ store, domain, token, title, logger = line => console.log(JSON.stringify(line)), rateLimit = 600 }) {
  if (typeof token !== 'string' || token.length < 24) throw new Error('A bearer token of at least 24 characters is required');
  const counters = { requests: 0, errors: 0, durationMs: 0 };
  const buckets = new Map();
  const document = openapi(title, domain.routes);
  const assets = new Map([
    ['/', ['text/html; charset=utf-8', readFileSync(new URL('../../public/index.html', import.meta.url))]],
    ['/app.js', ['text/javascript; charset=utf-8', readFileSync(new URL('../../public/app.js', import.meta.url))]],
    ['/style.css', ['text/css; charset=utf-8', readFileSync(new URL('../../public/style.css', import.meta.url))]],
  ]);

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    const started = performance.now();
    counters.requests++;
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let pathname = '/';
    const send = (status, data, contentType = 'application/json; charset=utf-8') => {
      response.statusCode = status;
      response.setHeader('content-type', contentType);
      response.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      pathname = url.pathname;
      if (request.method === 'GET' && pathname === '/health') return send(200, { status: 'ok' });
      if (request.method === 'GET' && assets.has(pathname)) {
        const [type, body] = assets.get(pathname);
        return send(200, body, type);
      }
      const address = request.socket.remoteAddress ?? 'unknown';
      const minute = Math.floor(Date.now() / 60_000);
      const current = buckets.get(address);
      const bucket = current?.minute === minute ? current : { minute, count: 0 };
      bucket.count++;
      buckets.set(address, bucket);
      if (buckets.size > 10_000) for (const [key, value] of buckets) if (value.minute !== minute) buckets.delete(key);
      if (bucket.count > rateLimit) {
        response.setHeader('retry-after', '60');
        throw new AppError(429, 'rate_limited', 'Request rate exceeded');
      }
      if (!authorized(request.headers.authorization, token)) throw new AppError(401, 'unauthorized', 'Valid bearer token required');
      if (request.method === 'GET' && pathname === '/openapi.json') return send(200, document);
      if (request.method === 'GET' && pathname === '/ready') return send(store.integrity() ? 200 : 503, { ready: store.integrity() });
      if (request.method === 'GET' && pathname === '/metrics') return send(200,
        '# TYPE app_requests_total counter\napp_requests_total ' + counters.requests + '\n' +
        '# TYPE app_errors_total counter\napp_errors_total ' + counters.errors + '\n' +
        '# TYPE app_request_duration_ms_total counter\napp_request_duration_ms_total ' + counters.durationMs + '\n',
        'text/plain; version=0.0.4');
      const query = Object.fromEntries(url.searchParams);
      if (request.method === 'GET' && pathname === '/api/events') {
        const after = Number(query.after ?? 0);
        const limit = Number(query.limit ?? 100);
        if (!Number.isSafeInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new AppError(422, 'invalid_cursor', 'after must be nonnegative and limit must be 1–200');
        const items = store.events({ after, limit, resourceId: query.resourceId });
        return send(200, { items, next: items.at(-1)?.sequence ?? after });
      }
      let selected;
      let params;
      for (const route of domain.routes) {
        if (route[0] !== request.method) continue;
        const result = match(route[1], pathname);
        if (result) { selected = route; params = result; break; }
      }
      if (!selected) throw new AppError(404, 'route_not_found', 'No matching API route');
      const [method, , operationId, , schema, handler] = selected;
      const body = schema ? validate(schema, await readBody(request)) : undefined;
      const execute = () => handler({ params, query, body });
      let result = method === 'GET' ? execute() : idempotent(store, request.headers['idempotency-key'], { operationId, params, body }, execute);
      if (Array.isArray(result)) result = page(query, result);
      send(200, result);
    } catch (error) {
      counters.errors++;
      const known = error instanceof AppError;
      if (!known) logger({ level: 'error', requestId, message: error.message });
      if (!response.headersSent && !response.destroyed) send(known ? error.status : 500, {
        error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Unexpected server error', requestId, ...(known && error.details ? { details: error.details } : {}) },
      });
    } finally {
      const durationMs = Math.round((performance.now() - started) * 1000) / 1000;
      counters.durationMs += durationMs;
      logger({ level: 'info', requestId, method: request.method, path: pathname, status: response.statusCode, durationMs });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  return server;
}
