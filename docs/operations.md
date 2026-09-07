# Operational runbook

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| API_TOKEN | Required | At least 24 characters; generate a random secret |
| HOST | 127.0.0.1 | HTTP bind; Compose uses 0.0.0.0 inside the container |
| PORT | 4330 | HTTP port, 1 to 65535 |
| DATABASE_PATH | data/application.sqlite | SQLite file |
| TICK_MS | 1000 | Maintenance interval, 100 to 60000 ms |
| API_URL | Client-specific | Target for CLI and smoke checks |
| IDEMPOTENCY_KEY | Unset | CLI mutation replay key |

Startup rejects invalid tokens and numeric settings. Environment files are untracked. Compose reads .env for interpolation; plain node src/main.js reads only process environment.

## Startup

1. Generate a token with node scripts/token.js and export API_TOKEN.
2. Start the server or run docker compose up --build --wait.
3. GET /health should return status: ok.
4. Authenticated GET /ready should return ready: true.
5. Connect the console and perform the README workflow.
6. Check that /api/events records successful mutations.

## Health and logs

/health is public liveness. It only proves that the process can respond. /ready requires authentication and runs SQLite quick_check. Investigate disk access and integrity before accepting writes if readiness fails.

Logs are JSON lines containing requestId, method, path, status, and durationMs. Unexpected errors produce an error record with the same requestId. Tokens and request bodies are not intentionally logged. Path identifiers are operational data and need appropriate log access controls.

## Metrics

The authenticated /metrics endpoint exposes Prometheus text:

- app_requests_total: received requests since startup.
- app_errors_total: requests raising application or unexpected errors.
- app_request_duration_ms_total: cumulative completed request time.

Counters reset after restart. A metrics request increments the request count. These are simple counters, not latency histograms. Domain reports describe business state. Use an external collector for durable time-series history.

## Online backup

~~~sh
node scripts/backup.js backups/snapshot.sqlite
~~~

The destination must not exist. The command opens the source read-only, uses SQLite online backup, and checks copy integrity. It can run while the service is writing. Do not copy only the live main file in WAL mode: committed changes may still reside in its WAL.

In a container, write the backup under the mounted data volume and copy the completed file to independent storage. A same-volume backup does not protect against losing that volume.

## Restore rehearsal

1. Stop writes and retain the current database and related WAL files for rollback.
2. Start a separate instance with DATABASE_PATH pointing to the backup and a different PORT.
3. Confirm /ready and inspect key records and read-only reports.
4. Stop the rehearsal instance before switching the intended deployment.
5. Keep only one active deployment and reconcile downstream consumers before resuming.

Restoration also restores older response caches and audit cursors. External effects after the backup are not reversed. Reconcile those effects before replaying work or notifications.

## Shutdown and rotation

SIGINT and SIGTERM stop maintenance and close the listener. Connections have up to five seconds before forced closure. Compose grants ten seconds. SQLite closes after HTTP closes. A hard termination relies on SQLite recovery on reopen.

To rotate credentials, change API_TOKEN and restart. Update workers and clients before resuming traffic. There is one active token, with no overlap window. Browser sessions must reconnect.

## Troubleshooting

| Symptom | Investigation |
| --- | --- |
| Missing API_TOKEN | Export a token; confirm the shell launching Node |
| Port in use | Set another PORT or stop the specific conflicting process |
| 401 | Confirm Bearer prefix and the running process token |
| 409 revision_conflict | Reload and reconcile before editing |
| 409 idempotency_conflict | A key was reused with different normalized input |
| 413 | Keep JSON below 64 KiB |
| 415 | Send application/json |
| 422 | Read error.details.path and field constraints |
| 429 | Reduce rate and respect Retry-After |
| SQLite busy | Check extra writers, disk latency, and record count |
| Container write failure | Check volume ownership and DATABASE_PATH |
| Missing events | Confirm mutation success and event cursor |

## Retention and capacity

There is no automatic archival or deletion. Domain and audit tables grow indefinitely. Monitor database size and latency. Use a new database path for disposable demonstrations. Design an explicit export and retention policy before deleting retained records.

Tests are not a production load benchmark. Synchronous SQLite and in-memory collection scans favor modest local datasets. Benchmark the intended workload before setting service-level objectives.

## Deployment validation

Run syntax checks, node --test, and node scripts/smoke.js. On a Docker host, run docker compose config --quiet and docker compose up --build --wait. Set API_URL and run the smoke test against the container. It writes uniquely named demonstration records to that server.

CI runs container checks using a disposable volume. Passing local Node tests alone does not verify Docker configuration.
