import type {
  Animal,
  AnimalGroupAssignment,
  AnimalStatus,
  AssistantCapture,
  AssistantProposal,
  AuditEvent,
  DailyMilkProduction,
  FactOrigin,
  Farm,
  FeedingEvent,
  FeedEntry,
  FeedItem,
  FinancialEntry,
  FinancialKind,
  HerdGroup,
  IndividualMilkMeasurement,
  Installation,
  MilkCollection,
  MilkControlSession,
  MilkingShift,
  Pasture,
  PastureOccupancy,
  ProposalKind,
  ProposalStatus,
  User,
} from '../domain/types.js';
import type {
  animalGroupAssignments,
  animals,
  assistantCaptures,
  assistantProposals,
  auditEvents,
  dailyMilkProductions,
  farms,
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
  users,
} from '../db/schema.js';

// Linha do banco → DTO de domínio com a forma EXATA de src/domain/types.ts.
// Campos opcionais viram `undefined` (chave omitida no JSON), nunca null.

type Row<T> = T extends { $inferSelect: infer R } ? R : never;

export const toFarm = (r: Row<typeof farms>): Farm => ({ id: r.id, name: r.name });

export const toUser = (r: Row<typeof users>): User => ({ id: r.id, name: r.name, farmId: r.farmId });

export const toAnimal = (r: Row<typeof animals>): Animal => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  tag: r.tag ?? undefined,
  status: r.status as AnimalStatus,
  archivedAt: r.archivedAt ?? undefined,
  archiveReason: r.archiveReason ?? undefined,
});

export const toHerdGroup = (r: Row<typeof herdGroups>): HerdGroup => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  milkingsPerDay: r.milkingsPerDay as 1 | 2,
});

export const toAssignment = (r: Row<typeof animalGroupAssignments>): AnimalGroupAssignment => ({
  id: r.id,
  animalId: r.animalId,
  groupId: r.groupId,
  start: r.start,
  end: r.end,
});

export const toPasture = (r: Row<typeof pastures>): Pasture => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  polygon: r.polygon,
});

export const toInstallation = (r: Row<typeof installations>): Installation => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  type: r.type,
  point: r.point,
});

export const toOccupancy = (r: Row<typeof pastureOccupancies>): PastureOccupancy => ({
  id: r.id,
  groupId: r.groupId,
  pastureId: r.pastureId,
  start: r.start,
  end: r.end,
});

export const toDailyMilkProduction = (r: Row<typeof dailyMilkProductions>): DailyMilkProduction => ({
  id: r.id,
  farmId: r.farmId,
  date: r.date,
  liters: r.liters,
  origin: r.origin as FactOrigin,
});

export const toMilkControlSession = (r: Row<typeof milkControlSessions>): MilkControlSession => ({
  id: r.id,
  farmId: r.farmId,
  date: r.date,
  groupId: r.groupId,
  shift: r.shift as MilkingShift,
  status: r.status as MilkControlSession['status'],
  origin: r.origin as FactOrigin,
});

export const toMeasurement = (r: Row<typeof individualMilkMeasurements>): IndividualMilkMeasurement => ({
  id: r.id,
  sessionId: r.sessionId,
  animalId: r.animalId,
  liters: r.liters,
});

export const toMilkCollection = (r: Row<typeof milkCollections>): MilkCollection => ({
  id: r.id,
  farmId: r.farmId,
  date: r.date,
  time: r.time,
  liters: r.liters,
  origin: r.origin as FactOrigin,
});

export const toFeedItem = (r: Row<typeof feedItems>): FeedItem => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  unit: r.unit,
});

export const toFeedEntry = (r: Row<typeof feedEntries>): FeedEntry => ({
  id: r.id,
  farmId: r.farmId,
  itemId: r.itemId,
  date: r.date,
  quantity: r.quantity,
  origin: r.origin,
  note: r.note ?? undefined,
});

export const toFeedingEvent = (
  r: Row<typeof feedingEvents>,
  items: { itemId: string; quantity: number }[],
): FeedingEvent => ({
  id: r.id,
  farmId: r.farmId,
  groupId: r.groupId,
  date: r.date,
  items,
  origin: r.origin as FactOrigin,
});

export const toFinancialEntry = (r: Row<typeof financialEntries>): FinancialEntry => ({
  id: r.id,
  farmId: r.farmId,
  kind: r.kind as FinancialKind,
  description: r.description,
  amountCents: r.amountCents,
  date: r.date,
  dueDate: r.dueDate ?? undefined,
  settledAt: r.settledAt,
  origin: r.origin as FactOrigin,
});

export const toCapture = (r: Row<typeof assistantCaptures>): AssistantCapture => ({
  id: r.id,
  farmId: r.farmId,
  text: r.text,
  createdAt: r.createdAt.toISOString(),
});

export const toProposal = (r: Row<typeof assistantProposals>): AssistantProposal => ({
  id: r.id,
  captureId: r.captureId,
  kind: r.kind as ProposalKind,
  title: r.title,
  fields: r.fields,
  consequences: r.consequences,
  issues: r.issues,
  status: r.status as ProposalStatus,
  dismissReason: r.dismissReason ?? undefined,
  confirmedRecordIds: r.confirmedRecordIds,
});

export const toAuditEvent = (r: Row<typeof auditEvents>): AuditEvent => ({
  id: r.id,
  at: r.at.toISOString(),
  actor: r.actor,
  action: r.action,
  entityType: r.entityType,
  entityId: r.entityId,
  description: r.description,
  before: r.before ?? undefined,
  after: r.after ?? undefined,
  reason: r.reason ?? undefined,
  origin: r.origin as FactOrigin,
});
