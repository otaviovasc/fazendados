import type { AssistantAttachmentCategory, ProposalKind } from "../../domain/types";

export type BulkCaptureContext =
  | { kind: "auto" }
  | { kind: "producao_diaria"; date: string }
  | { kind: "controle_leiteiro"; date: string; groupName: string; shift: "manha" | "tarde" | "unica" };

export function categoryForProposalKinds(kinds: ProposalKind[]): AssistantAttachmentCategory {
  if (kinds.includes("controle_leiteiro")) return "controle_leiteiro";
  if (kinds.includes("producao_diaria")) return "producao_diaria";
  if (kinds.includes("coleta")) return "coleta";
  if (kinds.includes("lancamento_financeiro")) return "financeiro";
  return "outro";
}

export function buildBulkCaptureText(context: BulkCaptureContext, note: string): string | undefined {
  const trimmedNote = note.trim();
  if (context.kind === "auto") return trimmedNote || undefined;
  const contextText = context.kind === "producao_diaria"
    ? `Contexto informado pela pessoa: Produção diária total da Fazenda na data ${context.date}.`
    : `Contexto informado pela pessoa: Controle leiteiro individual do Lote ${context.groupName}, data ${context.date}, turno ${context.shift}. Preserve ausências como ausência; não preencha medições não visíveis.`;
  return [contextText, trimmedNote].filter(Boolean).join(" ");
}
