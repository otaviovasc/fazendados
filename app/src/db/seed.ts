import { randomBytes, scryptSync } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from './client.js';
import { polygonGeometryFromLatLng } from './spatial.js';
import {
  animalGroupAssignments,
  animals,
  assistantCaptures,
  assistantProposals,
  auditEvents,
  dailyMilkProductions,
  farms,
  feedingEventItems,
  feedingEvents,
  feedEntries,
  feedItems,
  financialEntries,
  farmBoundaries,
  herdGroups,
  individualMilkMeasurements,
  milkCollections,
  milkControlSessions,
  pastures,
  users,
} from './schema.js';
import { addDays, lastNDays, today } from '../lib/dates.js';
import { mulberry32 } from '../lib/prng.js';
import type { LatLng } from '../domain/types.js';
import {
  SEEDED_ANIMALS,
  SEEDED_ASSIGNMENTS,
  SEEDED_HERD_GROUPS,
} from './seed-herd-data.js';

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

/** Formato compartilhado com a autenticação: scrypt$N$r$p$salt$hash. */
function hashSeedPassword(password: string) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

// Dados cartográficos adaptados do sitio-cafezinho. O seed não inclui
// Instalações nem ocupações: semeá-las exigiria afirmar informações que não
// vieram da fonte; elas entram pela operação manual do Mapa.
const SITIO_BOUNDARY: LatLng[] = [
  [-22.30335409625803, -52.06158343688227],
  [-22.305618530951836, -52.06156197263571],
  [-22.30512194753891, -52.056668124419524],
  [-22.304247956443884, -52.05620664311843],
  [-22.30332430081998, -52.05626030373483],
  [-22.303135596231428, -52.05629250010469],
  [-22.302221865144286, -52.05689349900843],
  [-22.301645814213096, -52.05746230154232],
  [-22.3010697609064, -52.05811696106246],
  [-22.298239119627198, -52.05864283510325],
  [-22.294057611263767, -52.0561744467486],
  [-22.292076060052782, -52.05764572394289],
  [-22.289433959927507, -52.057237903258205],
  [-22.288500273503885, -52.056497386751815],
  [-22.29217538615104, -52.06353765962422],
  [-22.29591992855591, -52.06332301715859],
  [-22.29711180428985, -52.06324789229562],
  [-22.300369546086934, -52.06302251770674],
  [-22.303130621423232, -52.06289373222735],
];

