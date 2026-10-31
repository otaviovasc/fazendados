import assert from 'node:assert/strict';

// Reproduz a configuração de produção, sem carregar o .env local ou acessar o banco.
process.env.NODE_ENV = 'production';
process.env.DATABASE_URL = 'postgresql://unused:unused@localhost:5432/unused';
process.env.ADMIN_PASSWORD = '12345678901234';

const { env } = await import('./env.js');
const { createApp } = await import('./app.js');

assert.equal(env().ADMIN_PASSWORD, process.env.ADMIN_PASSWORD);
const app = createApp();
const login = await app.request('/api/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-request': '1' },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie');
assert.ok(cookie);
assert.match(cookie, /Secure/i);
assert.match(cookie, /HttpOnly/i);
const session = await app.request('/api/admin/session', { headers: { cookie: cookie.split(';', 1)[0] } });
assert.deepEqual(await session.json(), { authenticated: true });
