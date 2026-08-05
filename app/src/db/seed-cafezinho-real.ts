import { eq } from 'drizzle-orm';
import { closeDb, getDb } from './client.js';
import { polygonGeometryFromLatLng } from './spatial.js';
import {
  animalGroupAssignments,
  animals,
  auditEvents,
  dailyMilkProductions,
  farmBoundaries,
  farms,
  herdGroups,
  pastures,
  users,
} from './schema.js';
import {
  SEEDED_ANIMALS,
  SEEDED_ASSIGNMENTS,
  SEEDED_HERD_GROUPS,
} from './seed-herd-data.js';
import { hashPassword } from '../server/auth.js';
import type { LatLng } from '../domain/types.js';

/**
 * Job de migração inicial do MVP sitio-cafezinho para a Fazenda V2.
 *
 * Contexto: Identidade, Rebanho, Espaço e Leite.
 * Comando: SeedCafezinhoReal.
 * Lê: fonte confirmada do MVP (rebanho, mapa e espelhos de leitura do tanque).
 * Escreve: Fazenda, Usuário, Animais, Lotes, Lotações, Perímetro, Pastos,
 * Produções diárias e auditoria de migração.
 * Invariantes: uma Fazenda por Usuário, todo dado operacional no mesmo
 * farm_id e uma Produção diária por data. Não cria Coleta, Instalação,
 * Ocupação, Controle leiteiro, Trato, Financeiro ou dados do Assistente.
 * Idempotência: inserções usam IDs estáveis e nunca apagam ou sobrescrevem
 * registros existentes; conflito na Produção diária com valor diferente falha.
 */

export const CAFEZINHO_FARM_ID = '6b2c4e68-9d93-47ce-b803-97e0740da5ac';
export const CAFEZINHO_USER_ID = 'dcccb5d6-778f-4a25-948a-a720c4907219';
export const CAFEZINHO_USERNAME = 'cafezinho';
const FARM_NAME = 'Sítio Cafezinho';
const IMPORT_AUDIT_ID = 'f1634d1a-ecfb-4eff-a09e-a29f541cd211';
const namespaceId = (sourceId: string) => `cafezinho:${sourceId}`;

