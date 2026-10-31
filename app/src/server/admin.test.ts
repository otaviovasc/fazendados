import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createAdminRouter } from './admin.js';

const ADMIN_PASSWORD = 'admin-password-for-tests-123456789';
const jsonHeaders = { 'content-type': 'application/json', 'x-admin-request': '1' };

function appFor(password: string | undefined) {
  const app = new Hono();
  app.route('/api/admin', createAdminRouter({ password: () => password }));
  return app;
}

const disabled = await appFor(undefined).request('/api/admin/session');
assert.equal(disabled.status, 404);
assert.match(disabled.headers.get('cache-control') ?? '', /no-store/);

const csrfRejected = await appFor(ADMIN_PASSWORD).request('/api/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
});
assert.equal(csrfRejected.status, 403);

const unauthorized = await appFor(ADMIN_PASSWORD).request('/api/admin/users');
assert.equal(unauthorized.status, 401);

const unauthorizedReset = await appFor(ADMIN_PASSWORD).request('/api/admin/users/usr_test/password', {
  method: 'POST', headers: jsonHeaders, body: JSON.stringify({ password: 'a-long-new-user-password' }),
});
assert.equal(unauthorizedReset.status, 401);

const admin = appFor(ADMIN_PASSWORD);
const login = await admin.request('/api/admin/login', {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
assert.ok(cookie);
assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/i);
assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Strict/i);

const session = await admin.request('/api/admin/session', { headers: { cookie } });
assert.equal(session.status, 200);
assert.deepEqual(await session.json(), { authenticated: true });

const forged = await admin.request('/api/admin/session', {
  headers: { cookie: 'fazendados_admin=9999999999999.invalid-signature' },
});
assert.deepEqual(await forged.json(), { authenticated: false });

const resetWithoutCsrf = await admin.request('/api/admin/users/usr_test/password', {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'a-long-new-user-password' }),
});
assert.equal(resetWithoutCsrf.status, 403);

const rotatedSession = await appFor(`${ADMIN_PASSWORD}-rotated`).request('/api/admin/session', { headers: { cookie } });
assert.deepEqual(await rotatedSession.json(), { authenticated: false });

const invalidReset = await admin.request('/api/admin/users/usr_test/password', {
  method: 'POST',
  headers: { ...jsonHeaders, cookie },
  body: JSON.stringify({ password: 'curta' }),
});
assert.equal(invalidReset.status, 400);
assert.deepEqual(await invalidReset.json(), {
  ok: false,
  error: { code: 'VALIDATION_FAILED', message: 'A nova senha precisa ter entre 12 e 200 caracteres.' },
});

const logout = await admin.request('/api/admin/logout', {
  method: 'POST',
  headers: { ...jsonHeaders, cookie },
  body: '{}',
});
assert.equal(logout.status, 200);
assert.match(logout.headers.get('set-cookie') ?? '', /Max-Age=0/i);

const throttledPassword = 'another-admin-password-for-throttle';
const throttledAdmin = appFor(throttledPassword);
for (let attempt = 0; attempt < 8; attempt += 1) {
  const response = await throttledAdmin.request('/api/admin/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ password: 'definitely-wrong' }),
  });
  assert.equal(response.status, 401);
}
const throttled = await throttledAdmin.request('/api/admin/login', {
  method: 'POST',
  headers: { ...jsonHeaders, 'x-forwarded-for': 'forged-and-changing' },
  body: JSON.stringify({ password: throttledPassword }),
});
assert.equal(throttled.status, 429);
