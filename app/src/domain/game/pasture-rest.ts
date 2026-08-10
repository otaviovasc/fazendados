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

/**
 * Faixa de descanso para o gradiente do tabuleiro: 0 = em pastejo (ocupado
 * ou descanso desde hoje) … `buckets - 1` = muitos dias de descanso. Pasto
 * nunca pastejado cai na última faixa (máximo descanso conhecido). As faixas
 * casam com os rótulos da legenda (tokens.ts): em pastejo, até 1 semana
 * (1–7d), até 3 semanas (8–21d), até 1,5 mês (22–45d), muito descanso (46d+).
 */
export function restBucket(days: number | null, buckets = 5): number {
  if (days === null) return buckets - 1;
  if (days <= 0) return 0;
  const step = [0, 1, 8, 22, 46]; // limites inferiores de cada faixa (dias)
  let bucket = 0;
  for (let index = 0; index < Math.min(step.length, buckets); index += 1) {
    if (days >= step[index]) bucket = index;
  }
  return Math.min(bucket, buckets - 1);
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
