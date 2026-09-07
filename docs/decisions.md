# Design decisions

## ADR 001: Native Node modules

Accepted for this portfolio implementation.

The service uses node:http, node:sqlite, node:crypto, and node:test. Startup has no package installation or frontend build step. Dependency boundaries stay visible during review.

The cost is implementing bounded routing, validation, and transport modules directly. The pinned SQLite API is experimental, so runtime upgrades require the full suite and smoke workflows.

## ADR 002: SQLite transactions

Accepted for single-instance deployment.

Commands need atomic changes across record types and audit history. SQLite provides transactions without a separate database service. BEGIN IMMEDIATE establishes writer ownership before evaluating state-dependent rules.

The cost is serialized writes and synchronous event-loop work. A future server database must keep idempotency, events, and domain state in the same transaction.

## ADR 003: Versioned JSON records

Accepted with explicit query limitations.

The store owns identity, revision, timestamps, transactions, and events. Domain modules own relationships and invariants. JSON records reduce schema boilerplate but do not provide foreign keys between their fields.

Commands validate referenced resources. Tests cover missing references and rollback after partial work. A high-volume deployment should move hot fields into typed columns and indexed queries.

## ADR 004: Administrative bearer token

Accepted for local evaluation.

One token enables a complete demo without an identity provider. Every authenticated caller has administrative access. The browser keeps its token in memory, and the server does not accept URL tokens.

Adding users requires authorization rules, credential lifecycle, actor identity, and tenant filtering at persistence boundaries. A userId field alone would not establish isolation.

## ADR 005: Command idempotency

Accepted.

A retry can arrive after commit but before the caller receives a response. Keys cache successful responses atomically with command writes. Fingerprints use validated input for consistent defaults and object-key order.

Keys expire after 24 hours and are global within one database. Namespace them by workflow and retain them across transport retries. Failed commands do not consume a key. External side effects still require their own idempotency.

## ADR 006: Transactional audit events

Accepted.

Events are appended in the same transaction as state. Consumers advance their sequence cursor only after successful processing.

This is not full event sourcing. Snapshots are authoritative, and event payloads may omit fields needed to reconstruct a record. Events provide operational history and integration signals.

## ADR 007: Checked-in API artifacts

Accepted.

OpenAPI, named clients, and request declarations make interfaces reviewable without running the application. A drift test compares stored OpenAPI against runtime routes.

Generated lines are distinct from application source. Request types are precise; domain-specific response fields currently require caller narrowing.

## ADR 008: Controllable domain clock

Accepted.

The Store supplies domain time for deadlines, timestamps, and reports. Tests cross exact boundaries without sleeping. HTTP timing and rate limiting use wall time.

This enables deterministic lifecycle tests without claiming to solve distributed clock skew. The supported deployment has one service clock.
