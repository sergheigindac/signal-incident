import { Store } from './core/store.js';
import { configuration } from './core/config.js';
import { createHttp } from './core/http.js';
import { createDomain } from './domain/service.js';

const config = configuration(process.env, 4330);
const store = new Store(config.filename);
const domain = createDomain(store);
const server = createHttp({ store, domain, token: config.token, title: 'Signal Incident' });
const timer = setInterval(() => {
  try { domain.tick(); }
  catch (error) { console.error(JSON.stringify({ level: 'error', component: 'scheduler', message: error.message })); }
}, config.tickMs);
timer.unref();
server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ level: 'info', event: 'listening', host: config.host, port: config.port }));
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server.close(() => { store.close(); process.exitCode = 0; });
  setTimeout(() => { server.closeAllConnections(); }, 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('error', error => {
  clearInterval(timer);
  console.error(JSON.stringify({ level: 'error', message: error.message }));
  store.close();
  process.exitCode = 1;
});
