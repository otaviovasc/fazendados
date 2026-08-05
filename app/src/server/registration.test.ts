import assert from 'node:assert/strict';
import { createApp } from './app.js';

const response = await createApp().request('/api/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    farmName: 'Fazenda Exemplo',
    displayName: 'Ana Silva',
    username: 'ana.silva',
    password: 'curta123',
  }),
});

assert.equal(response.status, 400);
assert.deepEqual(await response.json(), {
  ok: false,
  error: {
    code: 'INVALID_REGISTRATION',
    message: 'A senha precisa ter entre 12 e 200 caracteres.',
  },
});

const bootstrap = await createApp().request('/api/bootstrap');
assert.equal(bootstrap.status, 200);
assert.deepEqual(await bootstrap.json(), { authenticated: false });
