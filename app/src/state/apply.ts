// Aplicadores de estado do cliente.
//
// Duas funções complementares:
// - `applyOptimistic`: reflete imediatamente comandos cujo resultado é
//   determinístico a partir da ação (sessão de controle e novas medições). Uma
//   medição já existente nunca é substituída otimisticamente; o servidor é a
//   autoridade para rejeitar a duplicata.
// - `applyCommandResult`: incorpora o resultado autoritativo devolvido por
//   POST /api/commands (entidades com ids do servidor). O que não vem no
//   resultado (ex.: audit_events) converge pelo refresh de bootstrap
//   agendado pelo store após cada comando.
import type {
  Animal,
  AnimalGroupAssignment,
  AssistantCapture,
  AssistantProposal,
  DailyMilkProduction,
  FarmState,
  FeedingEvent,
  FeedEntry,
  FeedItem,
  FinancialEntry,
  FarmBoundary,
  HerdGroup,
  IndividualMilkMeasurement,
  Installation,
  MilkCollection,
  MilkControlSession,
  Pasture,
  PastureOccupancy,
} from "../domain/types";
import { uid } from "../lib/prng";
import type { Action } from "./actions";

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/** Mescla o resultado autoritativo pela chave natural (sessão, animal). */
function mergeMeasurement(
  list: IndividualMilkMeasurement[],
  item: IndividualMilkMeasurement,
): IndividualMilkMeasurement[] {
  const i = list.findIndex((x) => x.sessionId === item.sessionId && x.animalId === item.animalId);
  if (i < 0) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

export function applyOptimistic(s: FarmState, a: Action): FarmState {
  switch (a.type) {
    case "StartMilkControlSession": {
      if (s.sessions.some((x) => x.id === a.sessionId)) return s;
      const session: MilkControlSession = {
        id: a.sessionId,
        farmId: s.farm.id,
        date: a.date,
        groupId: a.groupId,
        shift: a.shift,
        status: "em_andamento",
        origin: "manual",
      };
      return { ...s, sessions: [...s.sessions, session] };
    }
    case "RecordIndividualMilkMeasurement": {
      if (s.measurements.some((x) => x.sessionId === a.sessionId && x.animalId === a.animalId)) {
        return s;
      }
      const measurement: IndividualMilkMeasurement = {
        id: uid("mm"),
        sessionId: a.sessionId,
        animalId: a.animalId,
        liters: a.liters,
      };
      return { ...s, measurements: [...s.measurements, measurement] };
    }
    case "CompleteMilkControlSession":
      return {
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === a.sessionId ? { ...x, status: "concluido" } : x,
        ),
      };
    default:
      return s;
  }
}

/** Forma dos resultados devolvidos por executeCommand (src/server/commands.ts). */
type CommandResult = {
  production?: DailyMilkProduction;
  session?: MilkControlSession;
  measurement?: IndividualMilkMeasurement;
  collection?: MilkCollection;
  animal?: Animal;
  assignment?: AnimalGroupAssignment | null;
  closedAssignmentId?: string | null;
  group?: HerdGroup;
  pasture?: Pasture;
  installation?: Installation;
  occupancy?: PastureOccupancy;
  feedItem?: FeedItem;
  feedEntry?: FeedEntry;
  feedingEvent?: FeedingEvent;
  financialEntry?: FinancialEntry;
  farmBoundary?: FarmBoundary;
  capture?: AssistantCapture;
  proposal?: AssistantProposal;
  proposals?: AssistantProposal[];
};

export function applyCommandResult(s: FarmState, a: Action, result: unknown): FarmState {
  const r = (result ?? {}) as CommandResult;
  let next = s;

  if (r.production) next = { ...next, productions: upsertById(next.productions, r.production) };
  if (r.session) next = { ...next, sessions: upsertById(next.sessions, r.session) };
  if (r.measurement)
    next = { ...next, measurements: mergeMeasurement(next.measurements, r.measurement) };
  if (r.collection) next = { ...next, collections: upsertById(next.collections, r.collection) };
  if (r.animal) next = { ...next, animals: upsertById(next.animals, r.animal) };
  if (r.group) next = { ...next, groups: upsertById(next.groups, r.group) };
  if (r.pasture) next = { ...next, pastures: upsertById(next.pastures, r.pasture) };
  if (r.installation)
    next = { ...next, installations: upsertById(next.installations, r.installation) };
  if (r.feedItem) next = { ...next, feedItems: upsertById(next.feedItems, r.feedItem) };
  if (r.feedEntry) next = { ...next, feedEntries: upsertById(next.feedEntries, r.feedEntry) };
  if (r.feedingEvent)
    next = { ...next, feedingEvents: upsertById(next.feedingEvents, r.feedingEvent) };
  if (r.financialEntry)
    next = { ...next, financialEntries: upsertById(next.financialEntries, r.financialEntry) };
  if (r.farmBoundary) next = { ...next, farmBoundary: r.farmBoundary };
  if (r.capture) next = { ...next, captures: [r.capture, ...next.captures] };
  if (r.proposals) {
    next = r.proposals.reduce(
      (state, proposal) => ({
        ...state,
        proposals: state.proposals.some((p) => p.id === proposal.id)
          ? upsertById(state.proposals, proposal)
          : [proposal, ...state.proposals],
      }),
      next,
    );
  }
  if (r.proposal) {
    next = next.proposals.some((p) => p.id === r.proposal!.id)
      ? { ...next, proposals: upsertById(next.proposals, r.proposal) }
      : { ...next, proposals: [r.proposal, ...next.proposals] };
  }

  // Efeitos colaterais que o servidor aplica na mesma transação e que o
  // cliente reproduz a partir da ação (a data de fechamento vem do comando).
  if (a.type === "ArchiveAnimal") {
    next = {
      ...next,
      assignments: next.assignments.map((x) =>
        x.animalId === a.animalId && x.end === null ? { ...x, end: a.date } : x,
      ),
    };
  }
  if (a.type === "AssignAnimalToGroup") {
    if (r.assignment) next = { ...next, assignments: upsertById(next.assignments, r.assignment) };
    if (r.closedAssignmentId) {
      next = {
        ...next,
        assignments: next.assignments.map((x) =>
          x.id === r.closedAssignmentId
            ? { ...x, end: previousDate(a.date) }
            : x,
        ),
      };
    }
  } else if (r.assignment) {
    next = { ...next, assignments: upsertById(next.assignments, r.assignment) };
  }
  if (a.type === "MoveHerdGroup" && r.occupancy) {
    // O servidor fecha a ocupação aberta do Lote; caso idempotente (o Lote já
    // está no Pasto) devolve a ocupação existente — o upsert cobre os dois.
    next = {
      ...next,
      occupancies: upsertById(
        next.occupancies.map((x) =>
          x.groupId === a.groupId && x.end === null && x.id !== r.occupancy!.id
            ? { ...x, end: a.date }
            : x,
        ),
        r.occupancy,
      ),
    };
  }

  return next;
}
