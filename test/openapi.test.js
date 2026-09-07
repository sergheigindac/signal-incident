import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers.js';
import { openapi } from '../src/core/openapi.js';

test('checked-in OpenAPI matches the running application', t => {
  const f = fixture(t);
  const actual = openapi('Signal Incident', f.domain.routes);
  const expected = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual, expected);
});
