import { randomUUID } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { idempotencyKeys } from '../db/schema.js';
import {
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  destroySession,
  loginAllowed,
  passwordMatches,
  recordLoginFailure,
  requireAuth,
  sessionToken,
  setSessionCookie,
  type AppEnv,
} from './auth.js';
import { loadFarmState } from './bootstrap.js';
import { actionSchema, executeCommand } from './commands.js';
import { ApiError } from './http.js';

/** String JSON canônica (chaves ordenadas) — base da comparação de idempotência. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([k1], [k2]) => (k1 < k2 ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

const loginSchema = z.object({ password: z.string() });
const commandRequestSchema = z.object({ idempotencyKey: z.string().min(1).max(200), action: actionSchema });

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.header('x-request-id', c.req.header('x-request-id') ?? randomUUID());
    await next();
  });

  // ---------- público ----------

  app.get('/api/ready', async (c) => {
    try {
      await getDb().execute(sql`select 1`);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false, error: { code: 'NOT_READY', message: 'Banco indisponível.' } }, 503);
    }
  });

  app.post('/api/login', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? 'local';
    if (!loginAllowed(ip)) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.');
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success || !passwordMatches(parsed.data.password)) {
      recordLoginFailure(ip);
      throw new ApiError(401, 'INVALID_PASSWORD', 'Senha incorreta.');
    }
    clearLoginFailures(ip);
    const user = await getDb().query.users.findFirst();
    if (!user) throw new ApiError(503, 'NOT_SEEDED', 'Banco sem dados. Rode pnpm db:seed.');
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ ok: true });
  });

  app.post('/api/logout', async (c) => {
    const token = sessionToken(c);
    if (token) await destroySession(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  // ---------- autenticado ----------

  app.use('/api/*', requireAuth);

  app.get('/api/me', (c) => {
    const { user, farm } = c.get('auth');
    return c.json({ user, farm });
  });

  app.get('/api/bootstrap', async (c) => {
    const { farm } = c.get('auth');
    const state = await loadFarmState(getDb(), farm.id);
    return c.json({ state });
  });

  /**
   * Endpoint único de comandos. Idempotente por idempotencyKey:
   * mesma key + mesmo payload → mesmo resultado; mesma key + payload
   * diferente → 409 IDEMPOTENCY_CONFLICT. Cada comando é 1 transação,
   * com o audit_events gravado na mesma transação.
   */
  app.post('/api/commands', async (c) => {
    const auth = c.get('auth');
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = commandRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(400, 'INVALID_COMMAND', `Comando inválido: ${issue.path.join('.')} ${issue.message}`);
    }
    const { idempotencyKey, action } = parsed.data;
    const canonical = canonicalize(action);
    const db = getDb();

    const lookup = () =>
      db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.farmId, auth.farm.id), eq(idempotencyKeys.key, idempotencyKey)))
        .limit(1);

    const existing = (await lookup())[0];
    if (existing) {
      // jsonb não preserva ordem de chaves — comparar a forma canônica.
      if (canonicalize(existing.payload) === canonical) return c.json({ ok: true, result: existing.response, replayed: true });
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Esta idempotencyKey já foi usada com um payload diferente.');
    }

    try {
      const result = await db.transaction(async (tx) => {
        const r = await executeCommand(tx, auth, action);
        await tx.insert(idempotencyKeys).values({
          farmId: auth.farm.id,
          key: idempotencyKey,
          payload: action,
          response: r ?? null,
          createdAt: new Date(),
        });
        return r;
      });
      return c.json({ ok: true, result });
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Corrida: outra requisição gravou a key primeiro — reler e decidir.
        const winner = (await lookup())[0];
        if (winner && canonicalize(winner.payload) === canonical) return c.json({ ok: true, result: winner.response, replayed: true });
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Esta idempotencyKey já foi usada com um payload diferente.');
      }
      throw e;
    }
  });

  app.onError((error, c) => {
    const known = error instanceof ApiError;
    const status = known ? error.status : 500;
    if (!known) {
      console.error(
        JSON.stringify({
          level: 'error',
          requestId: c.res.headers.get('x-request-id'),
          method: c.req.method,
          path: c.req.path,
          message: error.message,
        }),
      );
    }
    return c.json(
      { ok: false, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Ocorreu um erro interno.' } },
      status as 400,
    );
  });

  // ---------- frontend estático (produção; em dev o Vite serve e faz proxy) ----------
  app.use('/assets/*', serveStatic({ root: './dist/client' }));
  app.get('*', serveStatic({ path: './dist/client/index.html' }));

  return app;
}
