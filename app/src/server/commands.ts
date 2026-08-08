import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/client.js';
import {
  animalGroupAssignments,
  animals,
  assistantCaptureAttachments,
  assistantCaptures,
  assistantProposals,
  auditEvents,
  dailyMilkProductions,
  feedingEventItems,
  feedingEvents,
  feedEntries,
  feedItems,
  financialEntries,
  farmBoundaries,
  herdGroups,
  individualMilkMeasurements,
  installations,
  milkCollections,
  milkControlSessions,
  pastureOccupancies,
  pastures,
} from '../db/schema.js';
import { pointGeometryFromLatLng, polygonGeometryFromLatLng } from '../db/spatial.js';
import type { FactOrigin, ProposalField } from '../domain/types.js';
import { uid } from '../lib/prng.js';
import type { AuthContext } from './auth.js';
import { badRequest, conflict, notFound } from './http.js';
import {
  toAnimal,
  toAssignment,
  toCapture,
  toCaptureAttachment,
  toDailyMilkProduction,
  toFeedEntry,
  toFeedingEvent,
  toFeedItem,
  toFinancialEntry,
  toFarmBoundary,
  toHerdGroup,
  toInstallation,
  toMeasurement,
  toMilkCollection,
  toMilkControlSession,
  toOccupancy,
  toPasture,
  toProposal,
} from './mappers.js';

// ---------------------------------------------------------------------------
// Comandos do domínio — 1:1 com o union `Action` de src/state/store.tsx,
// EXCETO CorrectOperationalFact: o `apply(s)` do protótipo não atravessa a
// rede; aqui vira dados (ver correçãoSchema abaixo).
// Cada comando roda em UMA transação (ver routes em app.ts) e grava um
// audit_events na mesma transação.
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data ISO esperada (AAAA-MM-DD)');
const time = z.string().regex(/^\d{2}:\d{2}$/, 'hora esperada (HH:MM)');
const latLng = z.tuple([z.number(), z.number()]);
const liters = z.number().positive('litros deve ser > 0');
const isIndividualMilkLiters = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
const individualLiters = z.number().refine(isIndividualMilkLiters, 'a medição deve estar entre 0 e 100 L e ter no máximo 1 casa decimal');
const reason = z.string().trim().min(1, 'motivo é obrigatório');

const proposalInput = z.object({
  kind: z.enum(['producao_diaria', 'controle_leiteiro', 'coleta', 'trato', 'lancamento_financeiro', 'desconhecida']),
  title: z.string().min(1),
  fields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.string(),
      confidence: z.enum(['alta', 'media', 'baixa']),
    }),
  ),
  consequences: z.array(z.string()),
  issues: z.array(z.string()),
  dismissReason: z.string().optional(),
});

const reviewedProposalFields = z.array(
  z.object({
    key: z.string().min(1),
    label: z.string(),
    value: z.string(),
    confidence: z.enum(['alta', 'media', 'baixa']),
  }),
);

const reviewedMeasurementBindings = z.array(
  z.object({
    animalId: z.string().min(1),
    liters: individualLiters,
    sourceLabel: z.string().trim().min(1).max(80).optional(),
    assignmentAction: z.enum(['move', 'keep']).optional(),
  }),
);

/**
 * Correção de fato operacional — substitui o
 * `apply(s)` do protótipo. `reason` é obrigatório; `before`/`after`/`description`
 * são as strings de exibição gravadas na auditoria.
 */
const correctionSchema = z.object({
  type: z.literal('CorrectOperationalFact'),
  entityType: z.enum(['producao_diaria', 'coleta', 'medicao_individual']),
  entityId: z.string().min(1),
  newLiters: z.number().finite(),
  reason,
  description: z.string().min(1),
  before: z.string(),
  after: z.string(),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RecordDailyMilkProduction'), date: isoDate, liters }),
  z.object({
    type: z.literal('StartMilkControlSession'),
    date: isoDate,
    sessionId: z.string().min(1),
    groupId: z.string().min(1),
    shift: z.enum(['manha', 'tarde', 'unica']),
  }),
  z.object({
    type: z.literal('RecordIndividualMilkMeasurement'),
    sessionId: z.string().min(1),
    animalId: z.string().min(1),
    liters: individualLiters,
  }),
  z.object({ type: z.literal('CompleteMilkControlSession'), sessionId: z.string().min(1) }),
  z.object({ type: z.literal('RecordMilkCollection'), date: isoDate, time, liters }),
  correctionSchema,
  z.object({
    type: z.literal('RegisterAnimal'),
    name: z.string().trim().min(1),
    tag: z.string().trim().min(1).optional(),
    groupId: z.string().optional(),
    date: isoDate,
  }),
  z.object({
    type: z.literal('UpdateAnimal'),
    animalId: z.string().min(1),
    name: z.string().trim().min(1),
    tag: z.string().trim().min(1).optional(),
  }),
  z.object({ type: z.literal('ArchiveAnimal'), animalId: z.string().min(1), reason, date: isoDate }),
  z.object({
    type: z.literal('CreateHerdGroup'),
    name: z.string().trim().min(1),
    milkingsPerDay: z.union([z.literal(1), z.literal(2)]),
  }),
  z.object({ type: z.literal('AssignAnimalToGroup'), animalId: z.string().min(1), groupId: z.string().min(1), date: isoDate }),
  z.object({ type: z.literal('RegisterPasture'), name: z.string().trim().min(1), polygon: z.array(latLng).min(3) }),
  z.object({ type: z.literal('SetFarmBoundary'), name: z.string().trim().min(1), polygon: z.array(latLng).min(3) }),
  z.object({
    type: z.literal('UpdatePasture'),
    pastureId: z.string().min(1),
    name: z.string().trim().min(1),
    polygon: z.array(latLng).min(3),
  }),
  z.object({
    type: z.literal('RegisterInstallation'),
    name: z.string().trim().min(1),
    instType: z.enum(['curral', 'tanque', 'deposito', 'outro']),
    point: latLng,
  }),
  z.object({ type: z.literal('MoveHerdGroup'), groupId: z.string().min(1), pastureId: z.string().min(1), date: isoDate }),
  z.object({ type: z.literal('RegisterFeedItem'), name: z.string().trim().min(1), unit: z.string().trim().min(1) }),
  z.object({
    type: z.literal('RecordFeedEntry'),
    itemId: z.string().min(1),
    date: isoDate,
    quantity: z.number(),
    origin: z.string().min(1),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal('RecordFeedingEvent'),
    groupId: z.string().min(1),
    date: isoDate,
    items: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().positive() })).min(1),
  }),
  z.object({
    type: z.literal('RecordFinancialEntry'),
    kind: z.enum(['receita', 'despesa']),
    description: z.string().min(1),
    amountCents: z.number().int().positive(),
    date: isoDate,
    dueDate: isoDate.optional(),
  }),
  z.object({ type: z.literal('SettleFinancialEntry'), entryId: z.string().min(1), date: isoDate }),
  z.object({
    type: z.literal('CreateAssistantCapture'),
    text: z.string().min(1),
    proposals: z.array(proposalInput).min(1).max(8),
  }),
  z.object({
    type: z.literal('CreateAssistantCaptureFromAttachment'),
    attachmentId: z.string().min(1),
    text: z.string().trim().max(20_000).optional(),
  }),
  z.object({
    type: z.literal('UpdateAssistantAttachment'),
    attachmentId: z.string().min(1),
    name: z.string().trim().min(1).max(180),
    category: z.enum(['controle_leiteiro', 'comprovante', 'nota_fiscal', 'financeiro', 'mapa', 'outro']),
  }),
  z.object({
    type: z.literal('DeleteAssistantAttachment'),
    attachmentId: z.string().min(1),
  }),
  z.object({
    type: z.literal('ConfirmAssistantProposal'),
    proposalId: z.string().min(1),
    /** Valores revisados e vínculos aprovados pela pessoa, materializados no servidor. */
    fields: reviewedProposalFields,
    bindings: reviewedMeasurementBindings.optional(),
  }),
  z.object({ type: z.literal('DismissAssistantProposal'), proposalId: z.string().min(1), reason: z.string().optional() }),
]);