const REAL_PASTURES: { id: string; name: string; polygon: LatLng[] }[] = [
  { id: '46b11441-f73a-447e-a41b-111c8ec09ab2', name: 'Pasto Engorda', polygon: [[-22.30013460545606, -52.05906312652388], [-22.29979730598745, -52.05929923323606], [-22.299598894154936, -52.059578268441385], [-22.29945187603075, -52.05977995037503], [-22.301350667650073, -52.05969409338877]] },
  { id: '47c0300f-181e-443c-8abd-5eb770eab897', name: 'Pasto 7', polygon: [[-22.296369706903246, -52.06082595696456], [-22.29642431605823, -52.061668430847654], [-22.298886670322354, -52.0616469665449], [-22.298985957890537, -52.06076693013198]] },
  { id: '77ca9bb2-0ede-4416-894e-81a6c2cbc4b9', name: 'Pasto Vaca Mojada', polygon: [[-22.30322022096864, -52.05965529026516], [-22.303180539597058, -52.06160317064067], [-22.30180160493096, -52.061613902763945], [-22.301836326474533, -52.0597411472514]] },
  { id: '8732359e-547b-4084-a692-bee4c2739c9a', name: 'Pasto 4', polygon: [[-22.301791662885464, -52.061658762265736], [-22.303190438338277, -52.06164803014247], [-22.303091234866937, -52.06288222431935], [-22.301781742442152, -52.062935884936195]] },
  { id: '8ea4d7d0-30de-4414-b483-344ddce4c869', name: 'Pasto 3', polygon: [[-22.30182142421115, -52.0596947837053], [-22.299158143837957, -52.059795501401325], [-22.29902421526921, -52.06072383006514], [-22.301792046265188, -52.06065943732546]] },
  { id: 'a6982d74-a99d-483c-9713-02ea499af3aa', name: 'Pasto bezerro', polygon: [[-22.303149398894845, -52.05652728535381], [-22.302970832543227, -52.05646289261413], [-22.302117679045843, -52.05709608788769], [-22.302226803621018, -52.05751464069568], [-22.302841867813964, -52.057171212750674]] },
  { id: 'adec137f-a282-4a89-b4fe-958551985d3b', name: 'Pasto 2', polygon: [[-22.30334881241088, -52.05849266098339], [-22.30527334363052, -52.05870730344904], [-22.305541188656814, -52.061540583995225], [-22.303358732742876, -52.06155131611852]] },
  { id: 'd008dcdd-228f-4a50-ae7e-92a597ddaf7e', name: 'Pasto 1', polygon: [[-22.303338886225117, -52.05847035520812], [-22.305283257972828, -52.05869572979703], [-22.305074933723148, -52.05669955486675], [-22.304291234952977, -52.05628100205877], [-22.303259523538014, -52.056334662675184]] },
  { id: 'de97fd19-72fb-4b29-a16f-70afa26db5de', name: 'Pasto bezerro grande', polygon: [[-22.30320699062455, -52.05776277815345], [-22.302626174899874, -52.05775741207777], [-22.30263113914709, -52.05786473359156], [-22.302551711170764, -52.05789156396998], [-22.302502068662623, -52.05967310109858], [-22.30322188330371, -52.05964627072015]] },
  { id: 'e4cdffe2-7e73-4b4f-b08e-a3c645b2340d', name: 'Pasto bezerro 2', polygon: [[-22.30316019134824, -52.05656927041435], [-22.30316019134824, -52.05765321486573], [-22.30291019844163, -52.057610286372615], [-22.302860596615275, -52.05720246568792]] },
  { id: 'e5dcf32f-7185-47e5-8cf0-0ce5544ec2d4', name: 'Praca Alimentacao 2', polygon: [[-22.29952816809163, -52.05916949807718], [-22.299776182963818, -52.05930901567984], [-22.299815865302513, -52.05922315869359], [-22.29994483282544, -52.059008516227976], [-22.300301973036742, -52.058708016776094], [-22.300391257946885, -52.058793873762355], [-22.300966648221348, -52.05823580335172], [-22.29982578588544, -52.058396785200934], [-22.299696818252645, -52.058708016776094], [-22.299508326882844, -52.058708016776094]] },
  { id: 'd3d23753-8ac4-477b-a101-53564b5a6ea4', name: 'Pasto 5', polygon: [[-22.29904247051858, -52.06073480329952], [-22.29891339671841, -52.06164167009088], [-22.301787691918403, -52.06160985821359], [-22.301792656195413, -52.06067616104379]] },
  { id: 'f62e1c84-2099-462d-8a37-d0682de12825', name: 'Pasto 6', polygon: [[-22.298868033169153, -52.059774516111794], [-22.296400714108177, -52.05983890902006], [-22.296365962824336, -52.060810168719684], [-22.298917676968703, -52.06073504366004]] },
  { id: 'fee356ac-ca46-49a3-8571-4282febbe77a', name: 'Praca Alimentacao 1', polygon: [[-22.300147037036957, -52.05904962360036], [-22.300375209724777, -52.05883498113473], [-22.300772030902916, -52.05842716045006], [-22.301010123068775, -52.058233982230995], [-22.301297817227724, -52.05819105373788], [-22.301178771440703, -52.058266178600846], [-22.301228373864262, -52.05844862469661], [-22.301367260556635, -52.05841642832679], [-22.30180376069071, -52.05968281887395], [-22.301347419609023, -52.05970428312051]] },
];

type DbExecutor = Pick<ReturnType<typeof getDb>, 'execute'>;

