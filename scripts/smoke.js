import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

let child;
let temporary;
let exited;
let base = process.env.API_URL;
const token = process.env.API_TOKEN ?? randomUUID();
const suffix = randomUUID().slice(0, 8);
if (!base) {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  temporary = mkdtempSync(join(tmpdir(), 'portfolio-smoke-'));
  base = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['src/main.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', API_TOKEN: token, DATABASE_PATH: join(temporary, 'smoke.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  exited = new Promise(resolve => child.once('exit', resolve));
}

async function request(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
const get = path => request(path);
const post = (path, body) => request(path, body);

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(base + '/health', { signal: AbortSignal.timeout(1000) }); ready = response.ok; }
    catch { /* The process may still be opening its database. */ }
    if (ready) break;
    if (child && child.exitCode !== null) throw new Error('Server exited before readiness');
    await setTimeout(100);
  }
  assert.ok(ready, 'Server did not become ready');
  assert.deepEqual(await get('/ready'), { ready: true });

const service = await post('/api/services', { name: 'Smoke ' + suffix });
const monitor = await post('/api/monitors', { serviceId: service.id, name: 'Smoke monitor', failureThreshold: 1, recoveryThreshold: 1 });
const failure = await post('/api/monitors/' + monitor.id + '/samples', { ok: false });
assert.ok(failure.monitor.activeIncidentId);
const issue = await get('/api/incidents/' + failure.monitor.activeIncidentId);
assert.equal(issue.status, 'open');
await post('/api/monitors/' + monitor.id + '/samples', { ok: true });
const recovered = await get('/api/incidents/' + issue.id);
assert.equal(recovered.status, 'resolved');
const review = await post('/api/incidents/' + issue.id + '/postmortem', { summary: 'Smoke outage', rootCause: 'Deliberate failing heartbeat', prevention: ['Keep smoke resources isolated'] });
assert.equal(review.incidentId, issue.id);

  console.log('Smoke workflow passed.');
} finally {
  if (child) {
    child.kill('SIGTERM');
    await exited;
  }
  if (temporary) rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
