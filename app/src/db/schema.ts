import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  InstallationType,
  LatLng,
  ProposalField,
} from '../domain/types.js';

// ---------------------------------------------------------------------------
// FazenDados — modelo físico V1.
// Uma Fazenda é dona de tudo: toda tabela operacional tem farm_id.
// V1 = um User por Farm (users.farm_id UNIQUE).
//
// NOTA (milestone futuro): pastos/instalações guardam coordenadas como JSONB
// ([lat,lng][] e [lat,lng]). A migração para PostGIS geometry/geography fica
// para um milestone posterior, junto com consultas espaciais.
// ---------------------------------------------------------------------------

export const farms = pgTable('farms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('users_farm_id_unique').on(t.farmId)],
);

/** Sessões de autenticação (cookie httpOnly → token). */
export const authSessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // token opaco
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index('sessions_expires_at_idx').on(t.expiresAt)],
);

// ---------- Rebanho ----------

export const animals = pgTable(
  'animals',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    name: text('name').notNull(),
    tag: text('tag'),
    status: text('status').notNull(), // "ativo" | "arquivado"
    archivedAt: date('archived_at', { mode: 'string' }),
    archiveReason: text('archive_reason'),
  },
  (t) => [index('animals_farm_id_idx').on(t.farmId)],
);

export const herdGroups = pgTable(
  'herd_groups',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    name: text('name').notNull(),
    milkingsPerDay: integer('milkings_per_day').notNull(), // 1 | 2
  },
  (t) => [index('herd_groups_farm_id_idx').on(t.farmId)],
);

/** Lotação: período datado Animal ∈ Lote (máx. 1 aberta por animal — enforced nos comandos). */
export const animalGroupAssignments = pgTable(
  'animal_group_assignments',
  {
    id: text('id').primaryKey(),
    animalId: text('animal_id')
      .notNull()
      .references(() => animals.id),
    groupId: text('group_id')
      .notNull()
      .references(() => herdGroups.id),
    start: date('start', { mode: 'string' }).notNull(),
    end: date('end', { mode: 'string' }),
  },
  (t) => [
    index('assignments_animal_open_idx').on(t.animalId, t.end),
    index('assignments_group_open_idx').on(t.groupId, t.end),
  ],
);

// ---------- Espaço ----------

export const pastures = pgTable(
  'pastures',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    name: text('name').notNull(),
    // PostGIS geometry em milestone futuro; por ora JSONB [lat,lng][].
    polygon: jsonb('polygon').$type<LatLng[]>().notNull(),
  },
  (t) => [index('pastures_farm_id_idx').on(t.farmId)],
);

export const installations = pgTable(
  'installations',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    name: text('name').notNull(),
    type: text('type').$type<InstallationType>().notNull(),
    point: jsonb('point').$type<LatLng>().notNull(),
  },
  (t) => [index('installations_farm_id_idx').on(t.farmId)],
);

/** Ocupação de pasto: Lote ∈ Pasto datado (1 Lote por Pasto por vez — enforced nos comandos). */
export const pastureOccupancies = pgTable(
  'pasture_occupancies',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => herdGroups.id),
    pastureId: text('pasture_id')
      .notNull()
      .references(() => pastures.id),
    start: date('start', { mode: 'string' }).notNull(),
    end: date('end', { mode: 'string' }),
  },
  (t) => [
    index('occupancies_group_open_idx').on(t.groupId, t.end),
    index('occupancies_pasture_open_idx').on(t.pastureId, t.end),
  ],
);

// ---------- Leite ----------

/** Produção diária: UM valor por dia, escopo Fazenda. Ausência ≠ zero. */
export const dailyMilkProductions = pgTable(
  'daily_milk_productions',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    date: date('date', { mode: 'string' }).notNull(),
    liters: numeric('liters', { precision: 10, scale: 1, mode: 'number' }).notNull(),
    origin: text('origin').notNull(), // "manual" | "assistente"
  },
  (t) => [uniqueIndex('daily_milk_productions_farm_date_unique').on(t.farmId, t.date)],
);

/** Controle leiteiro: 1 sessão = 1 Lote + 1 data + 1 turno. */
export const milkControlSessions = pgTable(
  'milk_control_sessions',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    date: date('date', { mode: 'string' }).notNull(),
    groupId: text('group_id')
      .notNull()
      .references(() => herdGroups.id),
    shift: text('shift').notNull(), // "manha" | "tarde" | "unica"
    status: text('status').notNull(), // "em_andamento" | "concluido"
    origin: text('origin').notNull(),
  },
  (t) => [
    uniqueIndex('milk_control_sessions_group_date_shift_unique').on(t.groupId, t.date, t.shift),
    index('milk_control_sessions_farm_date_idx').on(t.farmId, t.date),
  ],
);