export type CommandAction = z.infer<typeof actionSchema>;

// ---------- helpers ----------

type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  before?: string;
  after?: string;
  reason?: string;
  origin: FactOrigin;
};

/** Auditoria na MESMA transação do comando. */
async function audit(tx: Tx, ctx: AuthContext, e: AuditInput) {
  await tx.insert(auditEvents).values({
    id: uid('au'),
    farmId: ctx.farm.id,
    at: new Date(),
    actor: ctx.user.name,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    description: e.description,
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
    origin: e.origin,
  });
}

async function findGroup(tx: Tx, farmId: string, groupId: string) {
  const rows = await tx.select().from(herdGroups).where(and(eq(herdGroups.id, groupId), eq(herdGroups.farmId, farmId))).limit(1);
  return rows[0] ?? null;
}

async function findAnimal(tx: Tx, farmId: string, animalId: string) {
  const rows = await tx.select().from(animals).where(and(eq(animals.id, animalId), eq(animals.farmId, farmId))).limit(1);
  return rows[0] ?? null;
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function earliestAssignmentEnd(
  currentEnd: string | null,
  nextStart: string | null,
) {
  const beforeNext = nextStart ? previousDate(nextStart) : null;
  if (currentEnd === null) return beforeNext;
  if (beforeNext === null) return currentEnd;
  return currentEnd < beforeNext ? currentEnd : beforeNext;
}

async function lockAnimalAssignments(tx: Tx, farmId: string, animalId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`animal_assignment:${farmId}:${animalId}`}))`,
  );
}

async function lockFarmAnimalIdentity(tx: Tx, farmId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`animal_identity:${farmId}`}))`,
  );
}

async function assignmentsAtDate(tx: Tx, animalId: string, date: string) {
  const assignments = await tx.select().from(animalGroupAssignments).where(eq(animalGroupAssignments.animalId, animalId));
  return assignments.filter((assignment) => assignment.start <= date && (assignment.end === null || assignment.end >= date));
}

function hasDuplicateAnimalIdentity(
  existing: { id: string; name: string; tag: string | null },
  name: string,
  tag: string | undefined,
) {
  const normalizedName = normalizeAssistantLabel(name);
  const normalizedTag = tag ? normalizeAssistantLabel(tag) : null;
  const existingTag = existing.tag ? normalizeAssistantLabel(existing.tag) : null;
  if (normalizedTag && existingTag === normalizedTag) return true;
  if (normalizeAssistantLabel(existing.name) !== normalizedName) return false;
  return !(normalizedTag && existingTag && normalizedTag !== existingTag);
}

async function moveAnimalForAssistantControl(
  tx: Tx,
  ctx: AuthContext,
  animal: { id: string; name: string },
  group: { id: string; name: string },
  date: string,
  assignment: { id: string; groupId: string; start: string; end: string | null } | null,
) {
  const future = (await tx.select().from(animalGroupAssignments).where(eq(animalGroupAssignments.animalId, animal.id)))
    .filter((candidate) => candidate.start > date)
    .sort((left, right) => left.start.localeCompare(right.start))[0] ?? null;

  if (assignment?.groupId === group.id) return { assignment, changed: false };

  let moved;
  if (assignment?.start === date) {
    moved = (await tx.update(animalGroupAssignments)
      .set({ groupId: group.id })
      .where(eq(animalGroupAssignments.id, assignment.id))
      .returning())[0];
  } else {
    if (assignment) {
      await tx.update(animalGroupAssignments)
        .set({ end: previousDate(date) })
        .where(eq(animalGroupAssignments.id, assignment.id));
    }
    moved = (await tx.insert(animalGroupAssignments).values({
      id: uid('as'),
      animalId: animal.id,
      groupId: group.id,
      start: date,
      end: earliestAssignmentEnd(assignment?.end ?? null, future?.start ?? null),
    }).returning())[0];
  }
  await audit(tx, ctx, {
    action: 'movimentacao',
    entityType: 'lotacao',
    entityId: moved.id,
    description: `Lotação alterada pelo Assistente (${animal.name} → ${group.name})`,
    origin: 'assistente',
  });
  return { assignment: moved, changed: true };
}

async function spatialPasture(tx: Tx, farmId: string, pastureId: string) {
  const result = await tx.execute(sql`SELECT id, farm_id AS "farmId", name,
    ST_AsGeoJSON(polygon)::jsonb AS polygon FROM pastures
    WHERE id = ${pastureId} AND farm_id = ${farmId} LIMIT 1`);
  return result.rows[0] as never;
}

async function spatialInstallation(tx: Tx, farmId: string, installationId: string) {
  const result = await tx.execute(sql`SELECT id, farm_id AS "farmId", name, type,
    ST_AsGeoJSON(point)::jsonb AS point FROM installations
    WHERE id = ${installationId} AND farm_id = ${farmId} LIMIT 1`);
  return result.rows[0] as never;
}

async function spatialBoundary(tx: Tx, farmId: string, boundaryId: string) {
  const result = await tx.execute(sql`SELECT id, farm_id AS "farmId", name,
    ST_AsGeoJSON(boundary)::jsonb AS boundary FROM farm_boundaries
    WHERE id = ${boundaryId} AND farm_id = ${farmId} LIMIT 1`);
  return result.rows[0] as never;
}

// ---------- executor ----------

