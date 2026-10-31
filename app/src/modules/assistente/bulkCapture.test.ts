import assert from "node:assert/strict";
import test from "node:test";
import { buildBulkCaptureText, categoryForProposalKinds } from "./bulkCapture";

test("classifica a foto pela Proposta produzida", () => {
  assert.equal(categoryForProposalKinds(["producao_diaria"]), "producao_diaria");
  assert.equal(categoryForProposalKinds(["coleta"]), "coleta");
  assert.equal(categoryForProposalKinds(["controle_leiteiro"]), "controle_leiteiro");
  assert.equal(categoryForProposalKinds(["desconhecida"]), "outro");
});

test("o contexto comum de Controle preserva ausências e a origem humana", () => {
  const text = buildBulkCaptureText({ kind: "controle_leiteiro", date: "2026-10-31", groupName: "Lote A", shift: "manha" }, "folha 2");
  assert.match(text ?? "", /Lote A/);
  assert.match(text ?? "", /2026-10-31/);
  assert.match(text ?? "", /não preencha medições não visíveis/);
  assert.match(text ?? "", /folha 2/);
});

test("sem contexto ou observação não inventa texto", () => {
  assert.equal(buildBulkCaptureText({ kind: "auto" }, "  "), undefined);
});
