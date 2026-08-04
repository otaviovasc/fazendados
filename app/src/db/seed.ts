import { inArray, eq } from 'drizzle-orm';
import { closeDb, getDb } from './client.js';
import {
  animalGroupAssignments,
  animals,
  assistantCaptures,
  assistantProposals,
  auditEvents,
  authSessions,
  dailyMilkProductions,
  farms,
  feedingEventItems,
  feedingEvents,
  feedEntries,
  feedItems,
  financialEntries,
  herdGroups,
  idempotencyKeys,
  individualMilkMeasurements,
  installations,
  milkCollections,
  milkControlSessions,
  pastureOccupancies,
  pastures,
  users,
} from './schema.js';
import { addDays, lastNDays, today } from '../lib/dates.js';
import { mulberry32 } from '../lib/prng.js';
import type { LatLng } from '../domain/types.js';

// ---------------------------------------------------------------------------
// Seed determinístico e reexecutável — replica o caderno real (30 dias, 2 dias
// sem medição, Lote 2 sem a tarde num dia, "Brinco 300" para testar matching).
// Apaga os dados da farm1 e reinsere; datas relativas a hoje.
// ---------------------------------------------------------------------------

const FARM_ID = 'farm1';

const rand = mulberry32(20260804);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const round1 = (v: number) => Math.round(v * 10) / 10;

// Base geográfica: zona rural do interior de SP (referência fictícia plausível).
const BASE: LatLng = [-23.0185, -47.3125];
const offset = (lat: number, lng: number): LatLng => [
  BASE[0] + lat / 111_000,
  BASE[1] + lng / 101_000,
];
const rect = (x: number, y: number, w: number, h: number): LatLng[] => [
  offset(y, x),
  offset(y, x + w),
  offset(y + h, x + w),
  offset(y + h, x),
];

const ANIMAL_NAMES = [
  "Mimosa", "Estrela", "Boneca", "Princesa", "Jandira", "Rosalinda",
  "Pandora", "Xodó", "Flor", "Morena", "Clarita", "Dourada",
  "Pinta", "Malhada", "Serena", "Vitória", "Amora", "Cigana",
  "Luna", "Bela", "Tainá", "Gaúcha", "Fumaça", "Pérola",
];

async function wipeFarm(db: ReturnType<typeof getDb>) {
  const farmAnimalIds = db.select({ id: animals.id }).from(animals).where(eq(animals.farmId, FARM_ID));
  const farmGroupIds = db.select({ id: herdGroups.id }).from(herdGroups).where(eq(herdGroups.farmId, FARM_ID));
  const farmSessionIds = db.select({ id: milkControlSessions.id }).from(milkControlSessions).where(eq(milkControlSessions.farmId, FARM_ID));
  const farmEventIds = db.select({ id: feedingEvents.id }).from(feedingEvents).where(eq(feedingEvents.farmId, FARM_ID));
  const farmCaptureIds = db.select({ id: assistantCaptures.id }).from(assistantCaptures).where(eq(assistantCaptures.farmId, FARM_ID));
  const farmUserIds = db.select({ id: users.id }).from(users).where(eq(users.farmId, FARM_ID));

  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.farmId, FARM_ID));
  await db.delete(authSessions).where(inArray(authSessions.userId, farmUserIds));
  await db.delete(auditEvents).where(eq(auditEvents.farmId, FARM_ID));
  await db.delete(assistantProposals).where(inArray(assistantProposals.captureId, farmCaptureIds));
  await db.delete(assistantCaptures).where(eq(assistantCaptures.farmId, FARM_ID));
  await db.delete(financialEntries).where(eq(financialEntries.farmId, FARM_ID));
  await db.delete(feedingEventItems).where(inArray(feedingEventItems.eventId, farmEventIds));
  await db.delete(feedingEvents).where(eq(feedingEvents.farmId, FARM_ID));
  await db.delete(feedEntries).where(eq(feedEntries.farmId, FARM_ID));
  await db.delete(feedItems).where(eq(feedItems.farmId, FARM_ID));
  await db.delete(individualMilkMeasurements).where(inArray(individualMilkMeasurements.sessionId, farmSessionIds));
  await db.delete(milkControlSessions).where(eq(milkControlSessions.farmId, FARM_ID));
  await db.delete(milkCollections).where(eq(milkCollections.farmId, FARM_ID));
  await db.delete(dailyMilkProductions).where(eq(dailyMilkProductions.farmId, FARM_ID));
  await db.delete(pastureOccupancies).where(inArray(pastureOccupancies.groupId, farmGroupIds));
  await db.delete(installations).where(eq(installations.farmId, FARM_ID));
  await db.delete(pastures).where(eq(pastures.farmId, FARM_ID));
  await db.delete(animalGroupAssignments).where(inArray(animalGroupAssignments.animalId, farmAnimalIds));
  await db.delete(animals).where(eq(animals.farmId, FARM_ID));
  await db.delete(herdGroups).where(eq(herdGroups.farmId, FARM_ID));
  await db.delete(users).where(eq(users.farmId, FARM_ID));
  await db.delete(farms).where(eq(farms.id, FARM_ID));
}

