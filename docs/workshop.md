# Guided review workshop

This workshop is a way to understand and explain the implementation. It is not a claim of employment experience or production deployment.

## Preparation

Use a disposable database and start the server with a random token. Open the console and the source side by side. Keep a terminal available for the client example and tests.

Record the exact commit under review with git rev-parse HEAD. That makes notes and reproduction steps useful after later changes.

## Trace one successful operation

1. Select a creation operation in the console.
2. Find its operation identifier in src/domain/service.js.
3. Follow the request schema into src/domain/schemas.js.
4. Read the corresponding domain method.
5. Identify which resource references are checked.
6. Locate the transaction boundary and audit event.
7. Submit the request and compare the response with the stored fields.
8. Fetch /api/events and locate the committed event.

Explain why validation alone is insufficient: a request can have the right shape while referring to a missing resource or asking for an invalid state transition.

## Explore a conflict

Choose a revision-checked operation. Read a record and save its revision. Submit a valid edit, then submit another edit using the old revision.

Observe the 409 response and read the latest record. Explain how this prevents a stale client from silently overwriting newer changes. The client must reload and reconcile; automatically replacing the revision would hide a conflict.

## Reproduce a lost-response retry

Choose a creation request and set a unique Idempotency-Key. Send it twice with identical content. Compare identifiers, timestamps, and the number of audit events.

Now change one field while keeping the same key. The server rejects that request because the key identifies the earlier logical operation. A genuinely new operation needs a new key.

Read src/core/idempotency.js and explain why canonical object-key order is useful while array order must remain meaningful.

## Inspect rollback

Find the domain test that attempts a multi-record change and fails after an earlier write would have happened. Run that test by name with Node's test-name-pattern option.

Identify the assertions covering both domain records and audit events. Explain why an event for a rolled-back change would be misleading to an external consumer.

Read Store.transaction and follow the difference between an outer transaction and a nested savepoint. Explain why the implementation rejects asynchronous callbacks.

## Explain time and recovery

Find a deadline-based test in test/domain.test.js. Identify the exact instant at which the action becomes invalid. Advance the fixture clock to that instant and inspect the expected error.

Read the periodic tick method. Explain what happens after the service is stopped beyond a deadline and then restarted. Distinguish persisted deadline state from the in-memory timer that triggers evaluation.

Consider a process crash after a database commit but before its HTTP response. Explain which retry path is safe and which external effects still need their own deduplication.

## Follow the client

Run examples/workflow.js against your disposable service. Read each named method in client/index.js and follow it into Transport.request.

Identify which errors are retried. Explain why an unkeyed mutation is not automatically retried after a network error: the caller cannot tell whether the server committed before the connection failed.

Use an AbortController in a small local script to cancel a request. Read the transport test that cancels retry backoff. Cancellation must stop waiting as well as active network work.

## Inspect persistence

Create a record, stop the service, and restart it with the same DATABASE_PATH. Verify that the record and audit event still exist.

Run the online backup command to a new destination. Start a separate instance on another port using that backup. Verify readiness and read the expected record.

Explain why copying only the main live SQLite file may miss WAL changes. Explain why a backup on the same volume does not protect against losing that volume.

## Review the container

Read each Dockerfile stage. The test stage runs validation; the runtime stage copies only the application material it needs. Identify the non-root user and the writable data directory.

Read compose.yaml and identify the localhost port binding, data volume, read-only root filesystem, dropped capabilities, and shutdown grace period.

On a Docker-capable host, build and run the container. Inspect health and run the external-server smoke workflow. Local Node tests and a successful container build establish different things.

## Discuss scale honestly

Locate Store.all and a domain report that filters its result. Explain the memory and latency consequences as record count grows.

Propose one indexed SQL query that would improve a hot path. Describe the migration and test strategy without changing the domain invariant.

Explain why sharing a SQLite volume across machines is not a horizontal scaling strategy. Separate the problem of more concurrent readers from the problem of coordinating writers.

## Make one real improvement

Choose the extension exercise in CONTRIBUTING.md or a small issue you observed. Write a before/after example and implement the change with a focused test.

Update the API contract and documentation when behavior changes. Run the required checks. Commit the actual change with its actual date and a message describing the resulting behavior.

The useful outcome is being able to explain and extend the project, including its limitations, from evidence in the code and tests.
