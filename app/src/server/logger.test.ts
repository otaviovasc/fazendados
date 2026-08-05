import assert from 'node:assert/strict';
import { logger } from './logger.js';

const entries: string[] = [];
const original = console.log;
console.log = (entry: string) => entries.push(entry);
try {
  logger.info('test.event', { request_id: 'req_test', password: 'never-log-me', capture_text: 'nem este texto' });
} finally {
  console.log = original;
}

const entry = JSON.parse(entries[0]) as Record<string, unknown>;
assert.equal(entry.event, 'test.event');
assert.equal(entry.request_id, 'req_test');
assert.equal('password' in entry, false);
assert.equal('capture_text' in entry, false);
