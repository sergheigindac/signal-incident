/** A small fetch transport with explicit retry and cancellation semantics. */
export class ApiError extends Error {
  constructor(status, problem, requestId) {
    super(problem?.message ?? 'API request failed with status ' + status);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? 'http_error';
    this.details = problem?.details;
    this.requestId = requestId;
  }
}

export class Transport {
  constructor({ baseUrl, token, timeoutMs = 10_000, retries = 2, fetchImpl = globalThis.fetch }) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('baseUrl must use HTTP or HTTPS');
    if (url.username || url.password || url.search || url.hash) throw new TypeError('baseUrl must not contain credentials, query, or fragment');
    if (!token || typeof token !== 'string') throw new TypeError('token is required');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new TypeError('timeoutMs must be 1–300000');
    if (!Number.isInteger(retries) || retries < 0 || retries > 5) throw new TypeError('retries must be 0–5');
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.fetch = fetchImpl;
  }

  async request(method, path, { body, query = {}, idempotencyKey, signal } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new TypeError('path must be relative to the configured API host');
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const retryable = method === 'GET' || Boolean(idempotencyKey);
    const attempts = retryable ? this.retries + 1 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response;
      try {
        response = await this.fetch(url, {
          method,
          headers: {
            authorization: 'Bearer ' + this.token,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: combined,
          redirect: 'error',
        });
      } catch (error) {
        if (signal?.aborted || attempt + 1 === attempts) throw error;
        await this.delay(attempt, signal);
        continue;
      }
      const data = await response.json();
      if (response.ok) return data;
      const error = new ApiError(response.status, data.error, response.headers.get('x-request-id'));
      if (![429, 502, 503, 504].includes(response.status) || attempt + 1 === attempts) throw error;
      const retryAfter = Number(response.headers.get('retry-after'));
      await this.delay(attempt, signal, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : undefined);
    }
  }

  async delay(attempt, signal, duration) {
    signal?.throwIfAborted();
    const milliseconds = duration ?? Math.min(100 * 2 ** attempt, 2000);
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  async *pages(path, { query = {}, pageSize = 100, signal } = {}) {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new TypeError('pageSize must be 1–200');
    let offset = 0;
    while (true) {
      const page = await this.request('GET', path, { query: { ...query, limit: pageSize, offset }, signal });
      if (!Array.isArray(page.items)) throw new TypeError('Endpoint does not return a paginated collection');
      yield page;
      offset += page.items.length;
      if (!page.items.length || offset >= page.total) return;
    }
  }

  async *events({ after = 0, signal } = {}) {
    let cursor = after;
    while (true) {
      const page = await this.request('GET', '/api/events', { query: { after: cursor, limit: 200 }, signal });
      for (const event of page.items) yield event;
      if (page.next <= cursor || page.items.length < 200) return;
      cursor = page.next;
    }
  }
}
