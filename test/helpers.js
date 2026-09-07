import { Store } from '../src/core/store.js';
import { createDomain } from '../src/domain/service.js';
import { createHttp } from '../src/core/http.js';
import { validate } from '../src/core/validation.js';

export const token = 'test-token-with-at-least-24-characters';

export function fixture(t, filename = ':memory:') {
  let now = 1_800_000_000_000;
  const store = new Store(filename, () => now);
  const domain = createDomain(store);
  t.after(() => store.close());
  return {
    store, domain, now: () => now,
    advance: ms => { now += ms; },
    call(operationId, body = {}, params = {}, query = {}) {
      const route = domain.routes.find(route => route[2] === operationId);
      if (!route) throw new Error('Unknown operation ' + operationId);
      return store.transaction(() => route[5]({ params, query, body: route[4] ? validate(route[4], body) : undefined }));
    },
  };
}

export async function api(t, options = {}) {
  const f = fixture(t);
  const server = createHttp({ ...f, token, title: 'Test', logger: () => {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    ...f, base,
    async request(path, { method = 'GET', body, headers = {}, raw } = {}) {
      const response = await fetch(base + path, {
        method, headers: { authorization: 'Bearer ' + token, ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000),
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
    },
  };
}
