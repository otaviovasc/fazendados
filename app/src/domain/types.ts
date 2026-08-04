// Domain model of the FazenDados V1 app.
// Mirrors docs/ONTOLOGY.md — one farm, facts are independent, absence is not zero.

export type ISODate = string; // "2026-08-03" — operational date
export type ISODateTime = string;

// ---------- Identidade ----------
export interface Farm {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  farmId: string;
}

// ---------- Rebanho ----------
export type AnimalStatus = "ativo" | "arquivado";

export interface Animal {
  id: string;
  farmId: string;
  name: string; // nome ou brinco — identidade mínima (P-002 decidido)
  tag?: string; // brinco, quando diferente do nome
  status: AnimalStatus;
  archivedAt?: ISODate;
  archiveReason?: string;
}

export interface HerdGroup {
  id: string;
  farmId: string;
  name: string;
  /** Quantas ordenhas por dia este Lote faz (1 ou 2) — propriedade do Lote. */
  milkingsPerDay: 1 | 2;
}

/** Lotação: período datado em que um Animal pertence a um Lote. */
export interface AnimalGroupAssignment {
  id: string;
  animalId: string;
  groupId: string;
  start: ISODate;
  end: ISODate | null; // null = lotação aberta (máx. 1 por animal)
}

// ---------- Espaço ----------
export type LatLng = [number, number];

export interface FarmBoundary {
  id: string;
  farmId: string;
  name: string;
  polygon: LatLng[];
}

export interface Pasture {
  id: string;
  farmId: string;
  name: string;
  polygon: LatLng[];
}

export type InstallationType = "curral" | "tanque" | "deposito" | "outro";

export interface Installation {
  id: string;
  farmId: string;
  name: string;
  type: InstallationType;
  point: LatLng;
}

/** Ocupação de pasto: período datado em que um Lote ocupa um Pasto (1:1 por vez). */
export interface PastureOccupancy {
  id: string;
  groupId: string;
  pastureId: string;
  start: ISODate;
  end: ISODate | null;
}

// ---------- Leite ----------
/** Turno da ordenha: "unica" para Lotes de 1 ordenha/dia. */
export type MilkingShift = "manha" | "tarde" | "unica";

/** Produção diária: UM valor por dia, sempre no escopo da Fazenda. */
export interface DailyMilkProduction {
  id: string;
  farmId: string;
  date: ISODate;
  liters: number;
  origin: FactOrigin;
}

/** Controle leiteiro: 1 sessão = 1 Lote + 1 data + 1 turno (espelha o caderno). */
export interface MilkControlSession {
  id: string;
  farmId: string;
  date: ISODate;
  groupId: string;
  shift: MilkingShift;
  status: "em_andamento" | "concluido";
  origin: FactOrigin;
}

/** Medição individual: litros daquela ordenha (1 casa decimal). */
export interface IndividualMilkMeasurement {
  id: string;
  sessionId: string;
  animalId: string;
  liters: number;
}

export interface MilkCollection {
  id: string;
  farmId: string;
  date: ISODate;
  time: string; // "10:40"
  liters: number;
  origin: FactOrigin;
}

// ---------- Alimentação ----------
export interface FeedItem {
  id: string;
  farmId: string;
  name: string;
  unit: string; // "kg", "sc", "l"
}

export interface FeedEntry {
  id: string;
  farmId: string;
  itemId: string;
  date: ISODate;
  quantity: number;
  origin: string; // "compra", "estoque inicial", "ajuste"
  note?: string;
}

export interface FeedingEvent {
  id: string;
  farmId: string;
  groupId: string;
  date: ISODate;
  items: { itemId: string; quantity: number }[];
  origin: FactOrigin;
}

// ---------- Financeiro ----------
export type FinancialKind = "receita" | "despesa";

export interface FinancialEntry {
  id: string;
  farmId: string;
  kind: FinancialKind;
  description: string;
  amountCents: number;
  date: ISODate; // competência
  dueDate?: ISODate;
  settledAt: ISODate | null; // Liquidação
  origin: FactOrigin;
}

// ---------- Assistente ----------
export type FactOrigin = "manual" | "assistente";

export interface AssistantCapture {
  id: string;
  farmId: string;
  text: string;
  createdAt: ISODateTime;
}

export type ProposalKind =
  | "producao_diaria"
  | "controle_leiteiro"
  | "coleta"
  | "trato"
  | "lancamento_financeiro"
  | "desconhecida";

export type ProposalStatus = "pendente" | "confirmada" | "descartada";

export interface ProposalField {
  key: string;
  label: string;
  value: string; // editable in Revisão
  confidence: "alta" | "media" | "baixa";
}

export interface AssistantProposal {
  id: string;
  captureId: string;
  kind: ProposalKind;
  title: string; // ex.: "Produção diária — Lote 2"
  fields: ProposalField[];
  /** linhas de consequência: o que vira Registro após a Confirmação */
  consequences: string[];
  issues: string[]; // ambiguidades/pedidos de esclarecimento
  status: ProposalStatus;
  dismissReason?: string;
  confirmedRecordIds: string[];
}

// ---------- Auditoria ----------
export interface AuditEvent {
  id: string;
  at: ISODateTime;
  actor: string;
  action: string; // ex.: "correcao", "registro", "confirmacao", "liquidacao"
  entityType: string; // ex.: "producao_diaria"
  entityId: string;
  description: string;
  before?: string;
  after?: string;
  reason?: string;
  origin: FactOrigin;
}

// ---------- Estado raiz ----------
export interface FarmState {
  farm: Farm;
  user: User;
  farmBoundary: FarmBoundary | null;
  animals: Animal[];
  groups: HerdGroup[];
  assignments: AnimalGroupAssignment[];
  pastures: Pasture[];
  installations: Installation[];
  occupancies: PastureOccupancy[];
  productions: DailyMilkProduction[];
  sessions: MilkControlSession[];
  measurements: IndividualMilkMeasurement[];
  collections: MilkCollection[];
  feedItems: FeedItem[];
  feedEntries: FeedEntry[];
  feedingEvents: FeedingEvent[];
  financialEntries: FinancialEntry[];
  captures: AssistantCapture[];
  proposals: AssistantProposal[];
  audit: AuditEvent[];
}
