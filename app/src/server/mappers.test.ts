import assert from "node:assert/strict";
import test from "node:test";
import { toCaptureAttachment } from "./mappers.js";

test("não expõe a chave privada do anexo no DTO do cliente", () => {
  const dto = toCaptureAttachment({
    id: "att_1",
    farmId: "farm_1",
    captureId: "cap_1",
    sourceAttachmentId: null,
    kind: "documento",
    name: "nota.pdf",
    category: "nota_fiscal",
    storageKey: "private/farm_1/cap_1/att_1.pdf",
    mimeType: "application/pdf",
    byteSize: 42,
    durationMs: null,
    createdAt: new Date("2026-08-07T12:00:00.000Z"),
    updatedAt: new Date("2026-08-07T12:00:00.000Z"),
    deletedAt: null,
  } as never);

  assert.equal(dto.name, "nota.pdf");
  assert.equal("storageKey" in dto, false);
});
