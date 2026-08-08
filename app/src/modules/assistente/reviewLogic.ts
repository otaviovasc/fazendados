import type {
  Animal,
  AnimalGroupAssignment,
  HerdGroup,
} from "../../domain/types";
import { normalizeLabel } from "./matching";

export interface AssignmentReview {
  currentGroup: HerdGroup | null;
  needsDecision: boolean;
  decisionKey: string | null;
}

/** Mantém a Revisão alinhada ao contrato aceito pelo comando no servidor. */
export function milkControlFieldIsValid(
  key: string,
  value: string,
  targetGroup: HerdGroup | undefined,
): boolean {
  if (key === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (key === "group") {
    return Boolean(
      targetGroup && normalizeLabel(value) === normalizeLabel(targetGroup.name),
    );
  }
  if (key !== "shift") return true;
  if (!targetGroup) return false;

  const shift = normalizeLabel(value);
  return targetGroup.milkingsPerDay === 1
    ? shift === "unica" || shift === "ordenha unica"
    : shift === "manha" || shift === "tarde";
}

/** A Lotação inclui as datas `start` e `end`. */
export function assignmentOnDate(
  assignments: AnimalGroupAssignment[],
  animalId: string,
  date: string,
): AnimalGroupAssignment | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const matches = assignments
    .filter(
      (assignment) =>
        assignment.animalId === animalId &&
        assignment.start <= date &&
        (assignment.end === null || assignment.end >= date),
    )
    .sort((left, right) => right.start.localeCompare(left.start));

  return matches[0] ?? null;
}

export function assignmentReview(
  assignments: AnimalGroupAssignment[],
  groups: HerdGroup[],
  animalId: string | null,
  targetGroup: HerdGroup | undefined,
  date: string,
): AssignmentReview {
  if (!animalId || !targetGroup || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { currentGroup: null, needsDecision: false, decisionKey: null };
  }

  const assignment = assignmentOnDate(assignments, animalId, date);
  const currentGroup = assignment
    ? groups.find((group) => group.id === assignment.groupId) ?? null
    : null;

  return {
    currentGroup,
    needsDecision: assignment?.groupId !== targetGroup.id,
    decisionKey: `${animalId}:${targetGroup.id}:${date}`,
  };
}

/**
 * Espelha a proteção do comando: brinco igual sempre bloqueia; nome igual
 * bloqueia quando não há dois brincos distintos para diferenciar os Animais.
 */
export function exactAnimalDuplicate(
  animals: Animal[],
  name: string,
  tag: string,
): Animal | undefined {
  const normalizedName = normalizeLabel(name);
  const normalizedTag = normalizeLabel(tag);
  if (!normalizedName && !normalizedTag) return undefined;

  return animals.find((animal) => {
    if (animal.status !== "ativo") return false;
    const existingTag = normalizeLabel(animal.tag ?? "");
    if (normalizedTag && existingTag === normalizedTag) return true;
    if (normalizeLabel(animal.name) !== normalizedName) return false;
    return !(normalizedTag && existingTag && normalizedTag !== existingTag);
  });
}
