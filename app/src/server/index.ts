import { serve } from '@hono/node-server';
import { closeDb } from '../db/client.js';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';

const config = env();
const server = serve({ fetch: createApp().fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info('server.started', { port: info.port });
});

async function shutdown(signal: string) {
  logger.info('server.shutdown_requested', { signal });
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
