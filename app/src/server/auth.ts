import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
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

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function scryptKey(password: string, salt: Buffer, length: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { N, r, p, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const digest = await scryptKey(password, salt, 32, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export async function passwordMatches(candidate: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  const [algorithm, rawN, rawR, rawP, rawSalt, rawDigest] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !rawN || !rawR || !rawP || !rawSalt || !rawDigest) return false;
  if (Number(rawN) !== SCRYPT_N || Number(rawR) !== SCRYPT_R || Number(rawP) !== SCRYPT_P) return false;
  const expected = Buffer.from(rawDigest, 'base64url');
  if (!expected.length) return false;
  try {
    const received = await scryptKey(candidate, Buffer.from(rawSalt, 'base64url'), expected.length, SCRYPT_N, SCRYPT_R, SCRYPT_P);
    return received.length === expected.length && timingSafeEqual(expected, received);
  } catch { return false; }
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

const attemptKey = (username: string, ip: string) => createHash('sha256').update(`${username}\0${ip}`).digest('hex');

export function loginAllowed(username: string, ip: string, now = Date.now()) {
  const key = attemptKey(username, ip);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return true;
  }
  return current.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(username: string, ip: string, now = Date.now()) {
  const key = attemptKey(username, ip);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else current.count += 1;
}

export function clearLoginFailures(username: string, ip: string) {
  attempts.delete(attemptKey(username, ip));
}
