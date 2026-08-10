import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Pasture, PastureOccupancy } from '../types.js';
import { daysSinceLastOccupancy, occupationDays, openOccupancyOfPasture, pastureBucket, suggestedPasture } from './pasture-rest.js';

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

describe('occupationDays', () => {
  it('conta dias desde o início da ocupação aberta', () => {
    const occ = [occupancy('p1', '2026-08-01', null)];
    assert.equal(occupationDays('p1', occ, NOW), 9);
  });

  it('retorna null quando o pasto está livre', () => {
    const occ = [occupancy('p1', '2026-07-01', '2026-08-01')];
    assert.equal(occupationDays('p1', occ, NOW), null);
    assert.equal(occupationDays('p1', [], NOW), null);
  });

  it('não devolve negativo se a ocupação começou hoje', () => {
    const occ = [occupancy('p1', '2026-08-10', null)];
    assert.equal(occupationDays('p1', occ, NOW), 0);
  });

  it('ignora ocupações de outros pastos', () => {
    const occ = [occupancy('p2', '2026-08-01', null)];
    assert.equal(occupationDays('p1', occ, NOW), null);
  });
});

describe('pastureBucket', () => {
  it('pasto ocupado marronheia com os dias de pastejo', () => {
    const mk = (start: string) => [occupancy('p1', start, null)];
    assert.deepEqual(pastureBucket('p1', mk('2026-08-10'), NOW), { state: 'occupied', days: 0, bucket: 0 });
    assert.deepEqual(pastureBucket('p1', mk('2026-08-03'), NOW), { state: 'occupied', days: 7, bucket: 0 });
    assert.deepEqual(pastureBucket('p1', mk('2026-08-02'), NOW), { state: 'occupied', days: 8, bucket: 1 });
    assert.deepEqual(pastureBucket('p1', mk('2026-07-27'), NOW), { state: 'occupied', days: 14, bucket: 1 });
    assert.deepEqual(pastureBucket('p1', mk('2026-07-26'), NOW), { state: 'occupied', days: 15, bucket: 2 });
    assert.deepEqual(pastureBucket('p1', mk('2026-07-20'), NOW), { state: 'occupied', days: 21, bucket: 2 });
    assert.deepEqual(pastureBucket('p1', mk('2026-07-19'), NOW), { state: 'occupied', days: 22, bucket: 3 });
    assert.equal(pastureBucket('p1', mk('2026-01-01'), NOW).bucket, 3);
  });

  it('pasto livre esverdeia com os dias de descanso', () => {
    const mk = (end: string) => [occupancy('p1', '2026-01-01', end)];
    assert.deepEqual(pastureBucket('p1', mk('2026-08-10'), NOW), { state: 'resting', days: 0, bucket: 0 });
    assert.deepEqual(pastureBucket('p1', mk('2026-08-03'), NOW), { state: 'resting', days: 7, bucket: 0 });
    assert.deepEqual(pastureBucket('p1', mk('2026-08-02'), NOW), { state: 'resting', days: 8, bucket: 1 });
    assert.deepEqual(pastureBucket('p1', mk('2026-07-20'), NOW), { state: 'resting', days: 21, bucket: 1 });
    assert.deepEqual(pastureBucket('p1', mk('2026-07-19'), NOW), { state: 'resting', days: 22, bucket: 2 });
    assert.deepEqual(pastureBucket('p1', mk('2026-06-26'), NOW), { state: 'resting', days: 45, bucket: 2 });
    assert.deepEqual(pastureBucket('p1', mk('2026-06-25'), NOW), { state: 'resting', days: 46, bucket: 3 });
  });

  it('pasto nunca pastejado é verde profundo (capim intocado)', () => {
    assert.deepEqual(pastureBucket('p1', [], NOW), { state: 'never', days: null, bucket: 3 });
  });

  it('prioriza a ocupação aberta sobre fechadas anteriores', () => {
    const occ = [
      occupancy('p1', '2026-06-01', '2026-06-20'),
      occupancy('p1', '2026-08-01', null),
    ];
    assert.deepEqual(pastureBucket('p1', occ, NOW), { state: 'occupied', days: 9, bucket: 1 });
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
