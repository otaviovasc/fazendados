import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/client.js';
import {
  animalGroupAssignments,
  animals,
  assistantCaptures,
  assistantProposals,
  auditEvents,
  dailyMilkProductions,
  feedingEventItems,
  feedingEvents,
  feedEntries,
  feedItems,
  financialEntries,
  herdGroups,
  individualMilkMeasurements,
  installations,
  milkCollections,
  milkControlSessions,
  pastureOccupancies,
  pastures,
} from '../db/schema.js';
import type { FactOrigin } from '../domain/types.js';
import { uid } from '../lib/prng.js';
import type { AuthContext } from './auth.js';
import { badRequest, conflict, notFound } from './http.js';
import {
  toAnimal,
  toAssignment,
  toCapture,
  toDailyMilkProduction,
  toFeedEntry,
  toFeedingEvent,
  toFeedItem,
  toFinancialEntry,
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
const reason = z.string().trim().min(1, 'motivo é obrigatório');

const proposalInput = z.object({
  kind: z.enum(['producao_diaria', 'controle_leiteiro', 'coleta', 'trato', 'lancamento_financeiro']),
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

/**
 * Correção de fato operacional (producao_diaria | coleta) — substitui o
 * `apply(s)` do protótipo. `reason` é obrigatório; `before`/`after`/`description`
 * são as strings de exibição gravadas na auditoria.
 */
const correctionSchema = z.object({
  type: z.literal('CorrectOperationalFact'),
  entityType: z.enum(['producao_diaria', 'coleta']),
  entityId: z.string().min(1),
  newLiters: liters,
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
    liters: z.number().nonnegative(),
  }),
  z.object({ type: z.literal('CompleteMilkControlSession'), sessionId: z.string().min(1) }),
  z.object({ type: z.literal('RecordMilkCollection'), date: isoDate, time, liters }),
  correctionSchema,
  z.object({
    type: z.literal('RegisterAnimal'),
    name: z.string().trim().min(1),
    tag: z.string().optional(),
    groupId: z.string().optional(),
    date: isoDate,
  }),
  z.object({ type: z.literal('ArchiveAnimal'), animalId: z.string().min(1), reason, date: isoDate }),
  z.object({
    type: z.literal('CreateHerdGroup'),
    name: z.string().trim().min(1),
    milkingsPerDay: z.union([z.literal(1), z.literal(2)]),
  }),
  z.object({ type: z.literal('AssignAnimalToGroup'), animalId: z.string().min(1), groupId: z.string().min(1), date: isoDate }),
  z.object({ type: z.literal('RegisterPasture'), name: z.string().trim().min(1), polygon: z.array(latLng).min(3) }),
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
  z.object({ type: z.literal('CreateAssistantCapture'), text: z.string().min(1), proposal: proposalInput }),
  z.object({
    type: z.literal('ConfirmAssistantProposal'),
    proposalId: z.string().min(1),
    /** Ids dos fatos criados pela materialização (mesmos comandos manuais). */
    recordIds: z.array(z.string()).optional(),
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
      const session = (
        await tx.select().from(milkControlSessions).where(and(eq(milkControlSessions.id, a.sessionId), eq(milkControlSessions.farmId, farmId))).limit(1)
      )[0];
      if (!session) throw notFound('SESSION_NOT_FOUND', `Sessão de controle ${a.sessionId} não encontrada.`);
      if (session.status !== 'em_andamento') throw conflict('SESSION_CLOSED', 'O controle leiteiro já está concluído.');
      const animal = await findAnimal(tx, farmId, a.animalId);
      if (!animal) throw notFound('ANIMAL_NOT_FOUND', `Animal ${a.animalId} não encontrado.`);
      // Upsert: 1 medição por animal por sessão (repetição corrige o valor).
      const inserted = await tx
        .insert(individualMilkMeasurements)
        .values({ id: uid('mm'), sessionId: a.sessionId, animalId: a.animalId, liters: a.liters })
        .onConflictDoUpdate({
          target: [individualMilkMeasurements.sessionId, individualMilkMeasurements.animalId],
          set: { liters: a.liters },
        })
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
        const current = (
          await tx.select().from(dailyMilkProductions).where(and(eq(dailyMilkProductions.id, a.entityId), eq(dailyMilkProductions.farmId, farmId))).limit(1)
        )[0];
        if (!current) throw notFound('FACT_NOT_FOUND', `Produção diária ${a.entityId} não encontrada.`);
        const updated = await tx.update(dailyMilkProductions).set({ liters: a.newLiters }).where(eq(dailyMilkProductions.id, a.entityId)).returning();
        result = { production: toDailyMilkProduction(updated[0]) };
      } else {
        const current = (
          await tx.select().from(milkCollections).where(and(eq(milkCollections.id, a.entityId), eq(milkCollections.farmId, farmId))).limit(1)
        )[0];
        if (!current) throw notFound('FACT_NOT_FOUND', `Coleta ${a.entityId} não encontrada.`);
        const updated = await tx.update(milkCollections).set({ liters: a.newLiters }).where(eq(milkCollections.id, a.entityId)).returning();
        result = { collection: toMilkCollection(updated[0]) };
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
      const open = (
        await tx
          .select()
          .from(animalGroupAssignments)
          .where(and(eq(animalGroupAssignments.animalId, a.animalId), isNull(animalGroupAssignments.end)))
          .limit(1)
      )[0];
      if (open?.groupId === a.groupId) throw conflict('SAME_GROUP', `${animal.name} já está no ${group.name}.`);
      // Fecha a lotação aberta e abre a nova — atomicamente.
      if (open) await tx.update(animalGroupAssignments).set({ end: a.date }).where(eq(animalGroupAssignments.id, open.id));
      const inserted = await tx
        .insert(animalGroupAssignments)
        .values({ id: uid('as'), animalId: a.animalId, groupId: a.groupId, start: a.date, end: null })
        .returning();
      await audit(tx, ctx, {
        action: 'movimentacao',
        entityType: 'animal',
        entityId: a.animalId,
        description: `Lotação alterada (${animal.name} → ${group.name})`,
        origin: 'manual',
      });
      return { assignment: toAssignment(inserted[0]), closedAssignmentId: open?.id ?? null };
    }

    case 'RegisterPasture': {
      const inserted = await tx.insert(pastures).values({ id: uid('p'), farmId, name: a.name, polygon: a.polygon }).returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'pasto',
        entityId: inserted[0].id,
        description: `Pasto ${inserted[0].name} cadastrado`,
        origin: 'manual',
      });
      return { pasture: toPasture(inserted[0]) };
    }

    case 'UpdatePasture': {
      const pasture = (
        await tx.select().from(pastures).where(and(eq(pastures.id, a.pastureId), eq(pastures.farmId, farmId))).limit(1)
      )[0];
      if (!pasture) throw notFound('PASTURE_NOT_FOUND', `Pasto ${a.pastureId} não encontrado.`);
      const updated = await tx.update(pastures).set({ name: a.name, polygon: a.polygon }).where(eq(pastures.id, a.pastureId)).returning();
      await audit(tx, ctx, {
        action: 'correcao',
        entityType: 'pasto',
        entityId: a.pastureId,
        description: `Pasto ${a.name} atualizado`,
        origin: 'manual',
      });
      return { pasture: toPasture(updated[0]) };
    }

    case 'RegisterInstallation': {
      const inserted = await tx
        .insert(installations)
        .values({ id: uid('i'), farmId, name: a.name, type: a.instType, point: a.point })
        .returning();
      await audit(tx, ctx, {
        action: 'registro',
        entityType: 'instalacao',
        entityId: inserted[0].id,
        description: `Instalação ${inserted[0].name} cadastrada`,
        origin: 'manual',
      });
      return { installation: toInstallation(inserted[0]) };
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
      const proposal = (
        await tx
          .insert(assistantProposals)
          .values({
            id: uid('prop'),
            captureId: capture.id,
            kind: a.proposal.kind,
            title: a.proposal.title,
            fields: a.proposal.fields,
            consequences: a.proposal.consequences,
            issues: a.proposal.issues,
            status: 'pendente',
            dismissReason: a.proposal.dismissReason ?? null,
            confirmedRecordIds: [],
          })
          .returning()
      )[0];
      await audit(tx, ctx, {
        action: 'captura',
        entityType: 'proposta',
        entityId: proposal.id,
        description: `Captura do Assistente registrada ("${proposal.title}")`,
        origin: 'assistente',
      });
      return { capture: toCapture(capture), proposal: toProposal(proposal) };
    }

    case 'ConfirmAssistantProposal': {
      const proposal = await findProposal(tx, farmId, a.proposalId);
      if (!proposal) throw notFound('PROPOSAL_NOT_FOUND', `Proposta ${a.proposalId} não encontrada.`);
      if (proposal.status !== 'pendente') return { proposal: toProposal(proposal) }; // idempotente
      const updated = await tx
        .update(assistantProposals)
        .set({
          status: 'confirmada',
          confirmedRecordIds: a.recordIds ?? proposal.confirmedRecordIds,
        })
        .where(eq(assistantProposals.id, a.proposalId))
        .returning();
      await audit(tx, ctx, {
        action: 'confirmacao',
        entityType: 'proposta',
        entityId: proposal.id,
        description: `Proposta "${proposal.title}" confirmada`,
        origin: 'assistente',
      });
      return { proposal: toProposal(updated[0]) };
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
