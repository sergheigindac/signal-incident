import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function idempotent(store, key, request, callback) {
  if (!key) return store.transaction(callback);
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(key)) throw new AppError(422, 'invalid_idempotency_key', 'Key must contain 1–120 safe ASCII characters');
  const fingerprint = createHash('sha256').update(canonical(request)).digest('hex');
  return store.transaction(() => {
    const previous = store.remembered(key, fingerprint);
    if (previous !== undefined) return previous;
    const response = callback();
    store.remember(key, fingerprint, response);
    return response;
  });
}
