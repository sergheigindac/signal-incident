import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers.js';

test('health and static console are public; operational endpoints require authentication', async t => {
  const f = await api(t);
  assert.equal((await f.request('/health', { headers: { authorization: '' } })).status, 200);
  assert.equal((await f.request('/', { headers: { authorization: '' } })).status, 200);
  for (const path of ['/ready', '/metrics', '/api/events', '/openapi.json']) {
    const result = await f.request(path, { headers: { authorization: '' } });
    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, 'unauthorized');
    assert.ok(result.data.error.requestId);
  }
});

test('security headers and request identifiers are returned', async t => {
  const f = await api(t);
  const result = await f.request('/health');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.match(result.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(result.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
});

test('OpenAPI covers every domain operation', async t => {
  const f = await api(t);
  const response = await f.request('/openapi.json');
  assert.equal(response.status, 200);
  const operations = Object.values(response.data.paths).flatMap(path => Object.values(path));
  assert.equal(operations.length, f.domain.routes.length);
  assert.equal(new Set(operations.map(o => o.operationId)).size, operations.length);
});

test('unknown routes and unsupported methods return not found', async t => {
  const f = await api(t);
  assert.equal((await f.request('/api/does-not-exist')).status, 404);
  assert.equal((await f.request('/health', { method: 'DELETE' })).status, 404);
});

test('invalid JSON, media types, and oversized requests are rejected', async t => {
  const f = await api(t);
  const route = f.domain.routes.find(r => r[0] === 'POST' && !r[1].includes(':'));
  assert.equal((await f.request(route[1], { method: 'POST', raw: '{broken' })).status, 400);
  assert.equal((await f.request(route[1], { method: 'POST', raw: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.request(route[1], { method: 'POST', raw: JSON.stringify({ data: 'x'.repeat(66_000) }) })).status, 413);
});

test('rate limits apply to authentication failures and expose retry hints', async t => {
  const f = await api(t, { rateLimit: 2 });
  await f.request('/ready');
  await f.request('/ready');
  const result = await f.request('/ready');
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '60');
  assert.equal((await f.request('/health')).status, 200);
});

test('event API validates cursor bounds and returns the next sequence', async t => {
  const f = await api(t);
  f.store.event('test.one', 'one');
  f.store.event('test.two', 'two');
  const first = await f.request('/api/events?limit=1');
  assert.equal(first.data.items.length, 1);
  const second = await f.request('/api/events?after=' + first.data.next);
  assert.equal(second.data.items[0].type, 'test.two');
  assert.equal((await f.request('/api/events?after=-1')).status, 422);
  assert.equal((await f.request('/api/events?limit=201')).status, 422);
});

test('readiness verifies SQLite and metrics use Prometheus text format', async t => {
  const f = await api(t);
  assert.deepEqual((await f.request('/ready')).data, { ready: true });
  const response = await f.request('/metrics');
  assert.equal(response.status, 200);
  assert.match(response.data, /app_requests_total [0-9]+/);
  assert.match(response.headers.get('content-type'), /text\/plain/);
});

test('encoded path separators are rejected as invalid identifiers', async t => {
  const f = await api(t);
  const route = f.domain.routes.find(r => r[0] === 'GET' && r[1].endsWith('/:id'));
  assert.equal((await f.request(route[1].replace(':id', 'bad%2Fid'))).status, 422);
});

test('list endpoints enforce pagination', async t => {
  const f = await api(t);
  const route = f.domain.routes.find(r => r[0] === 'GET' && r[2].startsWith('list'));
  const result = await f.request(route[1] + '?limit=2&offset=0');
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { items: [], total: 0, limit: 2, offset: 0 });
  assert.equal((await f.request(route[1] + '?limit=999')).status, 422);
});
