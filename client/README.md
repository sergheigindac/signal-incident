# Signal Incident client

The client uses native fetch and has no runtime dependencies. Copy the client directory into a Node 24 application or import it with a relative path. TypeScript editors use index.d.ts for request completion. Response values beyond collection metadata deliberately use unknown until narrowed by the caller.

```js
import { Client } from './client/index.js';
const client = new Client({
  baseUrl: 'http://127.0.0.1:4330',
  token: process.env.API_TOKEN,
});
for await (const event of client.events()) console.log(event.type);
```

GET requests retry transient network failures, 429, 502, 503, and 504. Mutations only retry when the caller supplies an idempotencyKey. Reuse the same key for retries of the same logical operation. A changed payload requires a new key. Cancellation stops requests and retry backoff. Redirects are rejected so authorization is never forwarded to another host.

Pagination uses offset and therefore is not a snapshot under concurrent writes. Use the event cursor for append-only incremental consumption. Client timeouts are per attempt. Server Retry-After delays are capped at sixty seconds.
