import test from 'node:test';
import assert from 'node:assert/strict';
import { text, integer, boolean, object, list, enumeration, validate, page } from '../src/core/validation.js';
import { configuration } from '../src/core/config.js';

test('objects reject unknown and missing fields', () => {
  const schema = object({ name: text('Name') });
  assert.throws(() => validate(schema, {}), { code: 'validation_error' });
  assert.throws(() => validate(schema, { name: 'a', extra: true }), { code: 'validation_error' });
  assert.throws(() => validate(schema, null), { code: 'validation_error' });
});

test('optional defaults are applied without mutating input', () => {
  const schema = object({ enabled: boolean('Enabled', { default: true }) }, []);
  const input = {};
  assert.deepEqual(validate(schema, input), { enabled: true });
  assert.deepEqual(input, {});
});

for (const value of [NaN, Infinity, 1.5, '1', null, true, -1, Number.MAX_SAFE_INTEGER + 1]) {
  test('integer rejects ' + String(value), () => assert.throws(() => validate(integer('Count'), value), { code: 'validation_error' }));
}

for (const value of ['', ' a', 'a ', 'a\u0000b', 1, null, [], {}]) {
  test('text rejects ' + JSON.stringify(value), () => assert.throws(() => validate(text('Name'), value), { code: 'validation_error' }));
}

test('nested arrays report the failing field path', () => {
  const schema = object({ lines: list(object({ quantity: integer('Units', { minimum: 1 }) })) });
  assert.throws(() => validate(schema, { lines: [{ quantity: 0 }] }), error => error.details.path === 'body.lines[0].quantity');
});

test('enumerations and string patterns enforce domain vocabulary', () => {
  assert.throws(() => validate(enumeration('State', ['open', 'closed']), 'unknown'));
  assert.throws(() => validate(text('SKU', { pattern: '^[A-Z]+$' }), 'lowercase'));
  assert.equal(validate(enumeration('State', ['open', 'closed']), 'open'), 'open');
});

test('pagination bounds and offsets are consistent', () => {
  assert.deepEqual(page({ limit: '2', offset: '1' }, [1, 2, 3, 4]), { items: [2, 3], total: 4, limit: 2, offset: 1 });
  assert.deepEqual(page({ offset: '9' }, [1]).items, []);
  for (const query of [{ limit: '0' }, { limit: '201' }, { offset: '-1' }, { offset: 'x' }]) assert.throws(() => page(query, []));
});

test('configuration fails fast on missing secrets and bad numeric options', () => {
  const token = 'a'.repeat(24);
  assert.throws(() => configuration({}), /API_TOKEN/);
  assert.throws(() => configuration({ API_TOKEN: token, PORT: '0' }), /PORT/);
  assert.throws(() => configuration({ API_TOKEN: token, TICK_MS: '1' }), /TICK_MS/);
  assert.equal(configuration({ API_TOKEN: token }, 4310).port, 4310);
  assert.equal(configuration({ API_TOKEN: token }).host, '127.0.0.1');
});
