import assert from "node:assert/strict";
import { captureImageReferences } from "./helpers.ts";

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
