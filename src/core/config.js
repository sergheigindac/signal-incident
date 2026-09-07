import { resolve } from 'node:path';

export function configuration(env = process.env, defaultPort = 4300) {
  const port = Number(env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const token = env.API_TOKEN;
  if (typeof token !== 'string' || token.length < 24) throw new Error('API_TOKEN must contain at least 24 characters');
  const tickMs = Number(env.TICK_MS ?? 1000);
  if (!Number.isInteger(tickMs) || tickMs < 100 || tickMs > 60_000) throw new Error('TICK_MS must be 100–60000');
  return {
    port, host: env.HOST ?? '127.0.0.1', token, tickMs,
    filename: resolve(env.DATABASE_PATH ?? 'data/application.sqlite'),
  };
}
