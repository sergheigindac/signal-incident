import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const source = resolve(process.env.DATABASE_PATH ?? 'data/application.sqlite');
const destination = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!destination) throw new Error('Usage: node scripts/backup.js <new-backup.sqlite>');
if (source === destination || existsSync(destination)) throw new Error('Backup destination must be a new file');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed');
  } finally { copy.close(); }
  console.log('Verified backup: ' + destination);
} finally { db.close(); }
