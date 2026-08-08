import { randomUUID } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb, type Tx } from '../db/client.js';
import { animals, assistantCaptureAttachments, assistantCaptures, assistantProposals, auditEvents, farms, feedItems, herdGroups, idempotencyKeys, users } from '../db/schema.js';
import {
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  loginAllowed,
  passwordMatches,
  recordLoginFailure,
  resolveAuth,
  requireAuth,
  sessionToken,
  setSessionCookie,
  type AppEnv,
} from './auth.js';
import { loadFarmState } from './bootstrap.js';
import { actionSchema, executeCommand } from './commands.js';
import { ApiError } from './http.js';
import { interpretAssistantCapture, readImageCapture } from './assistant.js';
import { getPrivateImage, getPrivateObject, MAX_ATTACHMENT_BYTES, MAX_IMAGE_BYTES, privateAttachmentKey, privateImageKey, putPrivateImage, putPrivateObject, validateAttachmentUpload, validateImageUpload } from './media.js';
import { uid } from '../lib/prng.js';
import { errorType, logger } from './logger.js';
import { toCapture, toProposal } from './mappers.js';

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

const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,31}$/);
const passwordSchema = z.string().min(12).max(200);
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(200) });
const registerSchema = z.object({ farmName: z.string().trim().min(2).max(100), displayName: z.string().trim().min(2).max(100), username: usernameSchema, password: passwordSchema });
const commandRequestSchema = z.object({ idempotencyKey: z.string().min(1).max(200), action: actionSchema });

function registrationValidationMessage(error: z.ZodError) {
  const invalidFields = new Set(error.issues.map((issue) => issue.path[0]));
  if (invalidFields.has('password')) return 'A senha precisa ter entre 12 e 200 caracteres.';
  if (invalidFields.has('username')) return 'O usuário deve ter de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.';
  if (invalidFields.has('farmName')) return 'Informe o nome da Fazenda (entre 2 e 100 caracteres).';
  return 'Informe seu nome (entre 2 e 100 caracteres).';
}

async function assistantContext(farmId: string) {
  const db = getDb();
  const [groups, animalRows, feedItemRows] = await Promise.all([
    db.select().from(herdGroups).where(eq(herdGroups.farmId, farmId)),
    db.select().from(animals).where(eq(animals.farmId, farmId)),
    db.select().from(feedItems).where(eq(feedItems.farmId, farmId)),
  ]);
  return {
    groups: groups.map((group) => ({ name: group.name, milkingsPerDay: group.milkingsPerDay as 1 | 2 })),
    animals: animalRows.map((animal) => ({ name: animal.name, tag: animal.tag ?? undefined })),
    feedItems: feedItemRows.map((item) => ({ name: item.name, unit: item.unit })),
  };
}

async function auditAssistantMutation(tx: Tx, farmId: string, actor: string, action: string, entityType: string, entityId: string, description: string) {
  await tx.insert(auditEvents).values({ id: uid('au'), farmId, at: new Date(), actor, action, entityType, entityId, description, origin: 'assistente' });
}

async function captureWithAttachments(farmId: string, captureId: string) {
  const db = getDb();
  const capture = (await db.select().from(assistantCaptures).where(and(eq(assistantCaptures.id, captureId), eq(assistantCaptures.farmId, farmId))).limit(1))[0];
  if (!capture) return null;
  const attachments = await db.select().from(assistantCaptureAttachments).where(and(eq(assistantCaptureAttachments.captureId, capture.id), eq(assistantCaptureAttachments.farmId, farmId), isNull(assistantCaptureAttachments.deletedAt)));
  return { capture, attachments };
}

