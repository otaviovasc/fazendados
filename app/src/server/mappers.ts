import type {
  Animal,
  AnimalGroupAssignment,
  AnimalStatus,
  AssistantCapture,
  AssistantCaptureAttachment,
  AssistantAttachmentCategory,
  AssistantProposal,
  AuditEvent,
  DailyMilkProduction,
  FactOrigin,
  Farm,
  FarmBoundary,
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
  assistantCaptureAttachments,
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
  farmBoundaries,
} from '../db/schema.js';
import { latLngPointFromGeoJson, latLngPolygonFromGeoJson } from '../db/spatial.js';

// Linha do banco → DTO de domínio com a forma EXATA de src/domain/types.ts.
// Campos opcionais viram `undefined` (chave omitida no JSON), nunca null.

type Row<T> = T extends { $inferSelect: infer R } ? R : never;

export const toFarm = (r: Row<typeof farms>): Farm => ({ id: r.id, name: r.name });

export const toUser = (r: Row<typeof users>): User => ({
  id: r.id,
  name: r.name,
  username: r.username,
  farmId: r.farmId,
});

export const toFarmBoundary = (r: Row<typeof farmBoundaries>): FarmBoundary => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  polygon: latLngPolygonFromGeoJson(r.boundary),
});

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
  polygon: latLngPolygonFromGeoJson(r.polygon),
});

export const toInstallation = (r: Row<typeof installations>): Installation => ({
  id: r.id,
  farmId: r.farmId,
  name: r.name,
  type: r.type,
  point: latLngPointFromGeoJson(r.point),
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

export const toCaptureAttachment = (r: Row<typeof assistantCaptureAttachments>): AssistantCaptureAttachment => ({
  id: r.id,
  farmId: r.farmId,
  captureId: r.captureId,
  sourceAttachmentId: r.sourceAttachmentId ?? undefined,
  kind: r.kind as AssistantCaptureAttachment['kind'],
  name: r.name,
  category: r.category as AssistantAttachmentCategory,
  mimeType: r.mimeType,
  byteSize: r.byteSize,
  durationMs: r.durationMs ?? undefined,
  createdAt: r.createdAt.toISOString(),
  deletedAt: r.deletedAt?.toISOString(),
});

export const toCapture = (
  r: Row<typeof assistantCaptures>,
  attachments?: Row<typeof assistantCaptureAttachments>[],
): AssistantCapture => ({
  id: r.id,
  farmId: r.farmId,
  text: r.text,
  extractedText: r.extractedText,
  attachments: attachments?.map(toCaptureAttachment),
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
