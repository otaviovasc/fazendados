import type {
  FarmState,
  ISODate,
  InstallationType,
  PastureOccupancy,
} from "../../domain/types";
import { today } from "../../lib/dates";

// ---------- Seletores de ocupação de pasto ----------

/** Ocupação aberta (1:1) de um pasto, se houver. */
export function openOccupancyOfPasture(
  s: FarmState,
  pastureId: string
): PastureOccupancy | null {
  return (
    s.occupancies.find((o) => o.pastureId === pastureId && o.end === null) ??
    null
  );
}

/** Todas as ocupações de um pasto, mais recentes primeiro. */
export function occupanciesOfPasture(
  s: FarmState,
  pastureId: string
): PastureOccupancy[] {
  return s.occupancies
    .filter((o) => o.pastureId === pastureId)
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** Última ocupação encerrada do pasto (base do cálculo de descanso). */
export function lastEndedOccupancy(
  s: FarmState,
  pastureId: string
): PastureOccupancy | null {
  const ended = occupanciesOfPasture(s, pastureId).filter((o) => o.end !== null);
  ended.sort((a, b) => (b.end as string).localeCompare(a.end as string));
  return ended[0] ?? null;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "em descanso há N dias" ou "sem ocupação registrada". */
export function restingLabel(s: FarmState, pastureId: string): string {
  const last = lastEndedOccupancy(s, pastureId);
  if (!last || !last.end) return "sem ocupação registrada";
  const n = daysBetween(last.end, today());
  if (n <= 0) return "em descanso desde hoje";
  return `em descanso há ${n} ${n === 1 ? "dia" : "dias"}`;
}

// ---------- Rótulos ----------

export const INSTALLATION_TYPE_LABEL: Record<InstallationType, string> = {
  curral: "Curral",
  tanque: "Tanque",
  deposito: "Depósito",
  outro: "Outro",
};
