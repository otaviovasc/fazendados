import assert from "node:assert/strict";
import type { Animal } from "../../domain/types.ts";
import { matchAnimalLabel, normalizeLabel } from "./matching.ts";

const animals: Animal[] = [
  { id: "guilhermina", farmId: "farm_1", name: "Guilhermina", tag: "B-300", status: "ativo" },
  { id: "mimosa", farmId: "farm_1", name: "Mimosa", tag: "42", status: "ativo" },
  { id: "mimosa-dois", farmId: "farm_1", name: "Mimosa II", tag: "43", status: "ativo" },
  { id: "arquivado", farmId: "farm_1", name: "Guilhermina Antiga", tag: "300", status: "arquivado" },
];

// Exato continua tolerante a caixa e acento, inclusive quando vem pelo brinco.
assert.equal(normalizeLabel("  MÍMOSA "), "mimosa");
assert.equal(matchAnimalLabel("mÍmOsA", animals).status, "exata");
assert.equal(matchAnimalLabel("b-300", animals).animal?.id, "guilhermina");
assert.equal(matchAnimalLabel("brinco 300", animals).animal?.id, "guilhermina");

// Dois erros só são aceitos em nome longo e viram sugestão, nunca reconhecimento exato.
const guillemina = matchAnimalLabel("Guillemina", animals);
assert.equal(guillemina.status, "nao");
assert.equal(guillemina.animal, null);
assert.deepEqual(guillemina.suggestions.map((suggestion) => suggestion.animal.id), ["guilhermina"]);
assert.equal(guillemina.suggestions[0]?.via, "nome");

// Nomes não relacionados não recebem sugestão, e a ordenação privilegia a menor distância.
assert.deepEqual(matchAnimalLabel("Jurema", animals).suggestions, []);
const ranked = matchAnimalLabel("Mimosaa", animals);
assert.deepEqual(ranked.suggestions.map((suggestion) => suggestion.animal.id), ["mimosa", "mimosa-dois"]);
assert.ok(ranked.suggestions.length <= 3);

// Mesmo uma associação provável não é exata: a Revisão exige um toque para conferi-la.
const likelyTag = matchAnimalLabel("brinco 42", animals);
assert.equal(likelyTag.status, "provavel");
assert.equal(likelyTag.animal?.id, "mimosa");
assert.notEqual(likelyTag.status, "exata");