export async function executeCommand(tx: Tx, ctx: AuthContext, a: CommandAction): Promise<unknown> {
  const farmId = ctx.farm.id;

  switch (a.type) {
    case 'RecordDailyMilkProduction': {
      const dup = await tx
        .select({ id: dailyMilkProductions.id })
        .from(dailyMilkProductions)
        .where(and(eq(dailyMilkProductions.farmId, farmId), eq(dailyMilkProductions.date, a.date)))
        .limit(1);
      if (dup.length > 0) {
        throw conflict('DUPLICATE_PRODUCTION_DATE', `Já existe produção diária registrada para ${a.date}. Use Correção para ajustar o valor.`);
      }
      const inserted = await tx
        .insert(dailyMilkProductions)
        .values({ id: uid('pd'), farmId, date: a.date, liters: a.liters, origin: 'manual' })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'producao_diaria',
        entityId: inserted[0].id,
        description: `Produção diária de ${a.date} registrada`,
        origin: 'manual',
      });
      return { production: toDailyMilkProduction(inserted[0]) };
    }

    case 'StartMilkControlSession': {
      const group = await findGroup(tx, farmId, a.groupId);
      if (!group) throw notFound('GROUP_NOT_FOUND', `Lote ${a.groupId} não encontrado.`);
      if (group.milkingsPerDay === 1 && a.shift !== 'unica') {
        throw badRequest('INVALID_SHIFT', `${group.name} ordenha 1×/dia — o turno deve ser "unica".`);
      }
      if (group.milkingsPerDay === 2 && a.shift === 'unica') {
        throw badRequest('INVALID_SHIFT', `${group.name} ordenha 2×/dia — o turno deve ser "manha" ou "tarde".`);
      }
      const dup = await tx
        .select({ id: milkControlSessions.id })
        .from(milkControlSessions)
        .where(and(eq(milkControlSessions.groupId, a.groupId), eq(milkControlSessions.date, a.date), eq(milkControlSessions.shift, a.shift)))
        .limit(1);
      if (dup.length > 0) throw conflict('SESSION_EXISTS', `Já existe controle leiteiro de ${group.name} em ${a.date} (${a.shift}).`);
      const inserted = await tx
        .insert(milkControlSessions)
        .values({ id: a.sessionId, farmId, date: a.date, groupId: a.groupId, shift: a.shift, status: 'em_andamento', origin: 'manual' })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'controle_leiteiro',
        entityId: inserted[0].id,
        description: `Controle leiteiro iniciado (${group.name}, ${a.date}, ${a.shift})`,
        origin: 'manual',
      });
      return { session: toMilkControlSession(inserted[0]) };
    }

    case 'RecordIndividualMilkMeasurement': {
      if (!isIndividualMilkLiters(a.liters)) {
        throw badRequest('INVALID_MEASUREMENT', 'A medição individual deve estar entre 0 e 100 L.');
      }
      const session = (
        await tx.select().from(milkControlSessions).where(and(eq(milkControlSessions.id, a.sessionId), eq(milkControlSessions.farmId, farmId))).limit(1)
      )[0];
      if (!session) throw notFound('SESSION_NOT_FOUND', `Sessão de controle ${a.sessionId} não encontrada.`);
      // Concluído impede duplicatas e edição silenciosa, mas não impede o
      // preenchimento posterior de uma lacuna ainda sem Medição.
      const animal = await findAnimal(tx, farmId, a.animalId);
      if (!animal) throw notFound('ANIMAL_NOT_FOUND', `Animal ${a.animalId} não encontrado.`);
      const duplicate = await tx
        .select({ id: individualMilkMeasurements.id })
        .from(individualMilkMeasurements)
        .where(and(eq(individualMilkMeasurements.sessionId, a.sessionId), eq(individualMilkMeasurements.animalId, a.animalId)))
        .limit(1);
      if (duplicate.length > 0) {
        throw conflict('MEASUREMENT_EXISTS', `Já existe medição de ${animal.name} neste Controle leiteiro. O Registro existente não será sobrescrito automaticamente.`);
      }
      const inserted = await tx
        .insert(individualMilkMeasurements)
        .values({ id: uid('mm'), sessionId: a.sessionId, animalId: a.animalId, liters: a.liters })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'medicao_individual',
        entityId: inserted[0].id,
        description: `Medição individual registrada (${animal.name}: ${a.liters.toFixed(1).replace('.', ',')} L)`,
        origin: 'manual',
      });
      return { measurement: toMeasurement(inserted[0]) };
    }

    case 'CompleteMilkControlSession': {
      const session = (
        await tx.select().from(milkControlSessions).where(and(eq(milkControlSessions.id, a.sessionId), eq(milkControlSessions.farmId, farmId))).limit(1)
      )[0];
      if (!session) throw notFound('SESSION_NOT_FOUND', `Sessão de controle ${a.sessionId} não encontrada.`);
      if (session.status === 'concluido') return { session: toMilkControlSession(session) }; // idempotente
      const updated = await tx
        .update(milkControlSessions)
        .set({ status: 'concluido' })
        .where(eq(milkControlSessions.id, a.sessionId))
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'controle_leiteiro',
        entityId: a.sessionId,
        description: 'Controle leiteiro concluído',
        origin: 'manual',
      });
      return { session: toMilkControlSession(updated[0]) };
    }

    case 'RecordMilkCollection': {
      const inserted = await tx
        .insert(milkCollections)
        .values({ id: uid('col'), farmId, date: a.date, time: a.time, liters: a.liters, origin: 'manual' })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'coleta',
        entityId: inserted[0].id,
        description: `Coleta de ${a.date} às ${a.time} registrada`,
        origin: 'manual',
      });
      return { collection: toMilkCollection(inserted[0]) };
    }

    case 'CorrectOperationalFact': {
      // Correção exige motivo (zod) e grava before/after na auditoria.
      let result: unknown;
      if (a.entityType === 'producao_diaria') {
        if (a.newLiters <= 0) throw badRequest('INVALID_VOLUME', 'O volume deve ser maior que zero.');
        const current = (
          await tx.select().from(dailyMilkProductions).where(and(eq(dailyMilkProductions.id, a.entityId), eq(dailyMilkProductions.farmId, farmId))).limit(1)
        )[0];
        if (!current) throw notFound('FACT_NOT_FOUND', `Produção diária ${a.entityId} não encontrada.`);
        const updated = await tx.update(dailyMilkProductions).set({ liters: a.newLiters }).where(eq(dailyMilkProductions.id, a.entityId)).returning();
        result = { production: toDailyMilkProduction(updated[0]) };
      } else if (a.entityType === 'coleta') {
        if (a.newLiters <= 0) throw badRequest('INVALID_VOLUME', 'O volume deve ser maior que zero.');
        const current = (
          await tx.select().from(milkCollections).where(and(eq(milkCollections.id, a.entityId), eq(milkCollections.farmId, farmId))).limit(1)
        )[0];
        if (!current) throw notFound('FACT_NOT_FOUND', `Coleta ${a.entityId} não encontrada.`);
        const updated = await tx.update(milkCollections).set({ liters: a.newLiters }).where(eq(milkCollections.id, a.entityId)).returning();
        result = { collection: toMilkCollection(updated[0]) };
      } else {
        if (!isIndividualMilkLiters(a.newLiters)) {
          throw badRequest('INVALID_MEASUREMENT', 'A medição individual deve estar entre 0 e 100 L.');
        }
        const current = (
          await tx
            .select({ measurement: individualMilkMeasurements, session: milkControlSessions })
            .from(individualMilkMeasurements)
            .innerJoin(milkControlSessions, eq(milkControlSessions.id, individualMilkMeasurements.sessionId))
            .where(and(eq(individualMilkMeasurements.id, a.entityId), eq(milkControlSessions.farmId, farmId)))
            .limit(1)
        )[0];
        if (!current) throw notFound('FACT_NOT_FOUND', `Medição individual ${a.entityId} não encontrada.`);
        const updated = await tx
          .update(individualMilkMeasurements)
          .set({ liters: a.newLiters })
          .where(eq(individualMilkMeasurements.id, a.entityId))
          .returning();
        result = { measurement: toMeasurement(updated[0]) };
      }
      await audit(tx, ctx, {
        action: 'correcao',
        entityType: a.entityType,
        entityId: a.entityId,
        description: a.description,
        before: a.before,
        after: a.after,
        reason: a.reason,
        origin: 'manual',
      });
      return result;
    }

    case 'RegisterAnimal': {
      if (a.groupId) {
        const group = await findGroup(tx, farmId, a.groupId);
        if (!group) throw notFound('GROUP_NOT_FOUND', `Lote ${a.groupId} não encontrado.`);
      }
      await lockFarmAnimalIdentity(tx, farmId);
      const existingAnimals = await tx.select().from(animals).where(eq(animals.farmId, farmId));
      const duplicate = existingAnimals.find((animal) => hasDuplicateAnimalIdentity(animal, a.name, a.tag));
      if (duplicate) {
        throw conflict(
          'DUPLICATE_ANIMAL',
          `Já existe um Animal com este nome ou brinco na Fazenda (${duplicate.name}). Confira o cadastro antes de continuar.`,
        );
      }
      const inserted = await tx
        .insert(animals)
        .values({ id: uid('a'), farmId, name: a.name, tag: a.tag ?? null, status: 'ativo' })
        .returning();
      let assignment = null;
      if (a.groupId) {
        assignment = (
          await tx
            .insert(animalGroupAssignments)
            .values({ id: uid('as'), animalId: inserted[0].id, groupId: a.groupId, start: a.date, end: null })
            .returning()
        )[0];
      }
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'animal',
        entityId: inserted[0].id,
        description: `Animal ${inserted[0].name} cadastrado`,
        origin: 'manual',
      });
      return { animal: toAnimal(inserted[0]), assignment: assignment ? toAssignment(assignment) : null };
    }

    case 'UpdateAnimal': {
      const animal = await findAnimal(tx, farmId, a.animalId);
      if (!animal) throw notFound('ANIMAL_NOT_FOUND', `Animal ${a.animalId} não encontrado.`);
      await lockFarmAnimalIdentity(tx, farmId);
      const existingAnimals = await tx.select().from(animals).where(eq(animals.farmId, farmId));
      const duplicate = existingAnimals.find((candidate) => candidate.id !== a.animalId && hasDuplicateAnimalIdentity(candidate, a.name, a.tag));
      if (duplicate) {
        throw conflict(
          'DUPLICATE_ANIMAL',
          `Já existe um Animal com este nome ou brinco na Fazenda (${duplicate.name}). Confira o cadastro antes de continuar.`,
        );
      }
      const updated = await tx
        .update(animals)
        .set({ name: a.name, tag: a.tag ?? null })
        .where(and(eq(animals.id, a.animalId), eq(animals.farmId, farmId)))
        .returning();
      await audit(tx, ctx, {
        action: 'correcao',
        entityType: 'animal',
        entityId: a.animalId,
        description: 'Dados do Animal atualizados',
        before: [animal.name, animal.tag].filter(Boolean).join(' · '),
        after: [updated[0].name, updated[0].tag].filter(Boolean).join(' · '),
        origin: 'manual',
      });
      return { animal: toAnimal(updated[0]) };
    }

    case 'ArchiveAnimal': {
      const animal = await findAnimal(tx, farmId, a.animalId);
      if (!animal) throw notFound('ANIMAL_NOT_FOUND', `Animal ${a.animalId} não encontrado.`);
      if (animal.status !== 'ativo') throw conflict('ALREADY_ARCHIVED', `${animal.name} já está arquivado.`);
      const updated = await tx
        .update(animals)
        .set({ status: 'arquivado', archivedAt: a.date, archiveReason: a.reason })
        .where(eq(animals.id, a.animalId))
        .returning();
      // Arquivar fecha a lotação aberta (se houver).
      await tx
        .update(animalGroupAssignments)
        .set({ end: a.date })
        .where(and(eq(animalGroupAssignments.animalId, a.animalId), isNull(animalGroupAssignments.end)));
      await audit(tx, ctx, {
        action: 'arquivamento',
        entityType: 'animal',
        entityId: a.animalId,
        description: 'Animal arquivado',
        reason: a.reason,
        origin: 'manual',
      });
      return { animal: toAnimal(updated[0]) };
    }

    case 'CreateHerdGroup': {
      const inserted = await tx
        .insert(herdGroups)
        .values({ id: uid('g'), farmId, name: a.name, milkingsPerDay: a.milkingsPerDay })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'lote',
        entityId: inserted[0].id,
        description: `Lote ${inserted[0].name} criado (${a.milkingsPerDay} ordenha${a.milkingsPerDay === 2 ? 's' : ''}/dia)`,
        origin: 'manual',
      });
      return { group: toHerdGroup(inserted[0]) };
    }

    case 'AssignAnimalToGroup': {
      const animal = await findAnimal(tx, farmId, a.animalId);
      if (!animal) throw notFound('ANIMAL_NOT_FOUND', `Animal ${a.animalId} não encontrado.`);
      if (animal.status !== 'ativo') throw conflict('ANIMAL_ARCHIVED', `${animal.name} está arquivado.`);
      const group = await findGroup(tx, farmId, a.groupId);
      if (!group) throw notFound('GROUP_NOT_FOUND', `Lote ${a.groupId} não encontrado.`);
      await lockAnimalAssignments(tx, farmId, a.animalId);
      const open = (
        await tx
          .select()
          .from(animalGroupAssignments)
          .where(and(eq(animalGroupAssignments.animalId, a.animalId), isNull(animalGroupAssignments.end)))
          .limit(1)
      )[0];
      if (open?.groupId === a.groupId) throw conflict('SAME_GROUP', `${animal.name} já está no ${group.name}.`);
      if (open && a.date < open.start) {
        throw conflict(
          'INVALID_ASSIGNMENT_DATE',
          `A nova Lotação não pode começar antes da Lotação aberta de ${animal.name}.`,
        );
      }
      // A data final é inclusiva. Uma troca no mesmo dia em que a Lotação
      // começou corrige a linha; nos demais casos, fecha em D-1 e abre em D.
      let inserted;
      if (open?.start === a.date) {
        inserted = await tx
          .update(animalGroupAssignments)
          .set({ groupId: a.groupId })
          .where(eq(animalGroupAssignments.id, open.id))
          .returning();
      } else {
        if (open) {
          await tx
            .update(animalGroupAssignments)
            .set({ end: previousDate(a.date) })
            .where(eq(animalGroupAssignments.id, open.id));
        }
        inserted = await tx
          .insert(animalGroupAssignments)
          .values({ id: uid('as'), animalId: a.animalId, groupId: a.groupId, start: a.date, end: null })
          .returning();
      }
      await audit(tx, ctx, {
        action: 'movimentacao',
        entityType: 'animal',
        entityId: a.animalId,
        description: `Lotação alterada (${animal.name} → ${group.name})`,
        origin: 'manual',
      });
      return {
        assignment: toAssignment(inserted[0]),
        closedAssignmentId: open && open.start !== a.date ? open.id : null,
      };
    }

    case 'RegisterPasture': {
      const inserted = await tx.insert(pastures).values({
        id: uid('p'),
        farmId,
        name: a.name,
        polygon: polygonGeometryFromLatLng(a.polygon) as never,
      }).returning({ id: pastures.id });
      const pasture = await spatialPasture(tx, farmId, inserted[0].id);
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'pasto',
        entityId: inserted[0].id,
        description: `Pasto ${a.name} cadastrado`,
        origin: 'manual',
      });
      return { pasture: toPasture(pasture) };
    }

    case 'SetFarmBoundary': {
      const current = await tx
        .select({ id: farmBoundaries.id })
        .from(farmBoundaries)
        .where(eq(farmBoundaries.farmId, farmId))
        .limit(1);
      const boundaryId = current[0]?.id ?? uid('boundary');
      if (current[0]) {
        await tx.update(farmBoundaries).set({
          name: a.name,
          boundary: polygonGeometryFromLatLng(a.polygon) as never,
        }).where(eq(farmBoundaries.id, boundaryId));
      } else {
        await tx.insert(farmBoundaries).values({
          id: boundaryId,
          farmId,
          name: a.name,
          boundary: polygonGeometryFromLatLng(a.polygon) as never,
        });
      }
      const boundary = await spatialBoundary(tx, farmId, boundaryId);
      await audit(tx, ctx, {
        action: current[0] ? 'correcao' : 'registro',
        entityType: 'limite_fazenda',
        entityId: boundaryId,
        description: current[0] ? `Perímetro ${a.name} atualizado` : `Perímetro ${a.name} configurado`,
        origin: 'manual',
      });
      return { farmBoundary: toFarmBoundary(boundary) };
    }

    case 'UpdatePasture': {
      const pasture = (
        await tx.select().from(pastures).where(and(eq(pastures.id, a.pastureId), eq(pastures.farmId, farmId))).limit(1)
      )[0];
      if (!pasture) throw notFound('PASTURE_NOT_FOUND', `Pasto ${a.pastureId} não encontrado.`);
      await tx.update(pastures).set({
        name: a.name,
        polygon: polygonGeometryFromLatLng(a.polygon) as never,
      }).where(eq(pastures.id, a.pastureId));
      const updated = await spatialPasture(tx, farmId, a.pastureId);
      await audit(tx, ctx, {
        action: 'correcao',
        entityType: 'pasto',
        entityId: a.pastureId,
        description: `Pasto ${a.name} atualizado`,
        origin: 'manual',
      });
      return { pasture: toPasture(updated) };
    }

    case 'RegisterInstallation': {
      const inserted = await tx
        .insert(installations)
        .values({ id: uid('i'), farmId, name: a.name, type: a.instType, point: pointGeometryFromLatLng(a.point) as never })
        .returning({ id: installations.id });
      const installation = await spatialInstallation(tx, farmId, inserted[0].id);
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'instalacao',
        entityId: inserted[0].id,
        description: `Instalação ${a.name} cadastrada`,
        origin: 'manual',
      });
      return { installation: toInstallation(installation) };
    }

    case 'MoveHerdGroup': {
      const group = await findGroup(tx, farmId, a.groupId);
      if (!group) throw notFound('GROUP_NOT_FOUND', `Lote ${a.groupId} não encontrado.`);
      const pasture = (
        await tx.select().from(pastures).where(and(eq(pastures.id, a.pastureId), eq(pastures.farmId, farmId))).limit(1)
      )[0];
      if (!pasture) throw notFound('PASTURE_NOT_FOUND', `Pasto ${a.pastureId} não encontrado.`);
      // 1 Lote por Pasto por vez: qualquer ocupação aberta de OUTRO Lote bloqueia.
      const occupying = await tx
        .select()
        .from(pastureOccupancies)
        .where(and(eq(pastureOccupancies.pastureId, a.pastureId), isNull(pastureOccupancies.end)));
      const blocker = occupying.find((o) => o.groupId !== a.groupId);
      if (blocker) throw conflict('PASTURE_OCCUPIED', `${pasture.name} já está ocupado por outro Lote.`);
      const own = occupying.find((o) => o.groupId === a.groupId);
      if (own) return { occupancy: toOccupancy(own) }; // já está lá — idempotente
      await tx
        .update(pastureOccupancies)
        .set({ end: a.date })
        .where(and(eq(pastureOccupancies.groupId, a.groupId), isNull(pastureOccupancies.end)));
      const inserted = await tx
        .insert(pastureOccupancies)
        .values({ id: uid('o'), groupId: a.groupId, pastureId: a.pastureId, start: a.date, end: null })
        .returning();
      await audit(tx, ctx, {
        action: 'movimentacao',
        entityType: 'lote',
        entityId: a.groupId,
        description: `${group.name} movido para ${pasture.name}`,
        origin: 'manual',
      });
      return { occupancy: toOccupancy(inserted[0]) };
    }

    case 'RegisterFeedItem': {
      const inserted = await tx.insert(feedItems).values({ id: uid('f'), farmId, name: a.name, unit: a.unit }).returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'alimento',
        entityId: inserted[0].id,
        description: `Alimento ${inserted[0].name} cadastrado`,
        origin: 'manual',
      });
      return { feedItem: toFeedItem(inserted[0]) };
    }

    case 'RecordFeedEntry': {
      const item = (
        await tx.select().from(feedItems).where(and(eq(feedItems.id, a.itemId), eq(feedItems.farmId, farmId))).limit(1)
      )[0];
      if (!item) throw notFound('FEED_ITEM_NOT_FOUND', `Alimento ${a.itemId} não encontrado.`);
      const inserted = await tx
        .insert(feedEntries)
        .values({ id: uid('fe'), farmId, itemId: a.itemId, date: a.date, quantity: a.quantity, origin: a.origin, note: a.note ?? null })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'entrada_alimento',
        entityId: inserted[0].id,
        description: 'Entrada de alimento registrada',
        origin: 'manual',
      });
      return { feedEntry: toFeedEntry(inserted[0]) };
    }

    case 'RecordFeedingEvent': {
      const group = await findGroup(tx, farmId, a.groupId);
      if (!group) throw notFound('GROUP_NOT_FOUND', `Lote ${a.groupId} não encontrado.`);
      for (const item of a.items) {
        const found = (
          await tx.select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.id, item.itemId), eq(feedItems.farmId, farmId))).limit(1)
        )[0];
        if (!found) throw notFound('FEED_ITEM_NOT_FOUND', `Alimento ${item.itemId} não encontrado.`);
      }
      const inserted = await tx
        .insert(feedingEvents)
        .values({ id: uid('fv'), farmId, groupId: a.groupId, date: a.date, origin: 'manual' })
        .returning();
      await tx
        .insert(feedingEventItems)
        .values(a.items.map((item) => ({ id: uid('fi'), eventId: inserted[0].id, itemId: item.itemId, quantity: item.quantity })));
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'trato',
        entityId: inserted[0].id,
        description: 'Trato registrado',
        origin: 'manual',
      });
      return { feedingEvent: toFeedingEvent(inserted[0], a.items) };
    }

    case 'RecordFinancialEntry': {
      const inserted = await tx
        .insert(financialEntries)
        .values({
          id: uid('fin'),
          farmId,
          kind: a.kind,
          description: a.description,
          amountCents: a.amountCents,
          date: a.date,
          dueDate: a.dueDate ?? null,
          settledAt: null,
          origin: 'manual',
        })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'lancamento_financeiro',
        entityId: inserted[0].id,
        description: `${a.kind === 'receita' ? 'Receita' : 'Despesa'} registrada`,
        origin: 'manual',
      });
      return { financialEntry: toFinancialEntry(inserted[0]) };
    }

    case 'SettleFinancialEntry': {
      const entry = (
        await tx.select().from(financialEntries).where(and(eq(financialEntries.id, a.entryId), eq(financialEntries.farmId, farmId))).limit(1)
      )[0];
      if (!entry) throw notFound('ENTRY_NOT_FOUND', `Lançamento ${a.entryId} não encontrado.`);
      if (entry.settledAt !== null) throw conflict('ALREADY_SETTLED', 'Este lançamento já está liquidado.');
      const updated = await tx.update(financialEntries).set({ settledAt: a.date }).where(eq(financialEntries.id, a.entryId)).returning();
      await audit(tx, ctx, {
        action: 'liquidacao',
        entityType: 'lancamento_financeiro',
        entityId: a.entryId,
        description: 'Lançamento liquidado',
        origin: 'manual',
      });
      return { financialEntry: toFinancialEntry(updated[0]) };
    }

    case 'CreateAssistantCapture': {
      const capture = (
        await tx.insert(assistantCaptures).values({ id: uid('cap'), farmId, text: a.text, createdAt: new Date() }).returning()
      )[0];
      const proposals = [];
      for (const input of a.proposals) {
        const proposal = (
          await tx
            .insert(assistantProposals)
            .values({
              id: uid('prop'),
              captureId: capture.id,
              kind: input.kind,
              title: input.title,
              fields: input.fields,
              consequences: input.consequences,
              issues: input.issues,
              status: 'pendente',
              dismissReason: input.dismissReason ?? null,
              confirmedRecordIds: [],
            })
            .returning()
        )[0];
        proposals.push(proposal);
        await audit(tx, ctx, {
          action: 'captura',
          entityType: 'proposta',
          entityId: proposal.id,
          description: `Captura do Assistente registrada ("${proposal.title}")`,
          origin: 'assistente',
        });
      }
      return { capture: toCapture(capture), proposals: proposals.map(toProposal) };
    }

    case 'CreateAssistantCaptureFromAttachment': {
      const source = (await tx
        .select({ attachment: assistantCaptureAttachments, capture: assistantCaptures })
        .from(assistantCaptureAttachments)
        .innerJoin(assistantCaptures, and(eq(assistantCaptureAttachments.captureId, assistantCaptures.id), eq(assistantCaptureAttachments.farmId, assistantCaptures.farmId)))
        .where(and(eq(assistantCaptureAttachments.id, a.attachmentId), eq(assistantCaptureAttachments.farmId, farmId), isNull(assistantCaptureAttachments.deletedAt)))
        .limit(1))[0];
      if (!source) throw notFound('ATTACHMENT_NOT_FOUND', 'Arquivo não encontrado na Galeria.');
      const capture = (await tx.insert(assistantCaptures).values({
        id: uid('cap'),
        farmId,
        text: a.text?.trim() || source.capture.text,
        extractedText: source.capture.extractedText,
        createdAt: new Date(),
      }).returning())[0];
      const attachment = (await tx.insert(assistantCaptureAttachments).values({
        id: uid('att'),
        farmId,
        captureId: capture.id,
        sourceAttachmentId: source.attachment.id,
        kind: source.attachment.kind,
        name: source.attachment.name ?? 'Arquivo sem nome',
        category: source.attachment.category ?? 'outro',
        storageKey: source.attachment.storageKey,
        mimeType: source.attachment.mimeType,
        byteSize: source.attachment.byteSize,
        durationMs: source.attachment.durationMs,
        createdAt: new Date(),
      }).returning())[0];
      await audit(tx, ctx, {
        action: 'captura',
        entityType: 'captura',
        entityId: capture.id,
        description: `Arquivo ${source.attachment.name ?? 'sem nome'} reutilizado na Galeria`,
        origin: 'manual',
      });
      return { capture: toCapture(capture, [attachment]), attachment: toCaptureAttachment(attachment) };
    }

    case 'UpdateAssistantAttachment': {
      const current = (await tx.select().from(assistantCaptureAttachments).where(and(eq(assistantCaptureAttachments.id, a.attachmentId), eq(assistantCaptureAttachments.farmId, farmId), isNull(assistantCaptureAttachments.deletedAt))).limit(1))[0];
      if (!current) throw notFound('ATTACHMENT_NOT_FOUND', 'Arquivo não encontrado na Galeria.');
      const updated = (await tx.update(assistantCaptureAttachments).set({ name: a.name, category: a.category }).where(and(eq(assistantCaptureAttachments.id, a.attachmentId), eq(assistantCaptureAttachments.farmId, farmId))).returning())[0];
      await audit(tx, ctx, {
        action: 'correcao',
        entityType: 'anexo_captura',
        entityId: a.attachmentId,
        description: 'Metadados do arquivo atualizados na Galeria',
        before: `${current.name} · ${current.category}`,
        after: `${updated.name} · ${updated.category}`,
        origin: 'manual',
      });
      return { attachment: toCaptureAttachment(updated) };
    }

    case 'DeleteAssistantAttachment': {
      const current = (await tx.select().from(assistantCaptureAttachments).where(and(eq(assistantCaptureAttachments.id, a.attachmentId), eq(assistantCaptureAttachments.farmId, farmId), isNull(assistantCaptureAttachments.deletedAt))).limit(1))[0];
      if (!current) throw notFound('ATTACHMENT_NOT_FOUND', 'Arquivo não encontrado na Galeria.');
      const updated = (await tx.update(assistantCaptureAttachments).set({ deletedAt: new Date() }).where(and(eq(assistantCaptureAttachments.id, a.attachmentId), eq(assistantCaptureAttachments.farmId, farmId), isNull(assistantCaptureAttachments.deletedAt))).returning())[0];
      await audit(tx, ctx, {
        action: 'arquivamento',
        entityType: 'anexo_captura',
        entityId: a.attachmentId,
        description: `Arquivo ${current.name} removido da Galeria`,
        origin: 'manual',
      });
      return { attachment: toCaptureAttachment(updated) };
    }

    case 'ConfirmAssistantProposal': {
      const proposal = await findProposal(tx, farmId, a.proposalId);
      if (!proposal) throw notFound('PROPOSAL_NOT_FOUND', `Proposta ${a.proposalId} não encontrada.`);
      if (proposal.status !== 'pendente') return { proposal: toProposal(proposal) }; // idempotente
      const claimed = await tx
        .update(assistantProposals)
        .set({ status: 'confirmada' })
        .where(and(eq(assistantProposals.id, a.proposalId), eq(assistantProposals.status, 'pendente')))
        .returning();
      if (!claimed[0]) {
        const current = await findProposal(tx, farmId, a.proposalId);
        if (current) return { proposal: toProposal(current) };
        throw notFound('PROPOSAL_NOT_FOUND', `Proposta ${a.proposalId} não encontrada.`);
      }
      const materialized = await materializeAssistantProposal(tx, ctx, proposal, a.fields, a.bindings);
      const updated = await tx
        .update(assistantProposals)
        .set({ confirmedRecordIds: materialized.recordIds })
        .where(eq(assistantProposals.id, a.proposalId))
        .returning();
      await audit(tx, ctx, {
        action: 'confirmacao',
        entityType: 'proposta',
        entityId: proposal.id,
        description: `Proposta "${proposal.title}" confirmada`,
        origin: 'assistente',
      });
      return {
        proposal: toProposal(updated[0]),
        facts: materialized.facts,
        recordIds: materialized.recordIds,
        summary: materialized.summary,
      };
    }

    case 'DismissAssistantProposal': {
      const proposal = await findProposal(tx, farmId, a.proposalId);
      if (!proposal) throw notFound('PROPOSAL_NOT_FOUND', `Proposta ${a.proposalId} não encontrada.`);
      if (proposal.status !== 'pendente') return { proposal: toProposal(proposal) }; // idempotente
      const updated = await tx
        .update(assistantProposals)
        .set({ status: 'descartada', dismissReason: a.reason ?? null })
        .where(eq(assistantProposals.id, a.proposalId))
        .returning();
      await audit(tx, ctx, {
        action: 'descarte',
        entityType: 'proposta',
        entityId: proposal.id,
        description: `Proposta "${proposal.title}" descartada`,
        reason: a.reason,
        origin: 'assistente',
      });
      return { proposal: toProposal(updated[0]) };
    }
  }
}

