import assert from "node:assert/strict";
import type {
  Animal,
  AnimalGroupAssignment,
  HerdGroup,
} from "../../domain/types.ts";
import {
  assignmentOnDate,
  assignmentReview,
  exactAnimalDuplicate,
} from "./reviewLogic.ts";

const groups: HerdGroup[] = [
  { id: "lote-1", farmId: "farm-1", name: "Lote 1", milkingsPerDay: 2 },
  { id: "lote-2", farmId: "farm-1", name: "Lote 2", milkingsPerDay: 2 },
];
const assignments: AnimalGroupAssignment[] = [
  {
    id: "old",
    animalId: "animal-1",
    groupId: "lote-1",
    start: "2026-07-01",
    end: "2026-07-27",
  },
  {
    id: "current",
    animalId: "animal-1",
    groupId: "lote-2",
    start: "2026-07-28",
    end: null,
  },
];

assert.equal(assignmentOnDate(assignments, "animal-1", "2026-07-27")?.id, "old");
assert.equal(assignmentOnDate(assignments, "animal-1", "2026-07-28")?.id, "current");
assert.equal(assignmentOnDate(assignments, "animal-1", "invalid"), null);
assert.equal(
  assignmentReview(assignments, groups, "animal-1", groups[0], "2026-07-28")
    .needsDecision,
  true,
);
assert.equal(
  assignmentReview(assignments, groups, "animal-1", groups[1], "2026-07-28")
    .needsDecision,
  false,
);

const animals: Animal[] = [
  {
    id: "guilhermina",
    farmId: "farm-1",
    name: "Guilhermina",
    tag: "001",
    status: "ativo",
  },
];

assert.equal(exactAnimalDuplicate(animals, "Guilhérmina", "")?.id, "guilhermina");
assert.equal(exactAnimalDuplicate(animals, "Outra", "001")?.id, "guilhermina");
assert.equal(exactAnimalDuplicate(animals, "Guilhermina", "002"), undefined);
