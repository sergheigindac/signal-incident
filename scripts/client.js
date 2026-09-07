import { readFileSync } from 'node:fs';

const [method = 'GET', path = '/api/events', filename] = process.argv.slice(2);
const token = process.env.API_TOKEN;
if (!token) throw new Error('Set API_TOKEN before using the client');
if (!path.startsWith('/')) throw new Error('API path must start with /');
const options = { method: method.toUpperCase(), headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15_000) };
if (options.method !== 'GET') {
  options.headers['content-type'] = 'application/json';
  options.body = filename ? readFileSync(filename, 'utf8') : '{}';
  JSON.parse(options.body);
  if (process.env.IDEMPOTENCY_KEY) options.headers['idempotency-key'] = process.env.IDEMPOTENCY_KEY;
}
const response = await fetch((process.env.API_URL ?? ('http://127.0.0.1:' + (process.env.PORT ?? 4330))) + path, options);
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
