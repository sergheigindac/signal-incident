import test from 'node:test';
import assert from 'node:assert/strict';
import { Transport, ApiError } from '../client/transport.js';
import { api, token } from './helpers.js';

test('client authenticates requests and iterates paginated audit events', async t => {
  const f = await api(t, { rateLimit: 10_000 });
  for (let index = 0; index < 205; index++) f.store.event('item.changed', 'item-' + index);
  const client = new Transport({ baseUrl: f.base, token });
  const events = [];
  for await (const event of client.events()) events.push(event);
  assert.equal(events.length, 205);
  assert.equal(new Set(events.map(event => event.id)).size, 205);
});

test('client exposes structured API errors', async t => {
  const f = await api(t);
  const client = new Transport({ baseUrl: f.base, token: 'wrong' });
  await assert.rejects(client.request('GET', '/ready'), error => error instanceof ApiError && error.status === 401 && error.code === 'unauthorized' && Boolean(error.requestId));
});

test('unkeyed mutations are never retried after a transport failure', async () => {
  let attempts = 0;
  const client = new Transport({ baseUrl: 'http://localhost', token, fetchImpl: async () => { attempts++; throw new Error('connection lost'); } });
  await assert.rejects(client.request('POST', '/api/action', { body: {} }), /connection lost/);
  assert.equal(attempts, 1);
});

test('keyed mutations retry transient errors with the same payload', async () => {
  const calls = [];
  const client = new Transport({ baseUrl: 'http://localhost', token, fetchImpl: async (url, options) => {
    calls.push(options);
    if (calls.length === 1) return new Response(JSON.stringify({ error: { code: 'unavailable', message: 'Unavailable' } }), { status: 503 });
    return new Response('{"saved":true}', { status: 200 });
  } });
  assert.deepEqual(await client.request('POST', '/api/action', { body: { value: 1 }, idempotencyKey: 'same-key' }), { saved: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['idempotency-key'], calls[1].headers['idempotency-key']);
});

test('client refuses cross-host paths and credential-bearing base URLs', async () => {
  assert.throws(() => new Transport({ baseUrl: 'http://user:password@localhost', token }));
  const client = new Transport({ baseUrl: 'http://localhost', token });
  await assert.rejects(client.request('GET', '//other-host/api'));
});

test('client cancellation interrupts backoff', async () => {
  const controller = new AbortController();
  const client = new Transport({ baseUrl: 'http://localhost', token });
  const waiting = client.delay(1, controller.signal, 10_000);
  controller.abort(new Error('cancelled'));
  await assert.rejects(waiting, /cancelled/);
});

test('collection iteration stops at the reported total', async () => {
  const offsets = [];
  const client = new Transport({ baseUrl: 'http://localhost', token, fetchImpl: async url => {
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    return new Response(JSON.stringify({ items: [1, 2, 3].slice(offset, offset + 2), total: 3 }));
  } });
  const records = [];
  for await (const page of client.pages('/api/items', { pageSize: 2 })) records.push(...page.items);
  assert.deepEqual(records, [1, 2, 3]);
  assert.deepEqual(offsets, [0, 2]);
});
