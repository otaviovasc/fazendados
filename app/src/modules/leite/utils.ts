import type {
  FarmState,
  HerdGroup,
  IndividualMilkMeasurement,
  MilkControlSession,
  MilkingShift,
} from "../../domain/types";

/** Turnos de ordenha de um Lote: 2×/dia → manhã e tarde; 1×/dia → ordenha única. */
export function shiftsOf(group: HerdGroup): MilkingShift[] {
  return group.milkingsPerDay === 2 ? ["manha", "tarde"] : ["unica"];
}

/** Sessão de Controle leiteiro de um Lote em uma data e turno (espelha o caderno). */
export function sessionFor(
  s: FarmState,
  groupId: string,
  date: string,
  shift: MilkingShift
): MilkControlSession | undefined {
  return s.sessions.find(
    (x) => x.groupId === groupId && x.date === date && x.shift === shift
  );
}

/** Medição individual de um Animal dentro de uma sessão. */
export function measurementIn(
  s: FarmState,
  sessionId: string,
  animalId: string
): IndividualMilkMeasurement | undefined {
  return s.measurements.find(
    (m) => m.sessionId === sessionId && m.animalId === animalId
  );
}

/**
 * Soma das Medições de uma sessão.
 * null quando não houve nenhuma medição — ausência nunca vira zero.
 */
export function sessionTotal(s: FarmState, sessionId: string): number | null {
  const rows = s.measurements.filter((m) => m.sessionId === sessionId);
  if (rows.length === 0) return null;
  return Math.round(rows.reduce((acc, m) => acc + m.liters, 0) * 10) / 10;
}
