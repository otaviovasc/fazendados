import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { auditEvents, authSessions, farms, users } from '../db/schema.js';
import { uid } from '../lib/prng.js';
import { hashPassword } from './auth.js';
import { env } from './env.js';

const ADMIN_COOKIE = 'fazendados_admin';
const SESSION_SECONDS = 15 * 60;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;

type AdminVariables = { adminPassword: string };
type AdminEnv = { Variables: AdminVariables };
type LoginAttempt = { failures: number; resetAt: number };

const loginAttempts = new Map<string, LoginAttempt>();
const loginSchema = z.object({ password: z.string().min(1).max(200) }).strict();
const resetPasswordSchema = z.object({ password: z.string().min(12).max(200) }).strict();
const userIdSchema = z.string().min(1).max(200);

function passwordFingerprint(password: string) {
  return createHash('sha256').update(password).digest('base64url');
}

function constantTimePasswordMatches(candidate: string, expected: string) {
  const candidateDigest = createHash('sha256').update(candidate).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function sessionSignature(expiresAt: string, password: string) {
  const key = createHash('sha256').update(`fazendados-admin-session\0${password}`).digest();
  return createHmac('sha256', key).update(expiresAt).digest('base64url');
}

function createAdminSession(password: string, now = Date.now()) {
  const expiresAt = String(now + SESSION_SECONDS * 1000);
  return `${expiresAt}.${sessionSignature(expiresAt, password)}`;
}

function validAdminSession(token: string | undefined, password: string, now = Date.now()) {
  if (!token) return false;
  const [expiresAt, signature, extra] = token.split('.');
  if (!expiresAt || !signature || extra || !/^\d+$/.test(expiresAt) || Number(expiresAt) <= now) return false;
  const expected = Buffer.from(sessionSignature(expiresAt, password), 'base64url');
  const received = Buffer.from(signature, 'base64url');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function loginAllowed(password: string, now = Date.now()) {
  const key = passwordFingerprint(password);
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { failures: 0, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  return attempt.failures < MAX_LOGIN_FAILURES;
}

function recordLoginFailure(password: string, now = Date.now()) {
  const key = passwordFingerprint(password);
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) loginAttempts.set(key, { failures: 1, resetAt: now + LOGIN_WINDOW_MS });
  else attempt.failures += 1;
}

function clearLoginFailures(password: string) {
  loginAttempts.delete(passwordFingerprint(password));
}

function setAdminCookie(c: Context<AdminEnv>, token: string) {
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: env().NODE_ENV === 'production',
    maxAge: SESSION_SECONDS,
    path: '/api/admin',
  });
}

function clearAdminCookie(c: Context<AdminEnv>) {
  deleteCookie(c, ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: env().NODE_ENV === 'production',
    path: '/api/admin',
  });
}

const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  if (!validAdminSession(getCookie(c, ADMIN_COOKIE), c.get('adminPassword'))) {
    return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Entre como administrador para continuar.' } }, 401);
  }
  await next();
};

export type AdminRouterOptions = {
  /** Injeção restrita a testes; produção lê ADMIN_PASSWORD a cada request. */
  password?: () => string | undefined;
};

export function createAdminRouter(options: AdminRouterOptions = {}) {
  const admin = new Hono<AdminEnv>();

  admin.use('*', async (c, next) => {
    c.header('cache-control', 'no-store');
    c.header('pragma', 'no-cache');
    const password = options.password ? options.password() : env().ADMIN_PASSWORD;
    if (!password) return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }, 404);
    c.set('adminPassword', password);
    await next();
  });

  admin.use('*', async (c, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return next();
    const isJson = c.req.header('content-type')?.toLowerCase().split(';', 1)[0].trim() === 'application/json';
    if (!isJson || c.req.header('x-admin-request') !== '1') {
      return c.json({ ok: false, error: { code: 'FORBIDDEN', message: 'Requisição administrativa inválida.' } }, 403);
    }
    await next();
  });

  admin.get('/session', (c) => c.json({ authenticated: validAdminSession(getCookie(c, ADMIN_COOKIE), c.get('adminPassword')) }));

  admin.post('/login', async (c) => {
    const password = c.get('adminPassword');
    if (!loginAllowed(password)) {
      return c.json({ ok: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos.' } }, 429);
    }
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !constantTimePasswordMatches(parsed.data.password, password)) {
      recordLoginFailure(password);
      return c.json({ ok: false, error: { code: 'INVALID_PASSWORD', message: 'Senha incorreta.' } }, 401);
    }
    clearLoginFailures(password);
    setAdminCookie(c, createAdminSession(password));
    return c.json({ ok: true });
  });

  admin.post('/logout', requireAdmin, (c) => {
    clearAdminCookie(c);
    return c.json({ ok: true });
  });

  admin.use('/users', requireAdmin);
  admin.use('/users/*', requireAdmin);

  admin.get('/users', async (c) => {
    const rows = await getDb()
      .select({ id: users.id, name: users.name, username: users.username, farmName: farms.name })
      .from(users)
      .innerJoin(farms, eq(users.farmId, farms.id))
      .orderBy(asc(users.username));
    return c.json({ users: rows });
  });

  admin.post('/users/:userId/password', async (c) => {
    const userId = userIdSchema.safeParse(c.req.param('userId'));
    const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => null));
    if (!userId.success || !parsed.success) {
      return c.json({ ok: false, error: { code: 'VALIDATION_FAILED', message: 'A nova senha precisa ter entre 12 e 200 caracteres.' } }, 400);
    }

    // Scrypt é deliberadamente executado fora da transação para mantê-la curta.
    const passwordHash = await hashPassword(parsed.data.password);
    const changed = await getDb().transaction(async (tx) => {
      const user = (await tx
        .select({ id: users.id, farmId: users.farmId })
        .from(users)
        .where(eq(users.id, userId.data))
        .limit(1)
        .for('update'))[0];
      if (!user) return false;

      const now = new Date();
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
      await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
      await tx.insert(auditEvents).values({
        id: uid('au'),
        farmId: user.farmId,
        at: now,
        actor: 'admin',
        action: 'redefinicao_senha',
        entityType: 'usuario',
        entityId: user.id,
        description: 'Senha redefinida pelo administrador; sessões anteriores encerradas.',
        origin: 'manual',
      });
      return true;
    });

    if (!changed) return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Usuário não encontrado.' } }, 404);
    return c.json({ ok: true });
  });

  return admin;
}
