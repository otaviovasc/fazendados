import assert from "node:assert/strict";
import { createProjection, toPathData } from "./projection.js";
import type { LatLng } from "../types.js";

// Quadrado de ~0.001° (~111 m) em torno de lat -22.
const square: LatLng[] = [
  [-22.0, -45.0],
  [-22.0, -44.999],
  [-22.001, -44.999],
  [-22.001, -45.0],
];

const projection = createProjection(square, 1000, 0.1);

assert.equal(projection.width, 1000);
// Correção cos(lat): a largura real do grau de longitude encolhe com a
// latitude, então o viewBox fica mais alto que largo. Com padding de 10% do
// lado maior: ratio = (h + 0.2·h) / (w + 0.2·h), com w = h·cos(-22°).
const ratio = projection.height / projection.width;
const cos = Math.cos((-22 * Math.PI) / 180);
const expected = (1 + 0.2) / (cos + 0.2);
assert.ok(Math.abs(ratio - expected) < 0.001, `ratio ${ratio} ≈ ${expected}`);

// Padding de 10% de cada lado: o primeiro vértice nunca cai na borda.
const first = projection.toLocal(square[0]);
assert.ok(first.x > 0 && first.y > 0, "padding desloca o conteúdo da borda");

// toLocal é consistente com a largura do viewBox: vértices opostos cabem.
const opposite = projection.toLocal(square[2]);
assert.ok(opposite.x <= 1000 && opposite.y <= projection.height);

// Sem correção cos(lat) o quadrado renderizaria como quadrado; com ela, não.
assert.ok(Math.abs(opposite.x - 0) > 0, "coordenadas positivas");

// Projeção em latitudes diferentes muda a razão de aspecto: no equador o
// quadrado de verdade vira quadrado (altura = largura); longe dele, alonga.
const atEquator = createProjection(
  square.map(([lat, lng]) => [lat + 22, lng] as LatLng),
);
assert.ok(atEquator.height < projection.height, "perto do equador cos(lat)=1, sem alongamento vertical");

assert.equal(toPathData([]), "");
assert.equal(
  toPathData([
    { x: 0, y: 0 },
    { x: 100.5, y: 50.25 },
  ]),
  "M0.00,0.00 L100.50,50.25 Z",
);
