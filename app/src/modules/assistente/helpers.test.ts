import assert from "node:assert/strict";
import type { FarmState } from "../../domain/types";
import { captureImageReferences, confirmedHistorySummary, formatWhen, sortAssistantHistory } from "./helpers.ts";

const capture = {
  id: "cap_1",
  farmId: "farm_1",
  text: null,
  extractedText: "produção 320 litros",
  createdAt: "2026-08-04T10:00:00.000Z",
  attachments: [
    { id: "media_img", kind: "imagem" as const, farmId: "farm_1", captureId: "cap_1", storageKey: "private/a", mimeType: "image/jpeg", byteSize: 120, createdAt: "2026-08-04T10:00:00.000Z" },
    { id: "media_doc", kind: "documento" as const, farmId: "farm_1", captureId: "cap_1", storageKey: "private/b", mimeType: "application/pdf", byteSize: 120, createdAt: "2026-08-04T10:00:00.000Z" },
  ],
};

assert.deepEqual(captureImageReferences(capture), ["media_img"]);
assert.deepEqual(captureImageReferences({ ...capture, attachments: undefined }), []);
assert.match(formatWhen("2000-08-04T00:00:00.000Z"), /03\/08.*21:00/);

const state = {
  captures: [
    { ...capture, id: "cap_old", createdAt: "2026-08-03T10:00:00.000Z" },
    { ...capture, id: "cap_new", createdAt: "2026-08-04T10:00:00.000Z" },
  ],
  proposals: [],
  productions: [{ id: "pd_new", farmId: "farm_1", date: "2026-08-04", liters: 320, origin: "assistente" as const }],
  sessions: [],
  measurements: [],
  collections: [],
  groups: [],
  feedingEvents: [],
  financialEntries: [],
  audit: [],
} as unknown as FarmState;

const older = {
  id: "prop_old",
  captureId: "cap_old",
  kind: "producao_diaria" as const,
  title: "old",
  fields: [],
  consequences: [],
  issues: [],
  status: "confirmada" as const,
  confirmedRecordIds: [],
};
const newer = {
  ...older,
  id: "prop_new",
  captureId: "cap_new",
  confirmedRecordIds: ["pd_new"],
};

assert.deepEqual(sortAssistantHistory(state, [older, newer]).map((proposal) => proposal.id), ["prop_new", "prop_old"]);
assert.equal(confirmedHistorySummary(state, newer).detail, "04 de ago. de 2026 · 320,0 L");

state.groups.push({ id: "group_1", farmId: "farm_1", name: "Lote A", milkingsPerDay: 2 });
state.sessions.push({ id: "cs_1", farmId: "farm_1", date: "2026-08-04", groupId: "group_1", shift: "tarde", status: "concluido", origin: "assistente" });
state.measurements.push({ id: "mm_1", sessionId: "cs_1", animalId: "animal_1", liters: 7.5 });
const control = {
  ...older,
  id: "prop_control",
  captureId: "cap_new",
  kind: "controle_leiteiro" as const,
  confirmedRecordIds: ["cs_1", "mm_1"],
};
const controlSummary = confirmedHistorySummary(state, control);
assert.equal(controlSummary.control?.path, "/leite/controle?date=2026-08-04&groupId=group_1");
assert.match(controlSummary.detail, /Lote A.*Tarde.*7,5 L/);
