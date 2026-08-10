import assert from "node:assert/strict";
import { herdClusterLayout, herdGrazeMotion } from "./herd-layout.js";
import { pointInPolygon, type Vec } from "./geometry.js";

// Pasto quadrado de 100x100 no espaço projetado.
const pasture: Vec[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

// Determinismo: mesmo seed → mesmas posições.
const first = herdClusterLayout(pasture, 5, "lote-1");
const again = herdClusterLayout(pasture, 5, "lote-1");
assert.deepEqual(first, again);

// Seeds diferentes → posições diferentes.
const other = herdClusterLayout(pasture, 5, "lote-2");
assert.notDeepEqual(first, other);

// Cap de sprites: pedir 30 vacas renderiza no máximo 8.
assert.equal(herdClusterLayout(pasture, 30, "lote-1").length, 8);
assert.equal(herdClusterLayout(pasture, 3, "lote-1").length, 3);
assert.equal(herdClusterLayout(pasture, 30, "lote-1", 5).length, 5);

// Todos os pontos caem dentro do pasto.
for (const point of herdClusterLayout(pasture, 8, "lote-3")) {
  assert.ok(pointInPolygon(point, pasture), `ponto ${point.x},${point.y} dentro do pasto`);
}

// Casos degenerados.
assert.deepEqual(herdClusterLayout(pasture, 0, "lote-1"), []);
assert.deepEqual(herdClusterLayout([], 3, "lote-1"), []);

// Pasto fino demais para amostrar: degrada para o centroide/vértice.
const thin: Vec[] = [
  { x: 0, y: 0 },
  { x: 0.0001, y: 0 },
  { x: 0.0001, y: 100 },
  { x: 0, y: 100 },
];
assert.equal(herdClusterLayout(thin, 4, "lote-1").length, 4);

// GrazeMotion: determinístico e dentro dos limites.
const motion = herdGrazeMotion("lote-1", 3);
assert.deepEqual(motion, herdGrazeMotion("lote-1", 3));
assert.equal(motion.length, 3);
for (const m of motion) {
  assert.ok(Math.abs(m.dx) <= 12 && Math.abs(m.dy) <= 12);
  assert.ok(m.durationMs >= 9000 && m.durationMs <= 17000);
  assert.ok(m.delayMs <= 0 && m.delayMs >= -17000);
}
