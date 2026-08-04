import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
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
import type { FarmState } from '../domain/types.js';
import {
  toAnimal,
  toAssignment,
  toAuditEvent,
  toCapture,
  toDailyMilkProduction,
  toFarm,
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
  toUser,
} from './mappers.js';

/** Ordenação natural por id (a1, a2, … a10) — reproduz a ordem do gerador de seeds. */
const byNaturalId = <T extends { id: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

/** Snapshot completo do FarmState (GET /api/bootstrap) — forma exata de src/domain/types.ts. */
export async function loadFarmState(db: Db, farmId: string): Promise<FarmState> {
  const farmRow = await db.query.farms.findFirst({ where: (t, { eq: e }) => e(t.id, farmId) });
  const userRow = await db.query.users.findFirst({ where: (t, { eq: e }) => e(t.farmId, farmId) });
  if (!farmRow || !userRow) throw new Error(`Fazenda/usuário não semeados: ${farmId}. Rode pnpm db:seed.`);

  const [
    animalRows,
    groupRows,
    pastureRows,
    installationRows,
    productionRows,
    sessionRows,
    collectionRows,
    feedItemRows,
    feedEntryRows,
    feedingEventRows,
    financialRows,
    captureRows,
    auditRows,
  ] = await Promise.all([
    db.select().from(animals).where(eq(animals.farmId, farmId)).orderBy(asc(animals.id)),
    db.select().from(herdGroups).where(eq(herdGroups.farmId, farmId)).orderBy(asc(herdGroups.id)),
    db.select().from(pastures).where(eq(pastures.farmId, farmId)).orderBy(asc(pastures.id)),
    db.select().from(installations).where(eq(installations.farmId, farmId)).orderBy(asc(installations.id)),
    db.select().from(dailyMilkProductions).where(eq(dailyMilkProductions.farmId, farmId)).orderBy(asc(dailyMilkProductions.date)),
    db.select().from(milkControlSessions).where(eq(milkControlSessions.farmId, farmId)).orderBy(asc(milkControlSessions.date), asc(milkControlSessions.groupId), asc(milkControlSessions.shift)),
    db.select().from(milkCollections).where(eq(milkCollections.farmId, farmId)).orderBy(asc(milkCollections.date)),
    db.select().from(feedItems).where(eq(feedItems.farmId, farmId)).orderBy(asc(feedItems.id)),
    db.select().from(feedEntries).where(eq(feedEntries.farmId, farmId)).orderBy(asc(feedEntries.id)),
    db.select().from(feedingEvents).where(eq(feedingEvents.farmId, farmId)).orderBy(asc(feedingEvents.date), asc(feedingEvents.id)),
    db.select().from(financialEntries).where(eq(financialEntries.farmId, farmId)).orderBy(asc(financialEntries.date), asc(financialEntries.id)),
    db.select().from(assistantCaptures).where(eq(assistantCaptures.farmId, farmId)).orderBy(desc(assistantCaptures.createdAt)),
    db.select().from(auditEvents).where(eq(auditEvents.farmId, farmId)).orderBy(desc(auditEvents.at), desc(auditEvents.id)),
  ]);

  const animalIds = animalRows.map((a) => a.id);
  const groupIds = groupRows.map((g) => g.id);
  const sessionIds = sessionRows.map((s) => s.id);
  const eventIds = feedingEventRows.map((e) => e.id);
  const captureIds = captureRows.map((c) => c.id);

  const [assignmentRows, occupancyRows, measurementRows, feedingItemRows, proposalRows] = await Promise.all([
    animalIds.length
      ? db.select().from(animalGroupAssignments).where(inArray(animalGroupAssignments.animalId, animalIds)).orderBy(asc(animalGroupAssignments.id))
      : [],
    groupIds.length
      ? db.select().from(pastureOccupancies).where(inArray(pastureOccupancies.groupId, groupIds)).orderBy(asc(pastureOccupancies.id))
      : [],
    sessionIds.length
      ? db.select().from(individualMilkMeasurements).where(inArray(individualMilkMeasurements.sessionId, sessionIds)).orderBy(asc(individualMilkMeasurements.id))
      : [],
    eventIds.length
      ? db.select().from(feedingEventItems).where(inArray(feedingEventItems.eventId, eventIds)).orderBy(asc(feedingEventItems.id))
      : [],
    captureIds.length
      ? db.select().from(assistantProposals).where(inArray(assistantProposals.captureId, captureIds)).orderBy(asc(assistantProposals.id))
      : [],
  ]);

  const itemsByEvent = new Map<string, { itemId: string; quantity: number }[]>();
  for (const item of feedingItemRows) {
    const list = itemsByEvent.get(item.eventId) ?? [];
    list.push({ itemId: item.itemId, quantity: item.quantity });
    itemsByEvent.set(item.eventId, list);
  }

  return {
    farm: toFarm(farmRow),
    user: toUser(userRow),
    animals: byNaturalId(animalRows).map(toAnimal),
    groups: byNaturalId(groupRows).map(toHerdGroup),
    assignments: byNaturalId(assignmentRows).map(toAssignment),
    pastures: byNaturalId(pastureRows).map(toPasture),
    installations: byNaturalId(installationRows).map(toInstallation),
    occupancies: byNaturalId(occupancyRows).map(toOccupancy),
    productions: productionRows.map(toDailyMilkProduction),
    sessions: sessionRows.map(toMilkControlSession),
    measurements: byNaturalId(measurementRows).map(toMeasurement),
    collections: collectionRows.map(toMilkCollection),
    feedItems: byNaturalId(feedItemRows).map(toFeedItem),
    feedEntries: byNaturalId(feedEntryRows).map(toFeedEntry),
    feedingEvents: feedingEventRows.map((e) => toFeedingEvent(e, itemsByEvent.get(e.id) ?? [])),
    financialEntries: financialRows.map(toFinancialEntry),
    captures: captureRows.map(toCapture),
    proposals: byNaturalId(proposalRows).map(toProposal),
    audit: auditRows.map(toAuditEvent),
  };
}
