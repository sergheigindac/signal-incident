import { writeFileSync } from 'node:fs';
import { Store } from '../src/core/store.js';
import { createDomain } from '../src/domain/service.js';
import { openapi } from '../src/core/openapi.js';

const store = new Store();
try {
  const document = openapi('Signal Incident', createDomain(store).routes);
  writeFileSync(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(document, null, 2) + '\n');
  console.log('Exported docs/openapi.json');
} finally { store.close(); }