async function findProposal(tx: Tx, farmId: string, proposalId: string) {
  const rows = await tx
    .select({ proposal: assistantProposals })
    .from(assistantProposals)
    .innerJoin(assistantCaptures, eq(assistantProposals.captureId, assistantCaptures.id))
    .where(and(eq(assistantProposals.id, proposalId), eq(assistantCaptures.farmId, farmId)))
    .limit(1);
  return rows[0]?.proposal ?? null;
}

type ConfirmAssistantAction = Extract<CommandAction, { type: 'ConfirmAssistantProposal' }>;
type AssistantProposalRow = typeof assistantProposals.$inferSelect;

type AssistantMaterialization = {
  facts: number;
  recordIds: string[];
  summary: string;
};

function normalizeAssistantLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function reviewedValue(fields: ProposalField[], key: string) {
  return fields.find((field) => field.key === key)?.value.trim() ?? '';
}

function reviewedNumber(value: string) {
  const normalized = value.trim().replace(/\s/g, '');
  if (!/^\d+(?:[,.]\d+)?$/.test(normalized)) return null;
  const numeric = Number(normalized.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function reviewedDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function reviewedTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function reviewedMilkingShift(value: string) {
  const normalized = normalizeAssistantLabel(value);
  return normalized === 'manha'
    ? 'manha'
    : normalized === 'tarde'
      ? 'tarde'
      : normalized === 'unica' || normalized === 'ordenha unica'
        ? 'unica'
        : null;
}

/**
 * Materializa uma Proposta inteira dentro da transação da Confirmação.
 * Nenhum comando HTTP intermediário é usado: qualquer falha lança antes do
 * commit e desfaz sessão, linhas, fatos e a própria confirmação em conjunto.
 */
async function materializeAssistantProposal(
  tx: Tx,
  ctx: AuthContext,
  proposal: AssistantProposalRow,
  fields: ProposalField[],
  bindings?: ConfirmAssistantAction['bindings'],
): Promise<AssistantMaterialization> {
  const farmId = ctx.farm.id;
  const recordIds: string[] = [];
  const origin: FactOrigin = 'assistente';

  if (proposal.kind === 'producao_diaria') {
    const date = reviewedDate(reviewedValue(fields, 'date'));
    const liters = reviewedNumber(reviewedValue(fields, 'liters'));
    if (!date || liters === null || liters <= 0) {
      throw badRequest('INVALID_PROPOSAL', 'Confira a data e o volume da Produção diária.');
    }
    const duplicate = await tx
      .select({ id: dailyMilkProductions.id })
      .from(dailyMilkProductions)
      .where(and(eq(dailyMilkProductions.farmId, farmId), eq(dailyMilkProductions.date, date)))
      .limit(1);
    if (duplicate.length > 0) {
      throw conflict('DUPLICATE_PRODUCTION_DATE', `Já existe produção diária registrada para ${date}. Use Correção para ajustar o valor.`);
    }
    const inserted = await tx
      .insert(dailyMilkProductions)
      .values({ id: uid('pd'), farmId, date, liters, origin })
      .returning();
    recordIds.push(inserted[0].id);
    await audit(tx, ctx, {
      action: 'registro',
      entityType: 'producao_diaria',
      entityId: inserted[0].id,
      description: `Produção diária de ${date} registrada`,
      origin,
    });
    return { facts: 1, recordIds, summary: `Produção diária registrada — ${liters.toFixed(1).replace('.', ',')} L` };
  }

  if (proposal.kind === 'coleta') {
    const date = reviewedDate(reviewedValue(fields, 'date'));
    const time = reviewedTime(reviewedValue(fields, 'time'));
    const liters = reviewedNumber(reviewedValue(fields, 'liters'));
    if (!date || !time || liters === null || liters <= 0) {
      throw badRequest('INVALID_PROPOSAL', 'Confira data, horário e volume da Coleta.');
    }
    const inserted = await tx
      .insert(milkCollections)
      .values({ id: uid('col'), farmId, date, time, liters, origin })
      .returning();
    recordIds.push(inserted[0].id);
    await audit(tx, ctx, {
      action: 'registro',
      entityType: 'coleta',
      entityId: inserted[0].id,
      description: `Coleta de ${date} às ${time} registrada`,
      origin,
    });
    return { facts: 1, recordIds, summary: `Coleta registrada — ${liters.toFixed(1).replace('.', ',')} L às ${time}` };
  }

  if (proposal.kind === 'lancamento_financeiro') {
    const date = reviewedDate(reviewedValue(fields, 'date'));
    const amount = reviewedNumber(reviewedValue(fields, 'amount'));
    const kindValue = normalizeAssistantLabel(reviewedValue(fields, 'kind'));
    const kind = kindValue === 'receita' ? 'receita' : kindValue === 'despesa' ? 'despesa' : null;
    const description = reviewedValue(fields, 'description') || proposal.title;
    if (!date || amount === null || amount <= 0 || !kind) {
      throw badRequest('INVALID_PROPOSAL', 'Confira data, natureza e valor do lançamento financeiro.');
    }
    const amountCents = Math.round(amount * 100);
    const inserted = await tx
      .insert(financialEntries)
      .values({
        id: uid('fin'),
        farmId,
        kind,
        description,
        amountCents,
        date,
        dueDate: reviewedDate(reviewedValue(fields, 'dueDate')),
        settledAt: null,
        origin,
      })
      .returning();
    recordIds.push(inserted[0].id);
    await audit(tx, ctx, {
      action: 'registro',
      entityType: 'lancamento_financeiro',
      entityId: inserted[0].id,
      description: `${kind === 'receita' ? 'Receita' : 'Despesa'} registrada`,
      origin,
    });
    return { facts: 1, recordIds, summary: `Lançamento registrado — R$ ${(amountCents / 100).toFixed(2).replace('.', ',')}` };
  }

  if (proposal.kind === 'trato') {
    const groupName = normalizeAssistantLabel(reviewedValue(fields, 'group'));
    const date = reviewedDate(reviewedValue(fields, 'date'));
    const group = (await tx.select().from(herdGroups).where(eq(herdGroups.farmId, farmId)))
      .find((candidate) => normalizeAssistantLabel(candidate.name) === groupName);
    const rawItems = reviewedValue(fields, 'items');
    const feedRows = await tx.select().from(feedItems).where(eq(feedItems.farmId, farmId));
    const items: { itemId: string; quantity: number }[] = [];
    for (const part of rawItems.split('·').map((line) => line.trim()).filter(Boolean)) {
      const normalized = normalizeAssistantLabel(part);
      const item = [...feedRows]
        .sort((left, right) => right.name.length - left.name.length)
        .find((candidate) => {
          const name = normalizeAssistantLabel(candidate.name);
          return normalized === name || normalized.startsWith(`${name} `);
        });
      const quantity = reviewedNumber((part.match(/[\d]+(?:[,.][\d]+)?/) ?? [''])[0]);
      if (!item || quantity === null || quantity <= 0) {
        throw badRequest('INVALID_PROPOSAL', 'Confira Lote, data, alimentos e quantidades do Trato.');
      }
      items.push({ itemId: item.id, quantity });
    }
    if (!group || !date || items.length === 0) {
      throw badRequest('INVALID_PROPOSAL', 'Confira Lote, data, alimentos e quantidades do Trato.');
    }
    const inserted = await tx
      .insert(feedingEvents)
      .values({ id: uid('fv'), farmId, groupId: group.id, date, origin })
      .returning();
    await tx.insert(feedingEventItems).values(items.map((item) => ({
      id: uid('fi'),
      eventId: inserted[0].id,
      itemId: item.itemId,
      quantity: item.quantity,
    })));
    recordIds.push(inserted[0].id);
    await audit(tx, ctx, {
      action: 'registro',
      entityType: 'trato',
      entityId: inserted[0].id,
      description: 'Trato registrado',
      origin,
    });
    return { facts: 1, recordIds, summary: `Trato registrado — ${group.name}` };
  }

  if (proposal.kind === 'controle_leiteiro') {
    const date = reviewedDate(reviewedValue(fields, 'date'));
    const groupName = normalizeAssistantLabel(reviewedValue(fields, 'group'));
    const group = (await tx.select().from(herdGroups).where(eq(herdGroups.farmId, farmId)))
      .find((candidate) => normalizeAssistantLabel(candidate.name) === groupName);
    const reviewedShift = reviewedValue(fields, 'shift');
    // Em Lote de uma ordenha, "única" é o único turno permitido (D-020).
    // Aceitar o vazio corrige Revisões abertas pela UI antiga, que mostrava a
    // primeira opção do select sem gravá-la no estado.
    const shift = reviewedMilkingShift(reviewedShift) ??
      (reviewedShift === '' && group?.milkingsPerDay === 1 ? 'unica' : null);
    const rows = bindings ?? [];
    if (!date || !group || !shift || rows.length === 0) {
      throw badRequest('INVALID_PROPOSAL', 'Confira data, Lote, turno e medições do Controle leiteiro.');
    }
    if ((group.milkingsPerDay === 1 && shift !== 'unica') || (group.milkingsPerDay === 2 && shift === 'unica')) {
      throw badRequest('INVALID_SHIFT', `${group.name} não permite o turno escolhido.`);
    }
    if (rows.some((row) => !isIndividualMilkLiters(row.liters))) {
      throw badRequest('INVALID_MEASUREMENT', 'As medições individuais devem estar entre 0 e 100 L.');
    }
    const animalsById = new Map<string, { id: string; name: string }>();
    const movedAssignmentIds: string[] = [];
    for (const row of rows) {
      const animal = await findAnimal(tx, farmId, row.animalId);
      if (!animal) throw notFound('ANIMAL_NOT_FOUND', `Animal ${row.animalId} não encontrado.`);
      if (animal.status !== 'ativo') {
        throw conflict('ANIMAL_ARCHIVED', `${animal.name} está arquivado e não pode receber nova Medição.`);
      }
      animalsById.set(row.animalId, animal);
    }
    const rowsByAnimal = new Map<string, typeof rows>();
    rows.forEach((row) => {
      rowsByAnimal.set(row.animalId, [...(rowsByAnimal.get(row.animalId) ?? []), row]);
    });
    const duplicateMeasurements = [...rowsByAnimal.entries()]
      .filter(([, occurrences]) => occurrences.length > 1)
      .map(([animalId, occurrences]) => ({
        animal_id: animalId,
        animal_name: animalsById.get(animalId)?.name ?? 'Animal desconhecido',
        occurrences: occurrences.map((row) => ({
          source_label: row.sourceLabel ?? null,
          liters: row.liters,
          position: rows.indexOf(row) + 1,
        })),
      }));
    if (duplicateMeasurements.length > 0) {
      const duplicateSummary = duplicateMeasurements.map((duplicate) =>
        `${duplicate.animal_name}: ${duplicate.occurrences.map((occurrence) =>
          `linha ${occurrence.position}${occurrence.source_label ? ` “${occurrence.source_label}”` : ''} (${occurrence.liters} L)`,
        ).join(' e ')}`,
      ).join('; ');
      throw badRequest(
        'DUPLICATE_MEASUREMENT',
        `O mesmo Animal aparece em mais de uma linha: ${duplicateSummary}. Corrija o vínculo ou descarte a linha duplicada.`,
        {
          domain: 'controle_leiteiro',
          inconsistency: 'duplicate_animal_measurement',
          farm_id: farmId,
          proposal_id: proposal.id,
          date,
          group_id: group.id,
          group_name: group.name,
          shift,
          duplicate_animal_ids: duplicateMeasurements.map((item) => item.animal_id).join(','),
          duplicate_animal_names: duplicateMeasurements.map((item) => item.animal_name).join(','),
          duplicate_measurements: duplicateMeasurements,
        },
      );
    }
    // Ordem estável evita deadlock quando duas Propostas contêm os mesmos
    // Animais em ordens diferentes.
    for (const animalId of [...animalsById.keys()].sort()) {
      await lockAnimalAssignments(tx, farmId, animalId);
    }
    for (const row of rows) {
      const animal = animalsById.get(row.animalId)!;
      const assignments = await assignmentsAtDate(tx, animal.id, date);
      if (assignments.length > 1) {
        throw conflict('ASSIGNMENT_OVERLAP', `${animal.name} possui Lotação sobreposta em ${date}. Corrija o histórico antes de confirmar o Controle.`);
      }
      const assignment = assignments[0] ?? null;
      const assignmentMatchesControlGroup = assignment?.groupId === group.id;
      if (assignmentMatchesControlGroup && row.assignmentAction) {
        throw badRequest(
          'UNNECESSARY_ASSIGNMENT_DECISION',
          `${animal.name} já estava lotada em ${group.name} em ${date}.`,
        );
      }
      if (!assignmentMatchesControlGroup && !row.assignmentAction) {
        throw badRequest(
          'ASSIGNMENT_DECISION_REQUIRED',
          `${animal.name} não estava lotada em ${group.name} em ${date}. Escolha manter somente a medição ou mover a Lotação.`,
        );
      }
      if (!assignmentMatchesControlGroup && row.assignmentAction === 'move') {
        const moved = await moveAnimalForAssistantControl(tx, ctx, animal, group, date, assignment);
        if (moved.changed) movedAssignmentIds.push(moved.assignment.id);
      }
      if (!assignmentMatchesControlGroup && row.assignmentAction === 'keep') {
        await audit(tx, ctx, {
          action: 'confirmacao',
          entityType: 'lotacao',
          entityId: assignment?.id ?? animal.id,
          description: `Lotação mantida na divergência do Controle (${animal.name}, ${group.name}, ${date})`,
          origin: 'assistente',
        });
      }
    }
    const existing = (await tx
      .select()
      .from(milkControlSessions)
      .where(and(
        eq(milkControlSessions.farmId, farmId),
        eq(milkControlSessions.groupId, group.id),
        eq(milkControlSessions.date, date),
        eq(milkControlSessions.shift, shift),
      ))
      .limit(1))[0];
    const sessionId = existing?.id ?? uid('cs');
    // Uma confirmação posterior pode preencher uma lacuna de um Controle já
    // concluído; nesse caso preservamos o estado e auditamos apenas a Medição.
    const shouldCompleteSession = !existing || existing.status !== 'concluido';
    if (!existing) {
      await tx.insert(milkControlSessions).values({
        id: sessionId,
        farmId,
        date,
        groupId: group.id,
        shift,
        status: 'em_andamento',
        origin,
      });
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'controle_leiteiro',
        entityId: sessionId,
        description: `Controle leiteiro iniciado (${group.name}, ${date}, ${shift})`,
        origin,
      });
    }
    for (const row of rows) {
      const duplicate = await tx
        .select({ id: individualMilkMeasurements.id })
        .from(individualMilkMeasurements)
        .where(and(eq(individualMilkMeasurements.sessionId, sessionId), eq(individualMilkMeasurements.animalId, row.animalId)))
        .limit(1);
      if (duplicate.length > 0) {
        throw conflict('MEASUREMENT_EXISTS', `Já existe medição de ${animalsById.get(row.animalId)?.name ?? row.animalId} neste Controle leiteiro. O Registro existente não será sobrescrito automaticamente.`);
      }
      const inserted = await tx
        .insert(individualMilkMeasurements)
        .values({ id: uid('mm'), sessionId, animalId: row.animalId, liters: row.liters })
        .returning();
      recordIds.push(inserted[0].id);
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'medicao_individual',
        entityId: inserted[0].id,
        description: `Medição individual registrada (${animalsById.get(row.animalId)?.name ?? row.animalId}: ${row.liters.toFixed(1).replace('.', ',')} L)`,
        origin,
      });
    }
    if (shouldCompleteSession) {
      await tx.update(milkControlSessions).set({ status: 'concluido' }).where(eq(milkControlSessions.id, sessionId));
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'controle_leiteiro',
        entityId: sessionId,
        description: 'Controle leiteiro concluído',
        origin,
      });
    }
    return {
      facts: rows.length + (existing ? 0 : 1) + movedAssignmentIds.length,
      recordIds: [...(existing ? [] : [sessionId]), ...recordIds, ...movedAssignmentIds],
      summary: `${rows.length} ${rows.length === 1 ? 'medição registrada' : 'medições registradas'} — ${group.name}`,
    };
  }

  throw badRequest('UNSUPPORTED_PROPOSAL', 'Esta Proposta não corresponde a um Registro suportado.');
}