async function seed() {
  const db = getDb();
  await wipeFarm(db);

  const t = today();
  const days = lastNDays(30);

  await db.insert(farms).values({ id: FARM_ID, name: 'Sítio Cafezinho' });
  await db.insert(users).values({ id: 'u1', farmId: FARM_ID, name: 'Otávio' });

  // Rebanho
  const animalRows = ANIMAL_NAMES.map((name, i) => ({
    id: `a${i + 1}`,
    farmId: FARM_ID,
    name,
    tag: `B-${String(12 + i * 3).padStart(3, "0")}`,
    status: i >= 22 ? "arquivado" : "ativo",
    archivedAt: i >= 22 ? addDays(t, -12 + i) : null,
    archiveReason: i >= 22 ? "Vendida" : null,
  }));
  await db.insert(animals).values(animalRows);

  // Lotes: 1 e 2 ordenham 2×/dia; 3 ordenha 1×/dia.
  await db.insert(herdGroups).values([
    { id: "g1", farmId: FARM_ID, name: "Lote 1", milkingsPerDay: 2 },
    { id: "g2", farmId: FARM_ID, name: "Lote 2", milkingsPerDay: 2 },
    { id: "g3", farmId: FARM_ID, name: "Lote 3", milkingsPerDay: 1 },
  ]);

  const assignmentRows = animalRows.map((a, i) => ({
    id: `as${i + 1}`,
    animalId: a.id,
    groupId: i < 9 ? "g1" : i < 17 ? "g2" : "g3",
    start: addDays(t, -90),
    end: null as string | null,
  }));
  // Uma mudança de lote recente, com histórico.
  assignmentRows[10] = { ...assignmentRows[10], end: addDays(t, -6) };
  assignmentRows.push({
    id: "as_moved",
    animalId: animalRows[10].id,
    groupId: "g1",
    start: addDays(t, -6),
    end: null,
  });
  await db.insert(animalGroupAssignments).values(assignmentRows);

  const animalsOfGroup = (gid: string) =>
    animalRows.filter((a) =>
      assignmentRows.some((x) => x.animalId === a.id && x.groupId === gid && x.end === null)
    );

  // Espaço
  await db.insert(pastures).values([
    { id: "p1", farmId: FARM_ID, name: "Pasto da Sede", polygon: rect(0, 0, 260, 190) },
    { id: "p2", farmId: FARM_ID, name: "Pasto do Eucalipto", polygon: rect(260, 0, 300, 190) },
    { id: "p3", farmId: FARM_ID, name: "Pasto do Fundão", polygon: rect(0, 190, 260, 230) },
    { id: "p4", farmId: FARM_ID, name: "Pasto da Cerca Velha", polygon: rect(260, 190, 300, 230) },
  ]);

  await db.insert(installations).values([
    { id: "i1", farmId: FARM_ID, name: "Curral de ordenha", type: "curral" as const, point: offset(60, 80) },
    { id: "i2", farmId: FARM_ID, name: "Tanque de resfriamento", type: "tanque" as const, point: offset(48, 110) },
    { id: "i3", farmId: FARM_ID, name: "Depósito de ração", type: "deposito" as const, point: offset(85, 55) },
  ]);

  await db.insert(pastureOccupancies).values([
    { id: "o1", groupId: "g1", pastureId: "p2", start: addDays(t, -18), end: null },
    { id: "o2", groupId: "g2", pastureId: "p4", start: addDays(t, -9), end: null },
    { id: "o3", groupId: "g3", pastureId: "p1", start: addDays(t, -25), end: null },
    // Histórico: Lote 1 esteve no Fundão antes.
    { id: "o0", groupId: "g1", pastureId: "p3", start: addDays(t, -40), end: addDays(t, -18) },
  ]);

  // Produção diária: UM valor por dia, Fazenda. Dois dias sem medição.
  const missingDays = new Set([addDays(t, -14), addDays(t, -5)]);
  const productionRows: (typeof dailyMilkProductions.$inferInsert)[] = [];
  const collectionRows: (typeof milkCollections.$inferInsert)[] = [];
  let trend = 0;
  for (const d of days) {
    trend += between(-1.2, 1.6);
    if (!missingDays.has(d)) {
      productionRows.push({
        id: `pd_${d}`,
        farmId: FARM_ID,
        date: d,
        liters: round1(348 + trend + between(-14, 14)),
        origin: "manual",
      });
    }
    collectionRows.push({
      id: `col_${d}`,
      farmId: FARM_ID,
      date: d,
      time: `${10 + Math.floor(between(0, 3))}:${pick(["05", "20", "35", "50"])}`,
      liters: round1(330 + trend + between(-25, 25)),
      origin: "manual",
    });
  }
  await db.insert(dailyMilkProductions).values(productionRows);
  await db.insert(milkCollections).values(collectionRows);

  // Controles leiteiros: sessão = Lote + data + turno (espelha o caderno).
  // Hoje esporádicos; meta semanal. Um dia tem Lote 2 só de manhã (lacuna real).
  const sessionOffsets = [-29, -22, -17, -9, -2];
  const sessionRows: (typeof milkControlSessions.$inferInsert)[] = [];
  const measurementRows: (typeof individualMilkMeasurements.$inferInsert)[] = [];
  const baseByAnimal = new Map<string, number>();
  for (const a of animalRows) baseByAnimal.set(a.id, between(5.5, 11)); // por ordenha

  const addSession = (date: string, groupId: string, shift: "manha" | "tarde" | "unica", si: number) => {
    const s = {
      id: `cs_${date}_${groupId}_${shift}`,
      farmId: FARM_ID,
      date,
      groupId,
      shift,
      status: "concluido",
      origin: "manual",
    };
    sessionRows.push(s);
    for (const a of animalsOfGroup(groupId)) {
      if (a.status !== "ativo") continue;
      if (rand() < 0.12) continue; // nem toda vaca aparece em toda sessão
      const drift = si * between(-0.1, 0.25);
      measurementRows.push({
        id: `m_${s.id}_${a.id}`,
        sessionId: s.id,
        animalId: a.id,
        liters: round1(Math.max(3, baseByAnimal.get(a.id)! + drift + between(-0.9, 0.9))),
      });
    }
  };

  sessionOffsets.forEach((off, si) => {
    const d = addDays(t, off);
    addSession(d, "g1", "manha", si);
    addSession(d, "g1", "tarde", si);
    addSession(d, "g2", "manha", si);
    if (off !== -9) addSession(d, "g2", "tarde", si); // lacuna: tarde do Lote 2 no dia -9
    addSession(d, "g3", "unica", si);
  });
  await db.insert(milkControlSessions).values(sessionRows);
  await db.insert(individualMilkMeasurements).values(measurementRows);

  // Alimentação
  await db.insert(feedItems).values([
    { id: "f1", farmId: FARM_ID, name: "Ração lactação 18%", unit: "kg" },
    { id: "f2", farmId: FARM_ID, name: "Silagem de milho", unit: "kg" },
    { id: "f3", farmId: FARM_ID, name: "Sal mineral", unit: "kg" },
  ]);
  await db.insert(feedEntries).values([
    { id: "fe1", farmId: FARM_ID, itemId: "f1", date: addDays(t, -20), quantity: 1200, origin: "compra", note: null },
    { id: "fe2", farmId: FARM_ID, itemId: "f1", date: addDays(t, -6), quantity: 900, origin: "compra", note: null },
    { id: "fe3", farmId: FARM_ID, itemId: "f2", date: addDays(t, -16), quantity: 3500, origin: "compra", note: null },
    { id: "fe4", farmId: FARM_ID, itemId: "f3", date: addDays(t, -25), quantity: 60, origin: "compra", note: null },
  ]);
  const feedingEventRows: (typeof feedingEvents.$inferInsert)[] = [];
  const feedingItemRows: (typeof feedingEventItems.$inferInsert)[] = [];
  for (let i = 13; i >= 1; i--) {
    const eventId = `fv_${i}`;
    feedingEventRows.push({
      id: eventId,
      farmId: FARM_ID,
      groupId: pick(["g1", "g2"]),
      date: addDays(t, -i),
      origin: "manual",
    });
    feedingItemRows.push(
      { id: `fi_${eventId}_f1`, eventId, itemId: "f1", quantity: round1(between(70, 110)) },
      { id: `fi_${eventId}_f2`, eventId, itemId: "f2", quantity: round1(between(180, 260)) },
    );
  }
  await db.insert(feedingEvents).values(feedingEventRows);
  await db.insert(feedingEventItems).values(feedingItemRows);

  // Financeiro — previsto e liquidado.
  await db.insert(financialEntries).values([
    {
      id: "fin1", farmId: FARM_ID, kind: "receita",
      description: "Leite — 1ª quinzena (laticínio)",
      amountCents: 12_480_00, date: addDays(t, -15), dueDate: null, settledAt: addDays(t, -13),
      origin: "manual",
    },
    {
      id: "fin2", farmId: FARM_ID, kind: "receita",
      description: "Leite — 2ª quinzena (laticínio)",
      amountCents: 12_910_00, date: t, dueDate: addDays(t, 4), settledAt: null,
      origin: "manual",
    },
    {
      id: "fin3", farmId: FARM_ID, kind: "despesa",
      description: "Ração lactação 18% — 1,2 t",
      amountCents: 2_160_00, date: addDays(t, -20), dueDate: null, settledAt: addDays(t, -20),
      origin: "manual",
    },
    {
      id: "fin4", farmId: FARM_ID, kind: "despesa",
      description: "Ração lactação 18% — 0,9 t",
      amountCents: 1_620_00, date: addDays(t, -6), dueDate: addDays(t, 9), settledAt: null,
      origin: "manual",
    },
    {
      id: "fin5", farmId: FARM_ID, kind: "despesa",
      description: "Energia elétrica — sala de ordenha",
      amountCents: 438_50, date: addDays(t, -8), dueDate: null, settledAt: addDays(t, -8),
      origin: "manual",
    },
    {
      id: "fin6", farmId: FARM_ID, kind: "despesa",
      description: "Sal mineral — 60 kg",
      amountCents: 510_00, date: addDays(t, -25), dueDate: null, settledAt: addDays(t, -24),
      origin: "manual",
    },
  ]);

  // Assistente — capturas e propostas (duas pendentes, uma confirmada).
  await db.insert(assistantCaptures).values([
    {
      id: "cap1", farmId: FARM_ID,
      text: "hoje a produção foi 348 litros e meio",
      createdAt: new Date(`${t}T18:12:00`),
    },
    {
      id: "cap2", farmId: FARM_ID,
      text: "controle de ontem, lote 1 manhã: mimosa 7, estrela 9,8, boneca 6,5, princesa 8, jandira 5 e meio, rosalinda 9,2, pandora 7,5, brinco 300 8,9",
      createdAt: new Date(`${t}T06:48:00`),
    },
    {
      id: "cap3", farmId: FARM_ID,
      text: "laticínio passou às 11 e 20 e levou 345 litros",
      createdAt: new Date(`${addDays(t, -1)}T11:26:00`),
    },
  ]);
  await db.insert(assistantProposals).values([
    {
      id: "prop1", captureId: "cap1", kind: "producao_diaria",
      title: "Produção diária — Fazenda",
      fields: [
        { key: "date", label: "Data", value: t, confidence: "alta" as const },
        { key: "liters", label: "Volume", value: "348,5 L", confidence: "media" as const },
      ],
      consequences: ["Registro de Produção diária (Fazenda): 348,5 L"],
      issues: ["“litros e meio” interpretado como ,5 — confira o volume."],
      status: "pendente",
      dismissReason: null,
      confirmedRecordIds: [],
    },
    {
      id: "prop2", captureId: "cap2", kind: "controle_leiteiro",
      title: "Controle leiteiro — Lote 1 · manhã · 8 medições",
      fields: [
        { key: "date", label: "Data do controle", value: addDays(t, -1), confidence: "alta" as const },
        { key: "group", label: "Lote", value: "Lote 1", confidence: "alta" as const },
        { key: "shift", label: "Ordenha", value: "manhã", confidence: "alta" as const },
        { key: "rows", label: "Medições", value: "Mimosa 7,0 · Estrela 9,8 · Boneca 6,5 · Princesa 8,0 · Jandira 5,5 · Rosalinda 9,2 · Pandora 7,5 · Brinco 300 8,9", confidence: "media" as const },
      ],
      consequences: [
        `Controle leiteiro: Lote 1 · ${addDays(t, -1)} · manhã`,
        "8 Medições individuais — 7 Animais reconhecidos, 1 não reconhecido",
      ],
      issues: [
        "“ontem” interpretado como " + addDays(t, -1) + ".",
        "“brinco 300” não reconhecido — vincule ou cadastre na Revisão.",
      ],
      status: "pendente",
      dismissReason: null,
      confirmedRecordIds: [],
    },
    {
      id: "prop3", captureId: "cap3", kind: "coleta",
      title: "Coleta — 345 L",
      fields: [
        { key: "date", label: "Data", value: addDays(t, -1), confidence: "alta" as const },
        { key: "time", label: "Horário", value: "11:20", confidence: "alta" as const },
        { key: "liters", label: "Volume", value: "345,0 L", confidence: "alta" as const },
      ],
      consequences: ["Registro de Coleta: 345,0 L às 11:20"],
      issues: [],
      status: "confirmada",
      dismissReason: null,
      confirmedRecordIds: [`col_${addDays(t, -1)}`],
    },
  ]);

  await db.insert(auditEvents).values({
    id: "au_seed",
    farmId: FARM_ID,
    at: new Date(`${addDays(t, -1)}T11:27:00`),
    actor: "Otávio",
    action: "confirmacao",
    entityType: "coleta",
    entityId: `col_${addDays(t, -1)}`,
    description: "Proposta de Coleta confirmada pelo Assistente",
    before: null,
    after: null,
    reason: null,
    origin: "assistente",
  });

  console.log(
    `Seed concluído: ${animalRows.length} animais, ${productionRows.length} produções, ${collectionRows.length} coletas, ` +
      `${sessionRows.length} sessões, ${measurementRows.length} medições, ${feedingEventRows.length} tratos.`,
  );
}

try {
  await seed();
} finally {
  await closeDb();
}