// Fonte espacial confirmada do MVP. Instalações e Ocupações não são importadas
// porque não foram confirmadas pela fonte.
const SITIO_BOUNDARY: LatLng[] = [
  [-22.30335409625803, -52.06158343688227], [-22.305618530951836, -52.06156197263571],
  [-22.30512194753891, -52.056668124419524], [-22.304247956443884, -52.05620664311843],
  [-22.30332430081998, -52.05626030373483], [-22.303135596231428, -52.05629250010469],
  [-22.302221865144286, -52.05689349900843], [-22.301645814213096, -52.05746230154232],
  [-22.3010697609064, -52.05811696106246], [-22.298239119627198, -52.05864283510325],
  [-22.294057611263767, -52.0561744467486], [-22.292076060052782, -52.05764572394289],
  [-22.289433959927507, -52.057237903258205], [-22.288500273503885, -52.056497386751815],
  [-22.29217538615104, -52.06353765962422], [-22.29591992855591, -52.06332301715859],
  [-22.29711180428985, -52.06324789229562], [-22.300369546086934, -52.06302251770674],
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

// Cada registro do MVP era um espelho de "total diário de <data>". Por isso
// entra como Produção diária na data indicada pela nota de origem, não Coleta.
const DAILY_MILK_PRODUCTIONS = [
  { id: 'bac51abb-9538-4715-8e8d-c566fb6cdad8', date: '2026-07-01', liters: 1394 },
  { id: 'c2c09abd-01e2-46a5-ac85-c82d078f5397', date: '2026-07-02', liters: 1166 },
  { id: '72f55367-a884-44f7-a278-1cf2bf8fcc03', date: '2026-07-03', liters: 1203 },
  { id: 'd2a4ffae-0f36-4482-a9e4-eff4da73674e', date: '2026-07-04', liters: 1198 },
  { id: 'ddf7d08e-0c6f-4258-b94e-980c27245862', date: '2026-07-05', liters: 1538 },
  { id: '1520b030-a77d-4404-865c-fe73575f6aad', date: '2026-07-06', liters: 898 },
  { id: 'd090f000-c96d-4d30-bc1f-e7e54f33a4b4', date: '2026-07-07', liters: 1235 },
  { id: '15745e78-81a7-439d-a618-54d6e4ef20fd', date: '2026-07-08', liters: 1208 },
  { id: '0409a4ab-2e80-496b-854e-dcf7ebc5d4d2', date: '2026-07-09', liters: 1253 },
  { id: '21bc916d-75f0-4368-b39d-cdae4da7d110', date: '2026-07-10', liters: 1281 },
  { id: '91041845-3700-4512-a810-5bf7c8b36cdb', date: '2026-07-11', liters: 883 },
  { id: '49991908-8693-4404-9f33-fae13b8910f2', date: '2026-07-12', liters: 1613 },
  { id: '4e414421-817e-4f65-b25c-d645b03b496f', date: '2026-07-13', liters: 1256 },
  { id: 'b3af1e74-acd9-4d71-b029-4a2ffb21ffa9', date: '2026-07-14', liters: 1256 },
  { id: '991b1ce4-3d9f-4966-9954-c8c778bc432c', date: '2026-07-15', liters: 1195 },
  { id: '4cfaa582-b8c6-4d78-9756-a317e803a0e7', date: '2026-07-16', liters: 1275 },
] as const;

function assertSame<T extends string | number>(label: string, actual: T, expected: T) {
  if (actual !== expected) throw new Error(`Seed Cafezinho interrompido: ${label} já existe com valor diferente.`);
}

export async function seedCafezinhoReal() {
  const seedPassword = process.env.CAFEZINHO_SEED_PASSWORD;
  if (!seedPassword) throw new Error('CAFEZINHO_SEED_PASSWORD é obrigatório para criar o Usuário cafezinho.');
  const passwordHash = await hashPassword(seedPassword);
  const connection = getDb();

  await connection.transaction(async (db) => {
    const [existingFarm, existingUsername, existingFarmUser] = await Promise.all([
      db.select().from(farms).where(eq(farms.id, CAFEZINHO_FARM_ID)).limit(1),
      db.select().from(users).where(eq(users.username, CAFEZINHO_USERNAME)).limit(1),
      db.select().from(users).where(eq(users.farmId, CAFEZINHO_FARM_ID)).limit(1),
    ]);

    if (existingFarm[0]) assertSame('a Fazenda', existingFarm[0].name, FARM_NAME);
    if (existingUsername[0]) assertSame('o Usuário', existingUsername[0].farmId, CAFEZINHO_FARM_ID);
    if (existingFarmUser[0]) assertSame('o Usuário da Fazenda', existingFarmUser[0].username, CAFEZINHO_USERNAME);

    await db.insert(farms).values({ id: CAFEZINHO_FARM_ID, name: FARM_NAME }).onConflictDoNothing();
    await db.insert(users).values({ id: CAFEZINHO_USER_ID, farmId: CAFEZINHO_FARM_ID, name: 'Cafezinho', username: CAFEZINHO_USERNAME, passwordHash }).onConflictDoNothing();
    await db.insert(animals).values(SEEDED_ANIMALS.map((animal) => ({ ...animal, id: namespaceId(animal.id), farmId: CAFEZINHO_FARM_ID }))).onConflictDoNothing();
    await db.insert(herdGroups).values(SEEDED_HERD_GROUPS.map((group) => ({ ...group, id: namespaceId(group.id), farmId: CAFEZINHO_FARM_ID }))).onConflictDoNothing();
    await db.insert(animalGroupAssignments).values(SEEDED_ASSIGNMENTS.map((assignment) => ({ ...assignment, id: namespaceId(assignment.id), animalId: namespaceId(assignment.animalId), groupId: namespaceId(assignment.groupId) }))).onConflictDoNothing();
    await db.insert(farmBoundaries).values({ id: namespaceId('c4b5c739-cda2-4d95-a860-ad7b40a35e20'), farmId: CAFEZINHO_FARM_ID, name: 'Sítio', boundary: polygonGeometryFromLatLng(SITIO_BOUNDARY) as never }).onConflictDoNothing();
    await db.insert(pastures).values(REAL_PASTURES.map((pasture) => ({ id: namespaceId(pasture.id), farmId: CAFEZINHO_FARM_ID, name: pasture.name, polygon: polygonGeometryFromLatLng(pasture.polygon) as never }))).onConflictDoNothing();
    await db.insert(dailyMilkProductions).values(DAILY_MILK_PRODUCTIONS.map((production) => ({ ...production, id: namespaceId(production.id), farmId: CAFEZINHO_FARM_ID, origin: 'manual' as const }))).onConflictDoNothing();

    const importedProductions = await db.select().from(dailyMilkProductions).where(eq(dailyMilkProductions.farmId, CAFEZINHO_FARM_ID));
    const productionByDate = new Map(importedProductions.map((production) => [production.date, production]));
    for (const expected of DAILY_MILK_PRODUCTIONS) {
      const actual = productionByDate.get(expected.date);
      if (!actual) throw new Error(`Seed Cafezinho interrompido: Produção diária de ${expected.date} não foi criada.`);
      assertSame(`a Produção diária de ${expected.date}`, actual.liters, expected.liters);
    }

    await db.insert(auditEvents).values({
      id: IMPORT_AUDIT_ID,
      farmId: CAFEZINHO_FARM_ID,
      at: new Date(),
      actor: 'Migração sitio-cafezinho',
      action: 'importacao_inicial',
      entityType: 'fazenda',
      entityId: CAFEZINHO_FARM_ID,
      description: 'Importação inicial confirmada do MVP sitio-cafezinho.',
      before: null,
      after: JSON.stringify({ animals: 96, herdGroups: 2, assignments: 96, pastures: 14, dailyMilkProductions: 16 }),
      reason: null,
      origin: 'migracao',
    }).onConflictDoNothing();
  });

  console.log(JSON.stringify({ event: 'job.completed', job: 'SeedCafezinhoReal', farmId: CAFEZINHO_FARM_ID, animals: SEEDED_ANIMALS.length, herdGroups: SEEDED_HERD_GROUPS.length, pastures: REAL_PASTURES.length, dailyMilkProductions: DAILY_MILK_PRODUCTIONS.length }));
}

await seedCafezinhoReal().finally(closeDb);