const attachmentCategorySchema = z.enum(['controle_leiteiro', 'comprovante', 'nota_fiscal', 'financeiro', 'mapa', 'outro']);
const attachmentName = (name: string) => name.replace(/[\\/\0]/g, '').trim().slice(0, 180) || 'Arquivo sem nome';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.header('x-request-id', c.req.header('x-request-id') ?? randomUUID());
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      logger.info('http.request.completed', {
        request_id: c.res.headers.get('x-request-id') ?? null,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
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
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    const username = parsed.success ? parsed.data.username : 'invalid';
    if (!loginAllowed(username, ip)) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.');
    const user = parsed.success ? await getDb().query.users.findFirst({ where: (table, { eq: equals }) => equals(table.username, parsed.data.username) }) : null;
    if (!parsed.success || !user || !await passwordMatches(parsed.data.password, user.passwordHash)) {
      recordLoginFailure(username, ip);
      throw new ApiError(401, 'INVALID_PASSWORD', 'Senha incorreta.');
    }
    clearLoginFailures(username, ip);
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.json({ ok: true });
  });

  app.post('/api/register', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? 'local';
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    const username = parsed.success ? parsed.data.username : 'invalid';
    const throttleSubject = `register:${username}`;
    if (!loginAllowed(throttleSubject, ip)) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.');
    if (!parsed.success) {
      recordLoginFailure(throttleSubject, ip);
      throw new ApiError(400, 'INVALID_REGISTRATION', registrationValidationMessage(parsed.error));
    }
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      const user = await getDb().transaction(async (tx) => {
        const farmId = uid('farm');
        const userId = uid('usr');
        await tx.insert(farms).values({ id: farmId, name: parsed.data.farmName });
        const created = (await tx.insert(users).values({ id: userId, farmId, name: parsed.data.displayName, username: parsed.data.username, passwordHash }).returning())[0];
        await tx.insert(auditEvents).values([
          { id: uid('au'), farmId, at: new Date(), actor: userId, action: 'provisionamento', entityType: 'fazenda', entityId: farmId, description: 'Fazenda criada no cadastro da conta.', origin: 'manual' },
          { id: uid('au'), farmId, at: new Date(), actor: userId, action: 'provisionamento', entityType: 'usuario', entityId: userId, description: 'Usuário proprietário criado no cadastro da conta.', origin: 'manual' },
        ]);
        return created;
      });
      clearLoginFailures(throttleSubject, ip);
      setSessionCookie(c, await createSession(user.id));
      return c.json({ ok: true }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) { recordLoginFailure(throttleSubject, ip); throw new ApiError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.'); }
      throw error;
    }
  });

  app.post('/api/logout', async (c) => {
    const token = sessionToken(c);
    if (token) await destroySession(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  // O carregamento inicial da SPA não deve produzir um 401 normal no console.
  // Sem sessão, não há estado de Fazenda no corpo da resposta.
  app.get('/api/bootstrap', async (c) => {
    const auth = await resolveAuth(sessionToken(c));
    if (!auth) return c.json({ authenticated: false });
    const state = await loadFarmState(getDb(), auth.farm.id);
    return c.json({ authenticated: true, state });
  });

  // ---------- autenticado ----------

  app.use('/api/*', requireAuth);

  app.get('/api/me', (c) => {
    const { user, farm } = c.get('auth');
    return c.json({ user, farm });
  });

  /** Contrato legado bloqueado: interpretar sem Captura persistida não é permitido. */
  app.post('/api/assistant/interpret', async (_c) => {
    throw new ApiError(410, 'CAPTURE_ENDPOINT_REQUIRED', 'Crie a Captura antes de solicitar a interpretação.');
  });

  /** Persiste a Captura textual antes de qualquer chamada ao Assistente. */
  app.post('/api/assistant/captures', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = z.object({ text: z.string().trim().min(1).max(20_000) }).safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'INVALID_CAPTURE', 'A Captura precisa conter texto.');
    const { user, farm } = c.get('auth');
    const capture = await getDb().transaction(async (tx) => {
      const row = (await tx.insert(assistantCaptures).values({ id: uid('cap'), farmId: farm.id, text: parsed.data.text, extractedText: null, createdAt: new Date() }).returning())[0];
      await auditAssistantMutation(tx, farm.id, user.id, 'captura', 'captura', row.id, 'Captura textual original registrada.');
      return row;
    });
    return c.json({ capture: toCapture(capture, []) }, 201);
  });

  app.post('/api/assistant/captures/photo', async (c) => {
    const contentLength = Number(c.req.header('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES + 256 * 1024) throw new ApiError(413, 'MEDIA_TOO_LARGE', 'A foto deve ter no máximo 10 MB.');
    const form = await c.req.raw.formData().catch(() => null);
    const candidate = form?.get('photo');
    if (!(candidate instanceof File)) throw new ApiError(400, 'INVALID_MEDIA', 'Envie a foto no campo photo.');
    const textValue = form?.get('text');
    const text = typeof textValue === 'string' ? textValue.trim() : '';
    if (text.length > 20_000) throw new ApiError(400, 'INVALID_CAPTURE', 'O texto da Captura deve ter no máximo 20.000 caracteres.');
    const categoryValue = form?.get('category');
    const category = attachmentCategorySchema.safeParse(typeof categoryValue === 'string' ? categoryValue : 'outro').success
      ? String(categoryValue || 'outro')
      : 'outro';
    const image = await validateImageUpload(candidate);
    const { user, farm } = c.get('auth');
    const captureId = uid('cap');
    const attachmentId = uid('att');
    const storageKey = privateImageKey(farm.id, captureId, attachmentId, image.extension);
    await putPrivateImage(storageKey, image);
    try {
      const created = await getDb().transaction(async (tx) => {
        const inserted = (await tx.insert(assistantCaptures).values({ id: captureId, farmId: farm.id, text: text || null, extractedText: null, createdAt: new Date() }).returning())[0];
        const attachment = (await tx.insert(assistantCaptureAttachments).values({ id: attachmentId, farmId: farm.id, captureId, kind: 'imagem', name: attachmentName(candidate.name), category, storageKey, mimeType: image.mimeType, byteSize: image.bytes.byteLength, durationMs: null, createdAt: new Date() }).returning())[0];
        await auditAssistantMutation(tx, farm.id, user.id, 'captura', 'captura', captureId, 'Foto original da Captura registrada.');
        return { capture: inserted, attachment };
      });
      return c.json({ capture: toCapture(created.capture, [created.attachment]) }, 201);
    } catch (error) {
      // Best effort: o binário nunca fica referenciado se a transação falhar.
      void import('./media.js').then(({ deletePrivateObject }) => deletePrivateObject(storageKey));
      throw error;
    }
  });

  /** Upload genérico da Galeria: mantém a Captura original e organiza o arquivo por categoria. */
  app.post('/api/assistant/captures/file', async (c) => {
    const contentLength = Number(c.req.header('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_BYTES + 256 * 1024) {
      throw new ApiError(413, 'MEDIA_TOO_LARGE', 'O arquivo deve ter no máximo 25 MB.');
    }
    const form = await c.req.raw.formData().catch(() => null);
    const candidate = form?.get('file');
    if (!(candidate instanceof File)) throw new ApiError(400, 'INVALID_MEDIA', 'Envie um arquivo no campo file.');
    const textValue = form?.get('text');
    const text = typeof textValue === 'string' ? textValue.trim() : '';
    if (text.length > 20_000) throw new ApiError(400, 'INVALID_CAPTURE', 'O texto da Captura deve ter no máximo 20.000 caracteres.');
    const parsedCategory = attachmentCategorySchema.safeParse(String(form?.get('category') ?? 'outro'));
    if (!parsedCategory.success) throw new ApiError(400, 'INVALID_ATTACHMENT_CATEGORY', 'Categoria de arquivo inválida.');
    const uploaded = await validateAttachmentUpload(candidate);
    const { user, farm } = c.get('auth');
    const captureId = uid('cap');
    const attachmentId = uid('att');
    const storageKey = privateAttachmentKey(farm.id, captureId, attachmentId, uploaded.extension);
    await putPrivateObject(storageKey, uploaded);
    try {
      const created = await getDb().transaction(async (tx) => {
        const capture = (await tx.insert(assistantCaptures).values({ id: captureId, farmId: farm.id, text: text || null, extractedText: null, createdAt: new Date() }).returning())[0];
        const attachment = (await tx.insert(assistantCaptureAttachments).values({
          id: attachmentId,
          farmId: farm.id,
          captureId,
          kind: uploaded.kind,
          name: attachmentName(candidate.name),
          category: parsedCategory.data,
          storageKey,
          mimeType: uploaded.mimeType,
          byteSize: uploaded.bytes.byteLength,
          durationMs: null,
          createdAt: new Date(),
        }).returning())[0];
        await auditAssistantMutation(tx, farm.id, user.id, 'captura', 'captura', captureId, 'Arquivo organizado na Galeria.');
        return { capture, attachment };
      });
      return c.json({ capture: toCapture(created.capture, [created.attachment]) }, 201);
    } catch (error) {
      void import('./media.js').then(({ deletePrivateObject }) => deletePrivateObject(storageKey));
      throw error;
    }
  });

  app.post('/api/assistant/captures/:captureId/read', async (c) => {
    const { user, farm } = c.get('auth');
    const captureId = c.req.param('captureId');
    const loaded = await captureWithAttachments(farm.id, captureId);
    if (!loaded) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'Captura não encontrada.');
    const { capture, attachments } = loaded;
    if (capture.extractedText) return c.json({ capture: toCapture(capture, attachments) });
    const attachment = attachments.find((item) => item.kind === 'imagem');
    if (!attachment) throw new ApiError(400, 'INVALID_CAPTURE', 'Esta Captura não possui foto para leitura.');
    if (attachment.mimeType !== 'image/jpeg' && attachment.mimeType !== 'image/png' && attachment.mimeType !== 'image/webp') throw new ApiError(400, 'INVALID_MEDIA', 'O tipo da foto não é suportado.');
    const image = await getPrivateImage(attachment.storageKey, attachment.mimeType);
    const extractedText = await readImageCapture(image);
    const updated = await getDb().transaction(async (tx) => {
      const row = (await tx.update(assistantCaptures)
        .set({ extractedText })
        .where(and(eq(assistantCaptures.id, capture.id), eq(assistantCaptures.farmId, farm.id), isNull(assistantCaptures.extractedText)))
        .returning())[0];
      if (!row) {
        return (await tx.select().from(assistantCaptures).where(and(eq(assistantCaptures.id, capture.id), eq(assistantCaptures.farmId, farm.id))).limit(1))[0];
      }
      await auditAssistantMutation(tx, farm.id, user.id, 'leitura', 'captura', capture.id, 'Leitura literal da foto da Captura registrada.');
      return row;
    });
    return c.json({ capture: toCapture(updated, attachments) });
  });

  app.post('/api/assistant/captures/:captureId/interpret', async (c) => {
    const { user, farm } = c.get('auth');
    const captureId = c.req.param('captureId');
    const loaded = await captureWithAttachments(farm.id, captureId);
    if (!loaded) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'Captura não encontrada.');
    const { capture, attachments } = loaded;
    const existing = await getDb().select().from(assistantProposals).where(eq(assistantProposals.captureId, capture.id));
    if (existing.length) return c.json({ capture: toCapture(capture, attachments), proposals: existing.map(toProposal), replayed: true });
    if (attachments.some((attachment) => attachment.kind === 'imagem') && !capture.extractedText) throw new ApiError(400, 'CAPTURE_NOT_READ', 'Leia a foto antes de interpretar a Captura.');
    const sourceText = [
      capture.text ? `Texto informado:\n${capture.text}` : null,
      capture.extractedText ? `Leitura literal da foto:\n${capture.extractedText}` : null,
    ].filter((part): part is string => Boolean(part)).join('\n\n');
    if (!sourceText) throw new ApiError(400, 'CAPTURE_NOT_READ', 'Informe o texto ou leia a foto antes de interpretar a Captura.');
    const proposals = await interpretAssistantCapture(
      sourceText,
      await assistantContext(farm.id),
      {
        requestId: c.res.headers.get('x-request-id') ?? null,
        captureId: capture.id,
        sourceKind: capture.text && capture.extractedText
          ? 'mixed'
          : capture.extractedText
            ? 'image'
            : 'text',
      },
    );
    const stored = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`assistant_capture:${farm.id}:${capture.id}`}))`);
      const alreadyStored = await tx.select().from(assistantProposals).where(eq(assistantProposals.captureId, capture.id));
      if (alreadyStored.length) return alreadyStored;
      const rows = [];
      for (const proposal of proposals) {
        const row = (await tx.insert(assistantProposals).values({ id: uid('prop'), captureId: capture.id, kind: proposal.kind, title: proposal.title, fields: proposal.fields, consequences: proposal.consequences, issues: proposal.issues, status: 'pendente', dismissReason: null, confirmedRecordIds: [] }).returning())[0];
        rows.push(row);
        await auditAssistantMutation(tx, farm.id, user.id, 'proposta', 'proposta', row.id, 'Proposta do Assistente criada a partir da Captura.');
      }
      return rows;
    });
    return c.json({ capture: toCapture(capture, attachments), proposals: stored.map(toProposal) }, 201);
  });

  app.get('/api/assistant/captures/:captureId/attachments/:attachmentId', async (c) => {
    const { farm } = c.get('auth');
    const attachment = (await getDb()
      .select({ attachment: assistantCaptureAttachments })
      .from(assistantCaptureAttachments)
      .innerJoin(assistantCaptures, and(eq(assistantCaptureAttachments.captureId, assistantCaptures.id), eq(assistantCaptureAttachments.farmId, assistantCaptures.farmId)))
      .where(and(eq(assistantCaptureAttachments.id, c.req.param('attachmentId')), eq(assistantCaptureAttachments.captureId, c.req.param('captureId')), eq(assistantCaptureAttachments.farmId, farm.id), eq(assistantCaptures.farmId, farm.id)))
      .limit(1))[0]?.attachment;
    if (!attachment) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
    const bytes = await getPrivateObject(attachment.storageKey);
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    const disposition = c.req.query('download') === '1' ? 'attachment' : 'inline';
    c.header('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
    return c.body(bytes, 200, { 'Content-Type': attachment.mimeType, 'Content-Length': String(bytes.byteLength) });
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
    logger.info('command.started', { request_id: c.res.headers.get('x-request-id') ?? null, command: action.type, user_id: auth.user.id, farm_id: auth.farm.id });

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
      logger.info('command.completed', { request_id: c.res.headers.get('x-request-id') ?? null, command: action.type, user_id: auth.user.id, farm_id: auth.farm.id, outcome: 'success' });
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
    const log = status >= 500 ? logger.error : logger.warn;
    log(status >= 500 ? 'http.request.failed' : 'http.request.rejected', {
      request_id: c.res.headers.get('x-request-id') ?? null,
      method: c.req.method,
      path: c.req.path,
      status,
      error_code: known ? error.code : 'INTERNAL_ERROR',
      error_type: errorType(error),
    });
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
