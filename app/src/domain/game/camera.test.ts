import assert from "node:assert/strict";
import {
  CAMERA_MAX_SCALE,
  CAMERA_MIN_SCALE,
  clampCamera,
} from "./camera.js";

// Escala limitada ao intervalo [1, 4].
assert.equal(clampCamera({ x: 0, y: 0, scale: 0.5 }, 1000, 800).scale, CAMERA_MIN_SCALE);
assert.equal(clampCamera({ x: 0, y: 0, scale: 10 }, 1000, 800).scale, CAMERA_MAX_SCALE);

// Com escala 1 o pan fica travado em (0,0) — não existe "sair do mapa".
assert.deepEqual(clampCamera({ x: -50, y: 30, scale: 1 }, 1000, 800), {
  x: 0,
  y: 0,
  scale: 1,
});

// Ampliando, o alcance do pan cresce até view * (scale - 1), nunca além.
const zoomed = clampCamera({ x: -5000, y: 400, scale: 2 }, 1000, 800);
assert.equal(zoomed.x, -1000, "pan travado no limite esquerdo");
assert.equal(zoomed.y, 0, "pan não sobe além do topo");

// Pan dentro do alcance é preservado.
assert.deepEqual(clampCamera({ x: -300, y: -200, scale: 2 }, 1000, 800), {
  x: -300,
  y: -200,
  scale: 2,
});

// Viewport maior que o conteúdo com escala mínima: ainda trava em (0,0).
assert.deepEqual(clampCamera({ x: -10, y: -10, scale: 1 }, 500, 400), {
  x: 0,
  y: 0,
  scale: 1,
});
