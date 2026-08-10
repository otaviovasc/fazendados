import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pasture, PastureOccupancy } from '../types.js';
import { daysSinceLastOccupancy, openOccupancyOfPasture, restBucket, suggestedPasture } from './pasture-rest.js';

const NOW = new Date(Date.parse('2026-08-10T12:00:00Z'));

function pasture(id: string, name = id): Pasture {
  return { id, farmId: 'farm-1', name, polygon: [] };
}

function occupancy(pastureId: string, start: string, end: string | null): PastureOccupancy {
  return { id: `occ-${pastureId}-${start}`, groupId: 'group-1', pastureId, start, end };
}

describe('daysSinceLastOccupancy', () => {
  it('retorna 0 quando o pasto tem ocupação aberta', () => {
    const occ = [occupancy('p1', '2026-08-01', null)];
    assert.equal(daysSinceLastOccupancy('p1', occ, NOW), 0);
  });

  it('conta dias desde o fim da última ocupação fechada', () => {
    const occ = [
      occupancy('p1', '2026-06-01', '2026-06-20'),
      occupancy('p1', '2026-07-01', '2026-08-01'),
    ];
    assert.equal(daysSinceLastOccupancy('p1', occ, NOW), 9);
  });

  it('ignora ocupações de outros pastos', () => {
    const occ = [occupancy('p2', '2026-07-01', '2026-08-01')];
    assert.equal(daysSinceLastOccupancy('p1', occ, NOW), null);
  });

  it('retorna null quando o pasto nunca foi pastejado', () => {
    assert.equal(daysSinceLastOccupancy('p1', [], NOW), null);
  });

  it('não devolve negativo se o fim for "hoje"', () => {
    const occ = [occupancy('p1', '2026-08-09', '2026-08-10')];
    assert.equal(daysSinceLastOccupancy('p1', occ, NOW), 0);
  });

  it('prioriza a ocupação aberta sobre fechadas anteriores', () => {
    const occ = [
      occupancy('p1', '2026-06-01', '2026-06-20'),
      occupancy('p1', '2026-08-01', null),
    ];
    assert.equal(daysSinceLastOccupancy('p1', occ, NOW), 0);
  });
});

describe('openOccupancyOfPasture', () => {
  it('encontra a ocupação aberta e ignora fechadas', () => {
    const occ = [occupancy('p1', '2026-06-01', '2026-06-20'), occupancy('p1', '2026-08-01', null)];
    assert.equal(openOccupancyOfPasture('p1', occ)?.start, '2026-08-01');
    assert.equal(openOccupancyOfPasture('p2', occ), null);
  });
});

describe('restBucket', () => {
  it('mapeia faixas de descanso para o gradiente', () => {
    assert.equal(restBucket(0), 0); // em pastejo
    assert.equal(restBucket(1), 1); // até 1 semana
    assert.equal(restBucket(7), 1);
    assert.equal(restBucket(8), 2); // até 3 semanas
    assert.equal(restBucket(21), 2);
    assert.equal(restBucket(22), 3); // até 1,5 mês
    assert.equal(restBucket(45), 3);
    assert.equal(restBucket(46), 4); // muito descanso
    assert.equal(restBucket(200), 4);
    assert.equal(restBucket(null), 4);
  });

  it('respeita o número de faixas', () => {
    assert.equal(restBucket(200, 3), 2);
    assert.equal(restBucket(null, 3), 2);
  });
});

describe('suggestedPasture', () => {
  it('sugere o pasto livre com maior descanso', () => {
    const pastures = [pasture('p1', 'A'), pasture('p2', 'B'), pasture('p3', 'C')];
    const occ = [
      occupancy('p1', '2026-08-01', null), // ocupado
      occupancy('p2', '2026-07-01', '2026-08-05'), // 5 dias
      occupancy('p3', '2026-06-01', '2026-06-15'), // 56 dias
    ];
    assert.equal(suggestedPasture(pastures, occ, NOW)?.id, 'p3');
  });

  it('prefere pasto nunca pastejado (descanso máximo)', () => {
    const pastures = [pasture('p1', 'A'), pasture('p2', 'B')];
    const occ = [occupancy('p2', '2026-01-01', '2026-01-10')];
    assert.equal(suggestedPasture(pastures, occ, NOW)?.id, 'p1');
  });

  it('retorna null quando todos os pastos estão ocupados', () => {
    const pastures = [pasture('p1'), pasture('p2')];
    const occ = [occupancy('p1', '2026-08-01', null), occupancy('p2', '2026-08-01', null)];
    assert.equal(suggestedPasture(pastures, occ, NOW), null);
  });
});