async function wipeFarm(db: DbExecutor) {
  // A seed is a local reset command, but it must still be atomic. Keep the
  // dependency order explicit so Postgres never sees a farm with children.
  await db.execute(sql`delete from "idempotency_keys" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "sessions" where "user_id" in (select "id" from "users" where "farm_id" = ${FARM_ID})`);
  await db.execute(sql`delete from "audit_events" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "assistant_proposals" where "capture_id" in (select "id" from "assistant_captures" where "farm_id" = ${FARM_ID})`);
  await db.execute(sql`delete from "assistant_capture_attachments" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "assistant_captures" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "financial_entries" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "feeding_event_items" where "event_id" in (select "id" from "feeding_events" where "farm_id" = ${FARM_ID})`);
  await db.execute(sql`delete from "feeding_events" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "feed_entries" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "feed_items" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "individual_milk_measurements" where "session_id" in (select "id" from "milk_control_sessions" where "farm_id" = ${FARM_ID})`);
  await db.execute(sql`delete from "milk_control_sessions" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "milk_collections" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "daily_milk_productions" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "pasture_occupancies" where "group_id" in (select "id" from "herd_groups" where "farm_id" = ${FARM_ID}) or "pasture_id" in (select "id" from "pastures" where "farm_id" = ${FARM_ID})`);
  await db.execute(sql`delete from "installations" where "farm_id" = ${FARM_ID}`);
  // This was the failing dependency in the Docker seed. Delete it explicitly
  // before the farm, rather than relying on a cascade that does not exist.
  await db.execute(sql`delete from "farm_boundaries" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "pastures" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "animal_group_assignments" where "animal_id" in (select "id" from "animals" where "farm_id" = ${FARM_ID}) or "group_id" in (select "id" from "herd_groups" where "farm_id" = ${FARM_ID})`);
  await db.execute(sql`delete from "animals" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "herd_groups" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "users" where "farm_id" = ${FARM_ID}`);
  await db.execute(sql`delete from "farms" where "id" = ${FARM_ID}`);
}

async function seed() {
  const connection = getDb();
  await connection.transaction(async (db) => {
    await wipeFarm(db);

  const t = today();
  const days = lastNDays(30);

  await db.insert(farms).values({ id: FARM_ID, name: 'Sítio Cafezinho' });
  await db.insert(users).values({
    id: 'u1',
    farmId: FARM_ID,
    name: 'Otávio',
    username: 'otavio',
    passwordHash: hashSeedPassword(process.env.SEED_PASSWORD ?? 'fazendados'),
  });

  // Rebanho
  const animalRows = SEEDED_ANIMALS.map((animal) => ({ ...animal, farmId: FARM_ID }));
  await db.insert(animals).values(animalRows);

  // Lotes reais do V1: Lote 1 ordenha duas vezes; Lote 2, uma vez.
  await db.insert(herdGroups).values(
    SEEDED_HERD_GROUPS.map((group) => ({ ...group, farmId: FARM_ID })),
  );

  const assignmentRows = SEEDED_ASSIGNMENTS.map((assignment) => ({ ...assignment }));
  await db.insert(animalGroupAssignments).values(assignmentRows);

  const animalsOfGroup = (gid: string) =>
    animalRows.filter((a) =>
      assignmentRows.some((x) => x.animalId === a.id && x.groupId === gid && x.end === null)
    );

  // Espaço real do sitio-cafezinho: o perímetro é oficial; os Pastos não
  // recebem Lote até que alguém faça a alocação no produto.
  await db.insert(farmBoundaries).values({
    id: 'c4b5c739-cda2-4d95-a860-ad7b40a35e20',
    farmId: FARM_ID,
    name: 'Sítio',
    boundary: polygonGeometryFromLatLng(SITIO_BOUNDARY) as never,
  });
  await db.insert(pastures).values(
    REAL_PASTURES.map((pasture) => ({
      id: pasture.id,
      farmId: FARM_ID,
      name: pasture.name,
      polygon: polygonGeometryFromLatLng(pasture.polygon) as never,
    })),
  );

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
  // O turno é derivado da rotina de cada Lote; uma tarde do Lote 1 fica
  // ausente para manter uma lacuna real sem inventar medição.
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
    for (const group of SEEDED_HERD_GROUPS) {
      const shifts: ("manha" | "tarde" | "unica")[] =
        group.milkingsPerDay === 1 ? ["unica"] : ["manha", "tarde"];
      for (const shift of shifts) {
        if (group.id === SEEDED_HERD_GROUPS[0].id && shift === "tarde" && off === -9) continue;
        addSession(d, group.id, shift, si);
      }
    }
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
      groupId: SEEDED_HERD_GROUPS[Math.floor(rand() * SEEDED_HERD_GROUPS.length)].id,
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
  });
}

try {
  await seed();
} finally {
  await closeDb();
}
