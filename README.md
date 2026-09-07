# Signal Incident

[![CI](https://github.com/sergheigindac/signal-incident/actions/workflows/ci.yml/badge.svg)](https://github.com/sergheigindac/signal-incident/actions/workflows/ci.yml)

Operational teams need to turn heartbeat observations into a coherent incident history. Signal Incident evaluates consecutive failures and recoveries, records state transitions, and calculates incident-based service availability.

This is a runnable, AI-assisted portfolio project using JavaScript, Node.js 24, SQLite, and Docker. It demonstrates multi-file service architecture and operational workflows for a single trusted tenant.

## Features

- Service catalog with availability targets and heartbeat monitor configuration.
- Failure and recovery thresholds, missing-heartbeat evaluation, and monitor pause controls.
- Manual and automatic incidents with ownership, notes, and revision-checked transitions.
- Maintenance windows that suppress automatic incident changes.
- Transactional notification outbox with delivery outcome tracking.
- Postmortems, service status, merged downtime intervals, and error budgets.

The project includes an authenticated HTTP API, browser operations console, typed JavaScript client, audit log, online backup command, and automated tests. There are no third-party runtime packages.

## Run locally

Install Node.js 24.14.0 or a compatible Node 24 release. No npm install is needed.

POSIX shell:

~~~sh
export API_TOKEN=$(node scripts/token.js)
node src/main.js
~~~

PowerShell:

~~~powershell
$env:API_TOKEN = node scripts/token.js
node src/main.js
~~~

Open http://127.0.0.1:4330 and enter the token in the console. The database is stored at data/application.sqlite. The page keeps the token in memory and clears it on reload. Plain Node does not load .env automatically; export variables or run node --env-file=.env src/main.js.

## Run with Docker

~~~sh
cp .env.example .env
# Replace API_TOKEN in .env with a freshly generated random token.
docker compose up --build --wait
docker compose logs -f app
~~~

The image runs as a non-root user. Compose binds to localhost, mounts a persistent SQLite volume, and makes the root filesystem read-only. Image builds run the test suite before assembling the runtime stage.

Stop with docker compose down. Keep the volume to preserve records. Removing it permanently removes its database, so only do that for disposable demo data.

## Complete workflow

1. Create a Checkout service.
2. Create a heartbeat monitor with failureThreshold 2 and recoveryThreshold 2.
3. Submit two failing observations. One incident opens.
4. Assign an owner and add a timeline note.
5. Submit two successful observations. The incident resolves.
6. Publish a postmortem with impact, root cause, and prevention actions.
7. Inspect the reliability report over a nonzero observation window.

Automated demonstration:

~~~sh
node scripts/smoke.js
~~~

This starts an isolated server on a temporary port, exercises the workflow, and removes its temporary database. If API_URL is set, it uses that server and creates uniquely named demo records there instead.

## Validation

~~~sh
node scripts/check.js
node --test
node --test --experimental-test-coverage
node scripts/smoke.js
~~~

Tests cover transaction rollback, persistence, online backups, schema boundaries, authentication, idempotent retries, domain failure paths, and competing HTTP requests. CI runs on Windows and Linux and separately builds and exercises the Docker image.

## Repository guide

| Directory | Responsibility |
| --- | --- |
| src/core | SQLite, HTTP, validation, configuration, idempotency |
| src/domain | Business state machines, commands, queries, route definitions |
| public | Browser operations console with no frontend build step |
| client | Native fetch client and TypeScript request declarations |
| scripts | Smoke check, API client, backup, syntax checks, contract export |
| test | Unit, integration, concurrency, persistence, and transport tests |
| docs | Architecture, API reference, runbooks, decisions, and OpenAPI |

## Documentation

- [Architecture and invariants](docs/architecture.md)
- [API reference](docs/api.md)
- [Operational runbook](docs/operations.md)
- [Design decisions](docs/decisions.md)
- [Development guide](CONTRIBUTING.md)
- [Client usage](client/README.md)
- [OpenAPI contract](docs/openapi.json)

## Scope

- The application ingests heartbeats; it does not probe arbitrary URLs or execute checks.
- Notification records form an outbox. An external adapter must deliver messages and record results. This repository sends no email or chat messages.
- There is no escalation rota, paging provider, multi-region quorum, or cross-monitor alert grouping.
- Samples and incidents are retained indefinitely until a retention mechanism is added.
- Manually resolving a still-failing automatic incident allows the next failure to open another incident.
- SQLite work is synchronous and collection queries scan records in memory. This favors readable local deployment over large-scale throughput.
- One bearer token has administrative access. There is no user directory, tenant isolation, role-based authorization, or built-in TLS.
- The portfolio projects share a small core implementation but have separate domain models and independent databases.
- Node 24 built-in SQLite is experimental. Keep the tested runtime pinned and validate upgrades.

Generated OpenAPI and client files are checked in for review and editor support. They count toward repository totals but are distinct from handwritten application code. Commit timestamps reflect actual development.

MIT licensed. See [LICENSE](LICENSE).
