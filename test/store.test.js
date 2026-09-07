import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/core/store.js';
import { idempotent, canonical } from '../src/core/idempotency.js';

function store(t) { const value = new Store(); t.after(() => value.close()); return value; }

test('records retain immutable identity and increment revision', t => {
  const db = store(t);
  const item = db.create('item', { title: 'first' });
  const updated = db.update('item', item.id, { title: 'second', id: 'changed', createdAt: 0 }, 1);
  assert.equal(updated.id, item.id);
  assert.equal(updated.createdAt, item.createdAt);
  assert.equal(updated.revision, 2);
  assert.equal(db.get('item', item.id).title, 'second');
});

test('stale revisions cannot overwrite records', t => {
  const db = store(t);
  const item = db.create('item', {});
  db.update('item', item.id, { title: 'new' }, 1);
  assert.throws(() => db.update('item', item.id, { title: 'old' }, 1), { code: 'revision_conflict' });
  assert.equal(db.get('item', item.id).title, 'new');
});

test('outer transaction rolls back nested records and audit events', t => {
  const db = store(t);
  assert.throws(() => db.transaction(() => {
    db.create('item', {});
    db.transaction(() => { db.event('item.created', 'one'); });
    throw new Error('abort');
  }));
  assert.equal(db.all('item').length, 0);
  assert.equal(db.events().length, 0);
});

test('savepoint rollback does not erase successful outer work', t => {
  const db = store(t);
  db.transaction(() => {
    db.create('item', {}, 'keep');
    assert.throws(() => db.transaction(() => { db.create('item', {}, 'drop'); throw new Error('abort'); }));
    db.create('item', {}, 'also-keep');
  });
  assert.deepEqual(db.all('item').map(item => item.id).sort(), ['also-keep', 'keep']);
});

test('asynchronous transaction callbacks are rejected', t => {
  const db = store(t);
  assert.throws(() => db.transaction(() => Promise.resolve('wrong')), /synchronous/);
});

test('duplicate IDs produce a conflict without altering existing data', t => {
  const db = store(t);
  db.create('item', { value: 1 }, 'stable');
  assert.throws(() => db.create('item', { value: 2 }, 'stable'), { code: 'already_exists' });
  assert.equal(db.get('item', 'stable').value, 1);
});

test('record types isolate identical IDs', t => {
  const db = store(t);
  db.create('left', { value: 1 }, 'same');
  db.create('right', { value: 2 }, 'same');
  assert.equal(db.get('left', 'same').value, 1);
  assert.equal(db.get('right', 'same').value, 2);
});

test('missing records use a stable not-found error', t => {
  assert.throws(() => store(t).get('item', 'missing'), { status: 404, code: 'not_found' });
});

test('audit cursors return ordered events without duplicates', t => {
  const db = store(t);
  for (let i = 0; i < 5; i++) db.event('changed', i % 2 ? 'a' : 'b', { i });
  const first = db.events({ limit: 2 });
  const second = db.events({ after: first.at(-1).sequence, limit: 2 });
  assert.deepEqual([...first, ...second].map(event => event.data.i), [0, 1, 2, 3]);
  assert.deepEqual(db.events({ resourceId: 'a' }).map(event => event.data.i), [1, 3]);
});

test('idempotency replays canonical requests exactly once', t => {
  const db = store(t);
  let count = 0;
  const run = request => idempotent(db, 'order:1', request, () => ({ count: ++count }));
  assert.deepEqual(run({ b: 2, a: 1 }), { count: 1 });
  assert.deepEqual(run({ a: 1, b: 2 }), { count: 1 });
  assert.equal(count, 1);
  assert.throws(() => run({ a: 9 }), { code: 'idempotency_conflict' });
});

test('failed idempotent operations do not consume the key', t => {
  const db = store(t);
  assert.throws(() => idempotent(db, 'retry', {}, () => { db.create('item', {}); throw new Error('failed'); }));
  assert.equal(db.all('item').length, 0);
  assert.deepEqual(idempotent(db, 'retry', {}, () => ({ ok: true })), { ok: true });
});

test('expired keys permit a new operation', t => {
  let now = 100;
  const db = new Store(':memory:', () => now);
  t.after(() => db.close());
  db.remember('key', 'hash', { old: true }, 10);
  now = 110;
  assert.equal(db.remembered('key', 'hash'), undefined);
  assert.deepEqual(idempotent(db, 'key', {}, () => ({ fresh: true })), { fresh: true });
});

test('canonical serialization preserves array order and null', () => {
  assert.equal(canonical({ z: [2, 1], a: null }), '{"a":null,"z":[2,1]}');
});

test('database state and idempotency survive close and reopen', t => {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-db-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'store.sqlite');
  const first = new Store(filename);
  first.create('item', { name: 'durable' }, 'one');
  first.remember('key', 'hash', { saved: true });
  first.close();
  const second = new Store(filename);
  try {
    assert.equal(second.get('item', 'one').name, 'durable');
    assert.deepEqual(second.remembered('key', 'hash'), { saved: true });
    assert.equal(second.integrity(), true);
  } finally { second.close(); }
});

test('online backup contains committed data and passes integrity checks', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-backup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = store(t);
  first.create('item', { value: 42 }, 'answer');
  const destination = join(directory, 'backup.sqlite');
  await first.backup(destination);
  const copy = new Store(destination);
  try { assert.equal(copy.get('item', 'answer').value, 42); assert.equal(copy.integrity(), true); }
  finally { copy.close(); }
});
