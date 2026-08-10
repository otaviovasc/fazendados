import type {
  FarmState,
  InstallationType,
  PastureOccupancy,
} from "../../domain/types";
import {
  daysSinceLastOccupancy,
  openOccupancyOfPasture as openOccupancyOfPastureDomain,
  restLabel,
} from "../../domain/game/pasture-rest";

// ---------- Seletores de ocupação de pasto ----------
// A regra de ocupação/descanso vive no domínio (domain/game/pasture-rest);
// aqui ficam só os adaptadores com a assinatura que o mapa já consumia.

/** Ocupação aberta (1:1) de um pasto, se houver. */
export function openOccupancyOfPasture(
  s: FarmState,
  pastureId: string
): PastureOccupancy | null {
  return openOccupancyOfPastureDomain(pastureId, s.occupancies);
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

/**
 * "em descanso há N dias", "em descanso desde hoje" ou "sem ocupação
 * registrada". Pasto ocupado (ocupação aberta) conta como descanso 0 —
 * a semântica é a do domínio, não a de "última ocupação fechada".
 */
export function restingLabel(s: FarmState, pastureId: string): string {
  return restLabel(daysSinceLastOccupancy(pastureId, s.occupancies));
}

// ---------- Rótulos ----------

export const INSTALLATION_TYPE_LABEL: Record<InstallationType, string> = {
  curral: "Curral",
  tanque: "Tanque",
  deposito: "Depósito",
  outro: "Outro",
};