export const individualMilkMeasurements = pgTable(
  'individual_milk_measurements',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => milkControlSessions.id),
    animalId: text('animal_id')
      .notNull()
      .references(() => animals.id),
    liters: numeric('liters', { precision: 6, scale: 1, mode: 'number' }).notNull(),
  },
  (t) => [
    uniqueIndex('individual_milk_measurements_session_animal_unique').on(t.sessionId, t.animalId),
    index('individual_milk_measurements_animal_idx').on(t.animalId),
  ],
);

export const milkCollections = pgTable(
  'milk_collections',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    date: date('date', { mode: 'string' }).notNull(),
    time: text('time').notNull(), // "10:40"
    liters: numeric('liters', { precision: 10, scale: 1, mode: 'number' }).notNull(),
    origin: text('origin').notNull(),
  },
  (t) => [index('milk_collections_farm_date_idx').on(t.farmId, t.date)],
);

// ---------- Alimentação ----------

export const feedItems = pgTable(
  'feed_items',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
  },
  (t) => [index('feed_items_farm_id_idx').on(t.farmId)],
);

export const feedEntries = pgTable(
  'feed_entries',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    itemId: text('item_id')
      .notNull()
      .references(() => feedItems.id),
    date: date('date', { mode: 'string' }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 1, mode: 'number' }).notNull(),
    origin: text('origin').notNull(), // "compra", "estoque inicial", "ajuste" (string livre)
    note: text('note'),
  },
  (t) => [index('feed_entries_farm_item_idx').on(t.farmId, t.itemId)],
);

export const feedingEvents = pgTable(
  'feeding_events',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    groupId: text('group_id')
      .notNull()
      .references(() => herdGroups.id),
    date: date('date', { mode: 'string' }).notNull(),
    origin: text('origin').notNull(),
  },
  (t) => [index('feeding_events_farm_date_idx').on(t.farmId, t.date)],
);

/** Itens do trato (tabela filha — mais limpa que JSONB para consultas de saldo). */
export const feedingEventItems = pgTable(
  'feeding_event_items',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => feedingEvents.id),
    itemId: text('item_id')
      .notNull()
      .references(() => feedItems.id),
    quantity: numeric('quantity', { precision: 12, scale: 1, mode: 'number' }).notNull(),
  },
  (t) => [index('feeding_event_items_event_idx').on(t.eventId), index('feeding_event_items_item_idx').on(t.itemId)],
);

// ---------- Financeiro ----------

export const financialEntries = pgTable(
  'financial_entries',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    kind: text('kind').notNull(), // "receita" | "despesa"
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    date: date('date', { mode: 'string' }).notNull(), // competência
    dueDate: date('due_date', { mode: 'string' }),
    settledAt: date('settled_at', { mode: 'string' }), // liquidação (null = em aberto)
    origin: text('origin').notNull(),
  },
  (t) => [index('financial_entries_farm_date_idx').on(t.farmId, t.date)],
);

// ---------- Assistente ----------

export const assistantCaptures = pgTable(
  'assistant_captures',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index('assistant_captures_farm_idx').on(t.farmId)],
);

export const assistantProposals = pgTable(
  'assistant_proposals',
  {
    id: text('id').primaryKey(),
    captureId: text('capture_id')
      .notNull()
      .references(() => assistantCaptures.id),
    kind: text('kind').notNull(), // ProposalKind
    title: text('title').notNull(),
    fields: jsonb('fields').$type<ProposalField[]>().notNull(),
    consequences: jsonb('consequences').$type<string[]>().notNull(),
    issues: jsonb('issues').$type<string[]>().notNull(),
    status: text('status').notNull(), // "pendente" | "confirmada" | "descartada"
    dismissReason: text('dismiss_reason'),
    confirmedRecordIds: jsonb('confirmed_record_ids').$type<string[]>().notNull(),
  },
  (t) => [index('assistant_proposals_status_idx').on(t.status)],
);

// ---------- Auditoria ----------

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(), // "registro", "correcao", "liquidacao", ...
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    description: text('description').notNull(),
    before: text('before'),
    after: text('after'),
    reason: text('reason'),
    origin: text('origin').notNull(),
  },
  (t) => [index('audit_events_farm_at_idx').on(t.farmId, t.at)],
);

// ---------- Idempotência ----------

/**
 * POST /api/commands: mesma key + mesmo payload → mesmo resultado;
 * mesma key + payload diferente → 409.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    farmId: text('farm_id')
      .notNull()
      .references(() => farms.id),
    key: text('key').notNull(),
    payload: jsonb('payload').notNull(), // action (objeto; comparação via forma canônica)
    response: jsonb('response').notNull(), // resultado do comando
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.farmId, t.key] })],
);
