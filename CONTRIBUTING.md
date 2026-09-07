# Development guide

## Setup

Use the Node version in .nvmrc. Export API_TOKEN and run node src/main.js. Set a dedicated DATABASE_PATH for experiments.

## Domain changes

1. State the invariant and the before/after behavior.
2. Update the request schema in src/domain/schemas.js.
3. Implement the command in the relevant domain module.
4. Keep state-dependent reads and related writes in a synchronous transaction.
5. Append an audit event for the business change.
6. Test a valid workflow and a failure requiring rollback.
7. Regenerate OpenAPI with node scripts/export-openapi.js.
8. Update named clients, declarations, reference docs, and examples.
9. Run syntax checks, tests, and the smoke workflow.

## Test conventions

Domain fixtures use controlled time. Advance the clock rather than sleeping. Persistence tests use temporary directories and HTTP tests use ephemeral ports. Assert observable invariants rather than internal helper-call order.

For multi-record mutations, test a failure after an earlier write would occur. Check both state and event rollback. For retries, check identical response replay and conflict on changed input.

## Extension exercise

Build an outbox worker against a local fake provider. Add lease-based notification ownership and test a provider timeout after acceptance, ensuring that a notification is not delivered twice.

## Review

- Preserve documented invariants.
- Handle missing references, stale revisions, and invalid transitions.
- Consider duplicate effects after a lost response.
- Keep transaction callbacks synchronous.
- Update API documentation alongside schemas.
- Exclude secrets, databases, and logs from commits.
- Keep README workflows reproducible.

Use small commits describing concrete changes and actual development dates. Include relevant validation and limitations when proposing a change.
