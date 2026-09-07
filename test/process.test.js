import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { token } from './helpers.js';

async function command(args, env) {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr };
}

async function running(t) {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-process-'));
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const database = join(directory, 'application.sqlite');
  const env = {
    API_TOKEN: token,
    API_URL: 'http://127.0.0.1:' + port,
    PORT: String(port),
    HOST: '127.0.0.1',
    DATABASE_PATH: database,
  };
  const child = spawn(process.execPath, ['src/main.js'], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Server failed: ' + logs);
    try {
      const response = await fetch(env.API_URL + '/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) return { directory, database, env, logs: () => logs };
    } catch { /* Wait until the child binds its socket. */ }
    await setTimeout(50);
  }
  throw new Error('Server never became ready: ' + logs);
}

test('real entry point supports the full named-client example', { timeout: 20_000 }, async t => {
  const server = await running(t);
  const result = await command(['examples/workflow.js'], server.env);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.length > 0);
  assert.equal(existsSync(server.database), true);
  assert.ok(server.logs().includes('listening'));
  assert.ok(!server.logs().includes(token));
});

test('CLI uses PORT when API_URL is not supplied', { timeout: 20_000 }, async t => {
  const server = await running(t);
  const env = { ...server.env };
  delete env.API_URL;
  const inheritedUrl = process.env.API_URL;
  delete process.env.API_URL;
  try {
    const result = await command(['scripts/client.js', 'GET', '/ready'], env);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ready: true });
  } finally {
    if (inheritedUrl !== undefined) process.env.API_URL = inheritedUrl;
  }
});

test('backup command verifies a copy and refuses to overwrite it', { timeout: 20_000 }, async t => {
  const server = await running(t);
  const destination = join(server.directory, 'verified.sqlite');
  const first = await command(['scripts/backup.js', destination], server.env);
  assert.equal(first.code, 0, first.stderr);
  assert.ok(first.stdout.includes('Verified backup'));
  assert.equal(existsSync(destination), true);
  const second = await command(['scripts/backup.js', destination], server.env);
  assert.notEqual(second.code, 0);
  assert.ok(second.stderr.includes('must be a new file'));
});

test('invalid startup configuration fails without opening a database', { timeout: 10_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-invalid-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = join(directory, 'not-created.sqlite');
  const result = await command(['src/main.js'], {
    API_TOKEN: 'short',
    DATABASE_PATH: database,
  });
  assert.notEqual(result.code, 0);
  assert.ok(result.stderr.includes('API_TOKEN'));
  assert.equal(existsSync(database), false);
});
