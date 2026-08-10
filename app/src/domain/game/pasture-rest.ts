import type { ISODate, Pasture, PastureOccupancy } from '../types.js';

/**
 * Descanso do pasto, derivado no cliente a partir das Ocupações. Nada aqui
 * toca o servidor: mesma regra usada pelo tabuleiro (cores) e pela folha do
 * pasto (sugestão de rodízio), então os dois nunca divergem.
 *
 * Convenções:
 * - Pasto com ocupação ABERTA está em pastejo: descanso = 0.
 * - Pasto sem nenhuma ocupação fechada retorna null ("nunca pastejado") —
 *   ausência não vira número; a UI decide como mostrar.
 */

const MS_PER_DAY = 86_400_000;

function dateValue(date: ISODate): number {
  // Meio-dia UTC evita surpresa de fuso na diferença entre datas civis.
  return Date.parse(`${date}T12:00:00Z`);
}

/** Dias completos desde o fim da última ocupação FECHADA do pasto; 0 se ocupado; null se nunca pastejado. */
export function daysSinceLastOccupancy(
  pastureId: string,
  occupancies: PastureOccupancy[],
  now: Date = new Date(),
): number | null {
  const open = occupancies.some((o) => o.pastureId === pastureId && o.end === null);
  if (open) return 0;
  const ends = occupancies
    .filter((o) => o.pastureId === pastureId && o.end !== null)
    .map((o) => dateValue(o.end as ISODate));
  if (ends.length === 0) return null;
  const last = Math.max(...ends);
  return Math.max(0, Math.floor((now.getTime() - last) / MS_PER_DAY));
}

/** Ocupação aberta de um pasto (máx. 1 pela regra 1:1), ou null. */
export function openOccupancyOfPasture(
  pastureId: string,
  occupancies: PastureOccupancy[],
): PastureOccupancy | null {
  return occupancies.find((o) => o.pastureId === pastureId && o.end === null) ?? null;
}

/** Dias completos desde o início da ocupação ABERTA do pasto; null se livre. */
export function occupationDays(
  pastureId: string,
  occupancies: PastureOccupancy[],
  now: Date = new Date(),
): number | null {
  const open = openOccupancyOfPasture(pastureId, occupancies);
  if (!open) return null;
  return Math.max(0, Math.floor((now.getTime() - dateValue(open.start)) / MS_PER_DAY));
}

export type PastureVisualState = 'occupied' | 'resting' | 'never';

export interface PastureVisual {
  state: PastureVisualState;
  /** Dias de ocupação (occupied) ou de descanso (resting); null quando nunca pastejado. */
  days: number | null;
  /** Faixa 0..3 dentro do eixo (ver a regra abaixo). */
  bucket: number;
}

/**
 * Faixa visual do pasto no tabuleiro, com a semântica agronômica do pastejo —
 * os dois eixos têm gradientes próprios (tokens.ts):
 * - OCUPADO: começa verde e marronheia quanto mais tempo o Lote fica no pasto
 *   (capim sendo comido): 0–7d → 0, 8–14d → 1, 15–21d → 2, 22d+ → 3.
 * - LIVRE (descanso): começa marrom (recém-saído, capim comido) e esverdeia
 *   com a rebrota: 0–7d → 0, 8–21d → 1, 22–45d → 2, 46d+ → 3.
 * - Nunca pastejado: capim intocado, verde profundo (última faixa do descanso).
 */
export function pastureBucket(
  pastureId: string,
  occupancies: PastureOccupancy[],
  now: Date = new Date(),
): PastureVisual {
  const occupied = occupationDays(pastureId, occupancies, now);
  if (occupied !== null) {
    const bucket = occupied <= 7 ? 0 : occupied <= 14 ? 1 : occupied <= 21 ? 2 : 3;
    return { state: 'occupied', days: occupied, bucket };
  }
  const rest = daysSinceLastOccupancy(pastureId, occupancies, now);
  if (rest === null) return { state: 'never', days: null, bucket: 3 };
  const bucket = rest <= 7 ? 0 : rest <= 21 ? 1 : rest <= 45 ? 2 : 3;
  return { state: 'resting', days: rest, bucket };
}

/**
 * Rótulo de descanso do pasto — formatador único usado pelo tabuleiro, pela
 * folha do pasto e pelo mapa utilitário. Segue as convenções do domínio:
 * 0 = em pastejo (ocupado) ou descanso desde hoje; null = nunca pastejado.
 */
export function restLabel(days: number | null): string {
  if (days === null) return 'sem ocupação registrada';
  if (days === 0) return 'em descanso desde hoje';
  return `em descanso há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/**
 * Pasto sugerido para o próximo rodízio: o LIVRE com maior descanso. Pastos
 * nunca pastejados contam como descanso infinito (entram primeiro). Empate:
 * ordem estável pelo nome. Retorna null se não houver pasto livre.
 */
export function suggestedPasture(
  pastures: Pasture[],
  occupancies: PastureOccupancy[],
  now: Date = new Date(),
): Pasture | null {
  const free = pastures.filter((p) => openOccupancyOfPasture(p.id, occupancies) === null);
  if (free.length === 0) return null;
  const scored = free.map((p) => ({ pasture: p, days: daysSinceLastOccupancy(p.id, occupancies, now) }));
  scored.sort((a, b) => {
    const da = a.days === null ? Infinity : a.days;
    const db = b.days === null ? Infinity : b.days;
    if (db !== da) return db - da;
    return a.pasture.name.localeCompare(b.pasture.name);
  });
  return scored[0].pasture;
}
