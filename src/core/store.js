import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, missing } from './errors.js';

/** Synchronous transactions must never cross an await boundary. */
export class Store {
  constructor(filename = ':memory:', clock = () => Date.now()) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.clock = clock;
    this.depth = 0;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  migrate() {
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM migrations WHERE version = 1').get()) return;
      this.db.exec(
        'CREATE TABLE records (' +
        'kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, ' +
        'created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), ' +
        'PRIMARY KEY(kind, id));' +
        'CREATE INDEX records_kind_created ON records(kind, created_at, id);' +
        'CREATE TABLE events (' +
        'sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, ' +
        'type TEXT NOT NULL, resource_id TEXT NOT NULL, occurred_at INTEGER NOT NULL, ' +
        'actor TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));' +
        'CREATE INDEX events_resource ON events(resource_id, sequence);' +
        'CREATE TABLE idempotency (' +
        'key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL, expires_at INTEGER NOT NULL);'
      );
      this.db.prepare('INSERT INTO migrations VALUES (1, ?)').run(this.clock());
    });
  }

  transaction(callback) {
    const nested = this.depth > 0;
    const savepoint = 'nested_' + this.depth;
    this.db.exec(nested ? 'SAVEPOINT ' + savepoint : 'BEGIN IMMEDIATE');
    this.depth++;
    try {
      const result = callback();
      if (result && typeof result.then === 'function') {
        throw new TypeError('Store transactions require synchronous callbacks');
      }
      this.db.exec(nested ? 'RELEASE ' + savepoint : 'COMMIT');
      return result;
    } catch (error) {
      this.db.exec(nested ? 'ROLLBACK TO ' + savepoint : 'ROLLBACK');
      if (nested) this.db.exec('RELEASE ' + savepoint);
      throw error;
    } finally {
      this.depth--;
    }
  }

  create(kind, data, id = randomUUID()) {
    const now = this.clock();
    const record = { ...data, id, revision: 1, createdAt: now, updatedAt: now };
    try {
      this.db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?)')
        .run(kind, id, 1, now, now, JSON.stringify(record));
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        throw new AppError(409, 'already_exists', kind + ' already exists');
      }
      throw error;
    }
    return record;
  }

  get(kind, id) {
    const row = this.db.prepare('SELECT body FROM records WHERE kind = ? AND id = ?').get(kind, id);
    if (!row) throw missing(kind);
    return JSON.parse(row.body);
  }

  find(kind, predicate) {
    return this.all(kind).find(predicate);
  }

  all(kind) {
    return this.db.prepare('SELECT body FROM records WHERE kind = ? ORDER BY created_at, id')
      .all(kind).map(row => JSON.parse(row.body));
  }

  update(kind, id, change, expectedRevision) {
    const current = this.get(kind, id);
    if (expectedRevision !== undefined && current.revision !== expectedRevision) {
      throw new AppError(409, 'revision_conflict', 'Record changed; reload before retrying');
    }
    const next = {
      ...current, ...change, id: current.id, createdAt: current.createdAt,
      updatedAt: this.clock(), revision: current.revision + 1,
    };
    const result = this.db.prepare(
      'UPDATE records SET body = ?, revision = ?, updated_at = ? WHERE kind = ? AND id = ? AND revision = ?'
    ).run(JSON.stringify(next), next.revision, next.updatedAt, kind, id, current.revision);
    if (result.changes !== 1) throw new AppError(409, 'revision_conflict', 'Concurrent update detected');
    return next;
  }

  event(type, resourceId, data = {}, actor = 'system') {
    const event = { id: randomUUID(), type, resourceId, occurredAt: this.clock(), actor, data };
    const result = this.db.prepare('INSERT INTO events (id, type, resource_id, occurred_at, actor, body) VALUES (?, ?, ?, ?, ?, ?)')
      .run(event.id, type, resourceId, event.occurredAt, actor, JSON.stringify(data));
    return { sequence: Number(result.lastInsertRowid), ...event };
  }

  events({ after = 0, limit = 100, resourceId } = {}) {
    const rows = resourceId
      ? this.db.prepare('SELECT * FROM events WHERE sequence > ? AND resource_id = ? ORDER BY sequence LIMIT ?').all(after, resourceId, limit)
      : this.db.prepare('SELECT * FROM events WHERE sequence > ? ORDER BY sequence LIMIT ?').all(after, limit);
    return rows.map(row => ({
      sequence: row.sequence, id: row.id, type: row.type, resourceId: row.resource_id,
      occurredAt: row.occurred_at, actor: row.actor, data: JSON.parse(row.body),
    }));
  }

  remembered(key, fingerprint) {
    const row = this.db.prepare('SELECT * FROM idempotency WHERE key = ? AND expires_at > ?').get(key, this.clock());
    if (!row) return undefined;
    if (row.fingerprint !== fingerprint) {
      throw new AppError(409, 'idempotency_conflict', 'Key was already used for a different request');
    }
    return JSON.parse(row.response);
  }

  remember(key, fingerprint, response, ttlMs = 86_400_000) {
    this.db.prepare('DELETE FROM idempotency WHERE expires_at <= ?').run(this.clock());
    this.db.prepare('INSERT INTO idempotency VALUES (?, ?, ?, ?)')
      .run(key, fingerprint, JSON.stringify(response), this.clock() + ttlMs);
  }

  integrity() {
    return this.db.prepare('PRAGMA quick_check').get().quick_check === 'ok';
  }

  async backup(destination) {
    return backup(this.db, destination);
  }

  close() {
    this.db.close();
  }
}
