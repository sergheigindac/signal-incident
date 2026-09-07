import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}
let failed = false;
for (const filename of ['src', 'scripts', 'test', 'public', 'client', 'examples'].flatMap(files).filter(name => name.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); failed = true; }
}
const document = JSON.parse(readFileSync('docs/openapi.json', 'utf8'));
const ids = Object.values(document.paths).flatMap(path => Object.values(path).map(operation => operation.operationId));
if (new Set(ids).size !== ids.length) { console.error('Duplicate OpenAPI operation identifiers'); failed = true; }
if (failed) process.exitCode = 1;
else console.log('JavaScript syntax and OpenAPI operation identifiers verified.');
