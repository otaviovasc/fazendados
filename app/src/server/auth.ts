import { randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDb } from '../db/client.js';
import { authSessions, farms, users } from '../db/schema.js';
import type { Farm, User } from '../domain/types.js';
import { env } from './env.js';
import { toFarm, toUser } from './mappers.js';

const COOKIE_NAME = 'fazendados_session';
const THIRTY_DAYS_MS = 60 * 60 * 24 * 30 * 1000;

export type AuthContext = { user: User; farm: Farm };
export type AppEnv = { Variables: { auth: AuthContext } };

export function passwordMatches(candidate: string) {
  const expected = Buffer.from(env().APP_PASSWORD);
  const received = Buffer.from(candidate);
  if (expected.length !== received.length) {
    timingSafeEqual(expected, Buffer.alloc(expected.length));
    return false;
  }
  return timingSafeEqual(expected, received);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await getDb()
    .insert(authSessions)
    .values({ id: token, userId, createdAt: now, expiresAt: new Date(now.getTime() + THIRTY_DAYS_MS) });
  return token;
}

export async function destroySession(token: string) {
  await getDb().delete(authSessions).where(eq(authSessions.id, token));
}

/** Sessão válida → usuário + fazenda (V1: 1 usuário por fazenda). */
export async function resolveAuth(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const rows = await getDb()
    .select({ session: authSessions, user: users, farm: farms })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .innerJoin(farms, eq(users.farmId, farms.id))
    .where(and(eq(authSessions.id, token), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { user: toUser(row.user), farm: toFarm(row.farm) };
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env().NODE_ENV === 'production',
    maxAge: THIRTY_DAYS_MS / 1000,
    path: '/',
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function sessionToken(c: Context) {
  return getCookie(c, COOKIE_NAME);
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = await resolveAuth(sessionToken(c));
  if (!auth) {
    return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Entre novamente para continuar.' } }, 401);
  }
  c.set('auth', auth);
  await next();
};

// Rate limit simples de login (em memória, como no protótipo de referência).
type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginAllowed(ip: string, now = Date.now()) {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });
    return true;
  }
  return current.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(ip: string, now = Date.now()) {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else current.count += 1;
}

export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}
